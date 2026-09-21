$ErrorActionPreference = 'Stop'

$source = @"
using System;
using System.Runtime.InteropServices;

public static class Wc3CascNative
{
    public const uint CASC_LOCALE_ALL = 0xFFFFFFFF;
    public const uint CASC_OPEN_BY_NAME = 0x00000000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool SetDllDirectory(string lpPathName);

    [DllImport("CascLib.dll", CharSet = CharSet.Ansi, CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern bool CascOpenStorage(string szParams, uint dwLocaleMask, out IntPtr phStorage);

    [DllImport("CascLib.dll", CharSet = CharSet.Ansi, CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern bool CascOpenFile(IntPtr hStorage, string pvFileName, uint dwLocaleFlags, uint dwOpenFlags, out IntPtr phFile);

    [DllImport("CascLib.dll", CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern uint CascGetFileSize(IntPtr hFile, out uint pdwFileSizeHigh);

    [DllImport("CascLib.dll", CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern bool CascReadFile(IntPtr hFile, byte[] lpBuffer, uint dwToRead, out uint pdwRead);

    [DllImport("CascLib.dll", CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern bool CascCloseFile(IntPtr hFile);

    [DllImport("CascLib.dll", CallingConvention = CallingConvention.Winapi, SetLastError = true)]
    public static extern bool CascCloseStorage(IntPtr hStorage);

    public static byte[] TryRead(IntPtr storage, string name)
    {
        IntPtr file;
        if (!CascOpenFile(storage, name, CASC_LOCALE_ALL, CASC_OPEN_BY_NAME, out file) || file == IntPtr.Zero)
            return null;
        try
        {
            uint high;
            uint size = CascGetFileSize(file, out high);
            if (size == 0 || size == UInt32.MaxValue || high != 0 || size > 134217728)
                return null;
            byte[] output = new byte[size];
            uint offset = 0;
            while (offset < size)
            {
                uint want = Math.Min(size - offset, 4u * 1024u * 1024u);
                byte[] chunk = new byte[want];
                uint read;
                if (!CascReadFile(file, chunk, want, out read) || read == 0) break;
                Buffer.BlockCopy(chunk, 0, output, (int)offset, (int)read);
                offset += read;
            }
            if (offset != size) return null;
            return output;
        }
        finally { CascCloseFile(file); }
    }
}
"@

function Trace-Casc([string]$Message) {
    [Console]::Error.WriteLine("CASC_STAGE " + $Message)
}

Add-Type -TypeDefinition $source -Language CSharp
# The Electron main process starts this helper with its working directory set
# to the folder that contains CascLib.dll. Make that directory explicit in the
# native DLL search path before the first CascLib P/Invoke.
[void][Wc3CascNative]::SetDllDirectory((Get-Location).Path)

$payloadText = [Console]::In.ReadToEnd()
$payload = $payloadText | ConvertFrom-Json
$storageParam = [string]$payload.storageParam
$probeOnly = [bool]$payload.probeOnly
$storage = [IntPtr]::Zero

if ([string]::IsNullOrWhiteSpace($storageParam)) {
    throw "Missing CASC storage parameter."
}

# IMPORTANT: open exactly one storage parameter in this process. A native
# CascLib failure such as 0xC0000409 terminates the entire PowerShell process,
# so fallback candidates are tried by Electron in separate child processes.
# This lets one product spelling fail without killing the entire lookup.
# Electron probes the documented *w3/*w3t form first, then legacy fallbacks.
try {
    $dllFile = Join-Path (Get-Location).Path "CascLib.dll"
    $dllInfo = Get-Item -LiteralPath $dllFile -ErrorAction Stop
    Trace-Casc ("runtime process64=" + [Environment]::Is64BitProcess + " os64=" + [Environment]::Is64BitOperatingSystem + " ps=" + $PSVersionTable.PSVersion.ToString())
    Trace-Casc ("dll path=" + $dllInfo.FullName + " bytes=" + $dllInfo.Length + " version=" + $dllInfo.VersionInfo.FileVersion)
} catch {
    Trace-Casc ("runtime diagnostics unavailable: " + $_.Exception.Message)
}
Trace-Casc ("open " + $storageParam)
if (-not [Wc3CascNative]::CascOpenStorage($storageParam, [Wc3CascNative]::CASC_LOCALE_ALL, [ref]$storage) -or $storage -eq [IntPtr]::Zero) {
    $win32 = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Could not open Warcraft III CASC storage '$storageParam' (CascLib/Win32 error $win32)."
}
Trace-Casc "opened"

try {
    if ($probeOnly) {
        [PSCustomObject]@{ probe = $true; storageParam = $storageParam; results = @() } | ConvertTo-Json -Compress -Depth 4
        return
    }

    $results = @()
    foreach ($request in @($payload.requests)) {
        $requestId = [int]$request.id
        $found = $false
        foreach ($candidate in @($request.candidates)) {
            $candidateText = [string]$candidate
            Trace-Casc ("read id=" + $requestId + " path=" + $candidateText)
            $bytes = [Wc3CascNative]::TryRead($storage, $candidateText)
            if ($null -ne $bytes -and $bytes.Length -gt 0) {
                Trace-Casc ("read-ok id=" + $requestId + " bytes=" + $bytes.Length)
                $results += [PSCustomObject]@{
                    id = $requestId
                    path = $candidateText
                    size = [int]$bytes.Length
                    base64 = [Convert]::ToBase64String($bytes)
                }
                $found = $true
                break
            }
        }
        if (-not $found) {
            Trace-Casc ("missing id=" + $requestId)
            $results += [PSCustomObject]@{ id = $requestId; path = ''; size = 0; base64 = '' }
        }
    }
    [PSCustomObject]@{ storageParam = $storageParam; results = $results } | ConvertTo-Json -Compress -Depth 5
}
finally {
    if ($storage -ne [IntPtr]::Zero) {
        Trace-Casc "close"
        [void][Wc3CascNative]::CascCloseStorage($storage)
        Trace-Casc "closed"
    }
}

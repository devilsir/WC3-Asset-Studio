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

Add-Type -TypeDefinition $source -Language CSharp
# The Electron main process starts this helper with its working directory set
# to the folder that contains CascLib.dll. Make that directory explicit in the
# native DLL search path before the first CascLib P/Invoke.
[void][Wc3CascNative]::SetDllDirectory((Get-Location).Path)
$payloadText = [Console]::In.ReadToEnd()
$payload = $payloadText | ConvertFrom-Json
$installPath = [string]$payload.installPath
$storage = [IntPtr]::Zero

if (-not [Wc3CascNative]::CascOpenStorage($installPath, [Wc3CascNative]::CASC_LOCALE_ALL, [ref]$storage) -or $storage -eq [IntPtr]::Zero) {
    $storage = [IntPtr]::Zero
    if (-not [Wc3CascNative]::CascOpenStorage(($installPath + ':w3'), [Wc3CascNative]::CASC_LOCALE_ALL, [ref]$storage) -or $storage -eq [IntPtr]::Zero) {
        throw "Could not open Warcraft III CASC storage at '$installPath'."
    }
}

try {
    $results = @()
    foreach ($request in @($payload.requests)) {
        $found = $false
        foreach ($candidate in @($request.candidates)) {
            $bytes = [Wc3CascNative]::TryRead($storage, [string]$candidate)
            if ($null -ne $bytes -and $bytes.Length -gt 0) {
                $results += [PSCustomObject]@{
                    id = [int]$request.id
                    path = [string]$candidate
                    size = [int]$bytes.Length
                    base64 = [Convert]::ToBase64String($bytes)
                }
                $found = $true
                break
            }
        }
        if (-not $found) {
            $results += [PSCustomObject]@{ id = [int]$request.id; path = ''; size = 0; base64 = '' }
        }
    }
    [PSCustomObject]@{ results = $results } | ConvertTo-Json -Compress -Depth 5
}
finally {
    if ($storage -ne [IntPtr]::Zero) { [void][Wc3CascNative]::CascCloseStorage($storage) }
}

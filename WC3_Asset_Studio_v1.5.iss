#define MyAppName "WC3 Asset Studio"
#define MyAppVersion "1.5"
#define MyAppPublisher "DarkSir#1620"
#define MyAppExeName "WC3 Asset Studio.exe"

[Setup]
AppId={{D57E92E4-A72C-4D2C-A5E7-5A805A5B5711}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\WC3 Asset Studio
DefaultGroupName=WC3 Asset Studio
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=WC3 Asset Studio v1.5 Setup
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
ChangesAssociations=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
VersionInfoVersion=1.5.0.0
VersionInfoProductName=WC3 Asset Studio
VersionInfoDescription=WC3 Asset Studio Installer
VersionInfoCompany={#MyAppPublisher}
LicenseFile=source\LICENSE

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "source\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\WC3 Asset Studio"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\WC3 Asset Studio"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Register WC3 Asset Studio as a Windows Default Apps candidate without silently
; forcing the user's defaults. Windows 10/11 keeps the final choice user-controlled.
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.BLP"; ValueType: string; ValueName: ""; ValueData: "Warcraft III BLP Texture"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.BLP\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\resources\file-icons\texture.ico"",0"
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.BLP\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.blp\OpenWithProgids"; ValueType: string; ValueName: "WC3AssetStudio.BLP"; ValueData: ""; Flags: uninsdeletevalue

Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.TGA"; ValueType: string; ValueName: ""; ValueData: "TGA Texture"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.TGA\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\resources\file-icons\texture.ico"",0"
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.TGA\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.tga\OpenWithProgids"; ValueType: string; ValueName: "WC3AssetStudio.TGA"; ValueData: ""; Flags: uninsdeletevalue

Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDL"; ValueType: string; ValueName: ""; ValueData: "Warcraft III MDL Model"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDL\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\resources\file-icons\model.ico"",0"
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDL\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.mdl\OpenWithProgids"; ValueType: string; ValueName: "WC3AssetStudio.MDL"; ValueData: ""; Flags: uninsdeletevalue

Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDX"; ValueType: string; ValueName: ""; ValueData: "Warcraft III MDX Model"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDX\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\resources\file-icons\model.ico"",0"
Root: HKCU; Subkey: "Software\Classes\WC3AssetStudio.MDX\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKCU; Subkey: "Software\Classes\.mdx\OpenWithProgids"; ValueType: string; ValueName: "WC3AssetStudio.MDX"; ValueData: ""; Flags: uninsdeletevalue

Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities"; ValueType: string; ValueName: "ApplicationName"; ValueData: "WC3 Asset Studio"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities"; ValueType: string; ValueName: "ApplicationDescription"; ValueData: "Warcraft III model and texture editor for BLP, TGA, MDL and MDX files."
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities"; ValueType: string; ValueName: "ApplicationIcon"; ValueData: """{app}\{#MyAppExeName}"",0"
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities\FileAssociations"; ValueType: string; ValueName: ".blp"; ValueData: "WC3AssetStudio.BLP"
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities\FileAssociations"; ValueType: string; ValueName: ".tga"; ValueData: "WC3AssetStudio.TGA"
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities\FileAssociations"; ValueType: string; ValueName: ".mdl"; ValueData: "WC3AssetStudio.MDL"
Root: HKCU; Subkey: "Software\WC3 Asset Studio\Capabilities\FileAssociations"; ValueType: string; ValueName: ".mdx"; ValueData: "WC3AssetStudio.MDX"
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%1"""; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".blp"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".tga"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mdl"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\Applications\{#MyAppExeName}\SupportedTypes"; ValueType: string; ValueName: ".mdx"; ValueData: ""
Root: HKCU; Subkey: "Software\RegisteredApplications"; ValueType: string; ValueName: "WC3 Asset Studio"; ValueData: "Software\WC3 Asset Studio\Capabilities"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,WC3 Asset Studio}"; Flags: nowait postinstall skipifsilent

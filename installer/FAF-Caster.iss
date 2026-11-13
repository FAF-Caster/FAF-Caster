#define MyAppName "FAF Caster"
#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\artifacts\FAF-Caster-Desktop"
#endif
#ifndef OutputDir
  #define OutputDir "..\artifacts"
#endif

[Setup]
AppId={{B2F7450C-8A89-4934-BB51-3F3A647EA32B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=FAF Caster
AppPublisherURL=https://github.com/FAF-Caster/FAF-Caster
AppSupportURL=https://github.com/FAF-Caster/FAF-Caster/issues
DefaultDirName={autopf}\FAF Caster
DefaultGroupName=FAF Caster
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=FAF-Caster-Setup-v{#MyAppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\FAF.Caster.Desktop.exe
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Icons]
Name: "{group}\FAF Caster"; Filename: "{app}\FAF.Caster.Desktop.exe"
Name: "{autodesktop}\FAF Caster"; Filename: "{app}\FAF.Caster.Desktop.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\FAF.Caster.Desktop.exe"; Description: "Launch FAF Caster"; Flags: nowait postinstall skipifsilent

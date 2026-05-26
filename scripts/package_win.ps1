$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$TempDir = Join-Path $ProjectRoot ".tmp"
$BuildRoot = Join-Path $ProjectRoot "build"
$DistRoot = Join-Path $ProjectRoot "dist"
$PackageRoot = Join-Path $DistRoot "AuthCodePlatform"
New-Item -ItemType Directory -Force $TempDir, $BuildRoot, $DistRoot | Out-Null
$env:TEMP = $TempDir
$env:TMP = $TempDir

& (Join-Path $ProjectRoot ".venv\Scripts\pyinstaller.exe") `
  --noconfirm `
  --clean `
  --name AuthCodePlatform `
  --distpath $DistRoot `
  --workpath $BuildRoot `
  --specpath $BuildRoot `
  --add-data "$ProjectRoot\app\templates;app\templates" `
  --add-data "$ProjectRoot\app\static;app\static" `
  (Join-Path $ProjectRoot "main.py")

$WindowsGuide = Join-Path $ProjectRoot "docs\README-Windows-运行说明.txt"
if (Test-Path $WindowsGuide) {
  Copy-Item -LiteralPath $WindowsGuide -Destination (Join-Path $PackageRoot "README-Windows-运行说明.txt") -Force
}

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$TempDir = Join-Path $ProjectRoot ".tmp"
$BuildRoot = Join-Path $ProjectRoot "build-output"
New-Item -ItemType Directory -Force $TempDir, $BuildRoot, (Join-Path $BuildRoot "dist"), (Join-Path $BuildRoot "build") | Out-Null
$env:TEMP = $TempDir
$env:TMP = $TempDir

& (Join-Path $ProjectRoot ".venv\Scripts\pyinstaller.exe") `
  --noconfirm `
  --clean `
  --name AuthCodePlatform `
  --distpath (Join-Path $BuildRoot "dist") `
  --workpath (Join-Path $BuildRoot "build") `
  --specpath $BuildRoot `
  --add-data "$ProjectRoot\app\templates;app\templates" `
  --add-data "$ProjectRoot\app\static;app\static" `
  (Join-Path $ProjectRoot "main.py")

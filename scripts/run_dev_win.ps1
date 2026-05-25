$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:AUTH_PLATFORM_DATA_DIR = Join-Path $ProjectRoot "data"
& (Join-Path $ProjectRoot ".venv\Scripts\python.exe") (Join-Path $ProjectRoot "main.py")

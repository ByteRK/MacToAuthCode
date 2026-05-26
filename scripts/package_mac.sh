#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "scripts/package_mac.sh 仅支持 macOS，请按系统使用对应脚本。" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/.venv/bin/python"
PYINSTALLER_BIN="${PROJECT_ROOT}/.venv/bin/pyinstaller"

if ! command -v uv >/dev/null 2>&1; then
  echo "macOS 环境需要先安装 uv，才能自动管理 .venv。" >&2
  exit 1
fi

if [ ! -x "${VENV_PYTHON}" ]; then
  uv venv "${PROJECT_ROOT}/.venv"
fi

if [ ! -x "${PYINSTALLER_BIN}" ]; then
  uv pip install --python "${VENV_PYTHON}" -r "${PROJECT_ROOT}/requirements.txt"
fi

mkdir -p "${PROJECT_ROOT}/.tmp" "${PROJECT_ROOT}/build" "${PROJECT_ROOT}/dist"
export TEMP="${PROJECT_ROOT}/.tmp"
export TMP="${PROJECT_ROOT}/.tmp"

exec "${PYINSTALLER_BIN}" \
  --noconfirm \
  --clean \
  --name AuthCodePlatform \
  --distpath "${PROJECT_ROOT}/dist" \
  --workpath "${PROJECT_ROOT}/build" \
  --specpath "${PROJECT_ROOT}/build" \
  --add-data "${PROJECT_ROOT}/app/templates:app/templates" \
  --add-data "${PROJECT_ROOT}/app/static:app/static" \
  "${PROJECT_ROOT}/main.py"

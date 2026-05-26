#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "scripts/package_linux.sh 仅支持 Linux，请按系统使用对应脚本。" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYINSTALLER_BIN="${PROJECT_ROOT}/.venv/bin/pyinstaller"

if [ ! -x "${PYINSTALLER_BIN}" ]; then
  echo "未找到 ${PYINSTALLER_BIN}，请先在 .venv 中安装依赖。" >&2
  exit 1
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

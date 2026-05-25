#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/.venv/bin/python"
PYINSTALLER_BIN="${PROJECT_ROOT}/.venv/bin/pyinstaller"

ensure_macos_packaging_runtime() {
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
}

case "$(uname -s)" in
  Darwin)
    ensure_macos_packaging_runtime
    ;;
  Linux)
    if [ ! -x "${PYINSTALLER_BIN}" ]; then
      echo "未找到 ${PYINSTALLER_BIN}，请先在 .venv 中安装依赖。" >&2
      exit 1
    fi
    ;;
  *)
    echo "当前脚本仅支持 Linux / macOS，请在 Windows 上使用 scripts/package.ps1。" >&2
    exit 1
    ;;
esac

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

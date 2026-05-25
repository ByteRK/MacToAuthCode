#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Darwin" ]; then
  echo "scripts/run_dev_mac.sh 仅支持 macOS，请按系统使用对应脚本。" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/.venv/bin/python"

if ! command -v uv >/dev/null 2>&1; then
  echo "macOS 环境需要先安装 uv，才能自动管理 .venv。" >&2
  exit 1
fi

if [ ! -x "${VENV_PYTHON}" ]; then
  uv venv "${PROJECT_ROOT}/.venv"
  uv pip install --python "${VENV_PYTHON}" -r "${PROJECT_ROOT}/requirements.txt"
fi

export AUTH_PLATFORM_DATA_DIR="${PROJECT_ROOT}/data"
exec "${VENV_PYTHON}" "${PROJECT_ROOT}/main.py"

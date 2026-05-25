#!/usr/bin/env bash
set -euo pipefail

if [ "$(uname -s)" != "Linux" ]; then
  echo "scripts/run_dev_linux.sh 仅支持 Linux，请按系统使用对应脚本。" >&2
  exit 1
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/.venv/bin/python"

if [ ! -x "${VENV_PYTHON}" ]; then
  echo "未找到 ${VENV_PYTHON}，请先创建 .venv 并安装依赖。" >&2
  exit 1
fi

export AUTH_PLATFORM_DATA_DIR="${PROJECT_ROOT}/data"
exec "${VENV_PYTHON}" "${PROJECT_ROOT}/main.py"

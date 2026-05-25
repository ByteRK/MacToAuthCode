#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/.venv/bin/python"

ensure_macos_runtime() {
  if ! command -v uv >/dev/null 2>&1; then
    echo "macOS 环境需要先安装 uv，才能自动管理 .venv。" >&2
    exit 1
  fi

  if [ ! -x "${VENV_PYTHON}" ]; then
    uv venv "${PROJECT_ROOT}/.venv"
    uv pip install --python "${VENV_PYTHON}" -r "${PROJECT_ROOT}/requirements.txt"
  fi
}

case "$(uname -s)" in
  Darwin)
    ensure_macos_runtime
    ;;
  Linux)
    if [ ! -x "${VENV_PYTHON}" ]; then
      echo "未找到 ${VENV_PYTHON}，请先创建 .venv 并安装依赖。" >&2
      exit 1
    fi
    ;;
  *)
    echo "当前脚本仅支持 Linux / macOS，请在 Windows 上使用 scripts/run_dev.ps1。" >&2
    exit 1
    ;;
esac

export AUTH_PLATFORM_DATA_DIR="${PROJECT_ROOT}/data"
exec "${VENV_PYTHON}" "${PROJECT_ROOT}/main.py"

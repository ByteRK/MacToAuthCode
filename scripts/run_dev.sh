#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$(uname -s)" in
  Darwin)
    exec "${PROJECT_ROOT}/scripts/run_dev_mac.sh"
    ;;
  Linux)
    exec "${PROJECT_ROOT}/scripts/run_dev_linux.sh"
    ;;
  *)
    echo "当前脚本仅支持 Linux / macOS，请按系统使用 scripts/run_dev_win.ps1、scripts/run_dev_linux.sh 或 scripts/run_dev_mac.sh。" >&2
    exit 1
    ;;
esac

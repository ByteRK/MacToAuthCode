#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$(uname -s)" in
  Darwin)
    exec "${PROJECT_ROOT}/scripts/package_mac.sh"
    ;;
  Linux)
    exec "${PROJECT_ROOT}/scripts/package_linux.sh"
    ;;
  *)
    echo "当前脚本仅支持 Linux / macOS，请按系统使用 scripts/package_win.ps1、scripts/package_linux.sh 或 scripts/package_mac.sh。" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export AUTH_PLATFORM_DATA_DIR="${PROJECT_ROOT}/data"
"${PROJECT_ROOT}/.venv/bin/python" "${PROJECT_ROOT}/main.py"

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "${PROJECT_ROOT}/.tmp" "${PROJECT_ROOT}/build" "${PROJECT_ROOT}/dist"
export TEMP="${PROJECT_ROOT}/.tmp"
export TMP="${PROJECT_ROOT}/.tmp"

"${PROJECT_ROOT}/.venv/bin/pyinstaller" \
  --noconfirm \
  --clean \
  --name AuthCodePlatform \
  --distpath "${PROJECT_ROOT}/dist" \
  --workpath "${PROJECT_ROOT}/build" \
  --specpath "${PROJECT_ROOT}/build" \
  --add-data "${PROJECT_ROOT}/app/templates:app/templates" \
  --add-data "${PROJECT_ROOT}/app/static:app/static" \
  "${PROJECT_ROOT}/main.py"

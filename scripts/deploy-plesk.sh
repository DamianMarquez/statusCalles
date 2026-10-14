#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.nodenv/shims:$HOME/.nodenv/bin:$PATH"
if command -v nodenv >/dev/null 2>&1; then
  eval "$(nodenv init -)" 2>/dev/null || true
fi
export NODENV_VERSION=20

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCUMENT_ROOT="${PLESK_DOCUMENT_ROOT:-$BASE_DIR}"
APP_TMP_DIR="${PLESK_APP_TMP_DIR:-$BASE_DIR/tmp}"

echo "Deploying Street Status from $BASE_DIR with Node $(node --version)"
cd "$BASE_DIR"

npm install --include=dev --no-audit --no-fund
npm run build

mkdir -p "$DOCUMENT_ROOT"
cp -R "$BASE_DIR/frontend/dist/." "$DOCUMENT_ROOT/"

mkdir -p "$APP_TMP_DIR"
touch "$APP_TMP_DIR/restart.txt"
echo "Deploy complete; Passenger restart requested. Plesk startup file: app.js"

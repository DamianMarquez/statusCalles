#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
document_root="${PLESK_DOCUMENT_ROOT:-$project_root}"
restart_tmp_dir="${PLESK_APP_TMP_DIR:-$project_root/tmp}"

# Plesk cron/deploy hooks may not load the interactive shell profile.
export PATH="$HOME/.nodenv/shims:$HOME/.nodenv/bin:$PATH"
if command -v nodenv >/dev/null 2>&1; then
  eval "$(nodenv init -)" 2>/dev/null || true
  export NODENV_VERSION=20
fi

node_version="$(node -p 'process.versions.node')"
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major===20&&minor>=17?0:1)'; then
  echo "Plesk debe usar Node.js 20.17 o posterior dentro de la línea 20; versión actual: $node_version." >&2
  exit 1
fi

cd "$project_root"
echo "Deploying Street Status from: $project_root"
echo "Frontend document root: $document_root"

echo "Installing monorepo dependencies..."
npm ci --include=dev

echo "Building backend and frontend..."
npm run build

if [[ "${RUN_DB_MIGRATIONS:-0}" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "RUN_DB_MIGRATIONS=1 requiere DATABASE_URL configurada en el entorno." >&2
    exit 1
  fi
  npm run db:migrate
fi

mkdir -p "$document_root"
echo "Publishing frontend files..."
cp -R frontend/dist/. "$document_root/"

echo "Removing development dependencies..."
npm prune --omit=dev

mkdir -p "$restart_tmp_dir"
touch "$restart_tmp_dir/restart.txt"
echo "Deploy complete. Passenger restart requested via $restart_tmp_dir/restart.txt."
echo "Plesk startup file must be app.js."

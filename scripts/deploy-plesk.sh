#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
document_root="${PLESK_DOCUMENT_ROOT:-$project_root}"
restart_tmp_dir="${PLESK_APP_TMP_DIR:-$project_root/tmp}"

if command -v nodenv >/dev/null 2>&1; then
  export PATH="$HOME/.nodenv/shims:$HOME/.nodenv/bin:$PATH"
  eval "$(nodenv init -)"
  export NODENV_VERSION=20
fi

node_version="$(node -p 'process.versions.node')"
if ! node -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major===20&&minor>=17?0:1)'; then
  echo "Plesk debe usar Node.js 20.17 o posterior dentro de la línea 20; versión actual: $node_version." >&2
  exit 1
fi

cd "$project_root"
npm ci --include=dev
npm run build
npm run routing:setup

if [[ "${RUN_DB_MIGRATIONS:-0}" == "1" ]]; then
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "RUN_DB_MIGRATIONS=1 requiere DATABASE_URL configurada en el entorno." >&2
    exit 1
  fi
  npm run db:migrate
fi

mkdir -p "$document_root"
cp -R frontend/dist/. "$document_root/"

npm prune --omit=dev
mkdir -p "$restart_tmp_dir"
touch "$restart_tmp_dir/restart.txt"
echo "Deploy copiado y reinicio solicitado con $restart_tmp_dir/restart.txt (startup file: app.js)."

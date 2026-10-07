#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
document_root="${PLESK_DOCUMENT_ROOT:-$project_root}"

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

mkdir -p "$document_root"
cp -R frontend/dist/. "$document_root/"

# El proceso activo se reinicia desde el panel de Node.js de Plesk.
npm prune --omit=dev
echo "Deploy preparado. Reiniciá la aplicación Node desde Plesk (startup file: app.js)."

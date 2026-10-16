#!/usr/bin/env bash
set -euo pipefail

log() { printf '[deploy-frontend] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCUMENT_ROOT="${PLESK_DOCUMENT_ROOT:-$ROOT/public}"

for required in package.json package-lock.json frontend/package.json frontend/vite.config.ts; do
  [[ -f "$ROOT/$required" ]] || fail "No se encontró $required; ejecutá el script desde una copia completa del frontend monorepo."
done

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" == 20 ]] || fail "Plesk debe usar Node 20 para este proyecto; se encontró $(node --version)."
command -v npm >/dev/null 2>&1 || fail "npm no está disponible en el entorno de ejecución de Plesk."

if [[ -z "${VITE_API_URL:-}" ]]; then
  for env_file in "$ROOT/.env.production" "$ROOT/.env"; do
    [[ -f "$env_file" ]] || continue
    VITE_API_URL="$(awk -F= '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*VITE_API_URL[[:space:]]*=/ {
        sub(/^[^=]*=/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        gsub(/^"|"$/, "")
        print
        exit
      }
    ' "$env_file")"
    [[ -n "$VITE_API_URL" ]] && break
  done
fi
if [[ -z "${VITE_API_URL:-}" ]]; then
  fail "Falta VITE_API_URL. Configurala en el entorno de Run Script, .env.production o .env (ej.: https://api.tudominio.com)."
fi
export VITE_API_URL
case "$VITE_API_URL" in
  https://*|/api) ;;
  http://localhost*|http://127.0.0.1*) ;;
  *) fail "VITE_API_URL debe usar HTTPS en producción (o /api si hay un proxy del mismo origen)." ;;
esac

log "Proyecto: $ROOT"
log "Destino estático: $DOCUMENT_ROOT"
log "VITE_API_URL está configurada (el valor se incorpora al bundle público)."
cd "$ROOT"

log "Instalando únicamente el workspace frontend desde package-lock.json..."
npm ci --include=dev --workspace @street-status/frontend \
  --include-workspace-root=false --no-audit --no-fund

log "Compilando frontend..."
npm run build --workspace @street-status/frontend

[[ -f "$ROOT/frontend/dist/index.html" ]] || fail "El build no generó frontend/dist/index.html."
mkdir -p "$DOCUMENT_ROOT"
cp -R "$ROOT/frontend/dist/." "$DOCUMENT_ROOT/"

log "Frontend publicado correctamente en $DOCUMENT_ROOT."
log "No se instalaron ni compilaron dependencias del backend."

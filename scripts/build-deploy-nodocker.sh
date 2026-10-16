#!/usr/bin/env bash
set -euo pipefail

log() { printf '[build-deploy-nodocker] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
NPM_VERSION="$(npm --version)"
NPM_MAJOR="${NPM_VERSION%%.*}"
NPM_REST="${NPM_VERSION#*.}"
NPM_MINOR="${NPM_REST%%.*}"

[[ "$NODE_MAJOR" == 20 ]] || fail "Esta alternativa requiere Node 20; se encontró Node $(node --version)."
if (( NPM_MAJOR < 10 || (NPM_MAJOR == 10 && NPM_MINOR < 4) )); then
  fail "Se requiere npm 10.4 o superior; se encontró npm $NPM_VERSION."
fi
for required in package.json package-lock.json backend/package.json frontend/package.json app.js; do
  [[ -f "$ROOT/$required" ]] || fail "No se encontró $required en la raíz del proyecto."
done
command -v file >/dev/null 2>&1 || fail "Se necesita el comando 'file' para verificar binarios."

log "AVISO: se instalarán módulos para Linux x64/glibc, pero este host no comprobará su carga nativa Linux."
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/street-status-deploy.XXXXXX")"
NEXT_DEPLOY="$ROOT/.deploy.next.$$"
NEXT_ARCHIVE="$ROOT/.deploy.tar.gz.next.$$"
cleanup() { rm -rf "$TMP_DIR" "$NEXT_DEPLOY" "$NEXT_ARCHIVE"; }
trap cleanup EXIT

cd "$ROOT"
log "Instalando dependencias locales desde package-lock.json y compilando..."
npm ci --include=dev
npm run build

mkdir -p "$TMP_DIR/production/backend" "$TMP_DIR/production/frontend" "$TMP_DIR/deploy/backend" "$TMP_DIR/deploy/frontend" "$TMP_DIR/deploy/public"
cp package.json package-lock.json "$TMP_DIR/production/"
cp backend/package.json "$TMP_DIR/production/backend/"
cp frontend/package.json "$TMP_DIR/production/frontend/"
log "Instalando dependencias de producción para Linux x64/glibc en carpeta temporal..."
(
  cd "$TMP_DIR/production"
  npm ci --omit=dev --os=linux --cpu=x64 --libc=glibc \
    --workspace @street-status/backend --include-workspace-root=false \
    --no-audit --no-fund
)

cp app.js package.json package-lock.json "$TMP_DIR/deploy/"
cp -a "$TMP_DIR/production/node_modules" "$TMP_DIR/deploy/node_modules"
if [[ -d "$TMP_DIR/production/backend/node_modules" ]]; then
  cp -a "$TMP_DIR/production/backend/node_modules" "$TMP_DIR/deploy/backend/node_modules"
fi
cp backend/package.json "$TMP_DIR/deploy/backend/package.json"
cp -a backend/src backend/dist backend/drizzle "$TMP_DIR/deploy/backend/"
cp frontend/package.json "$TMP_DIR/deploy/frontend/package.json"
cp -a frontend/dist/. "$TMP_DIR/deploy/public/"

log "Verificando manifests, plataformas y resolución de módulos en el host..."
bash "$ROOT/scripts/verify-deploy.sh" "$TMP_DIR/deploy" --skip-docker
log "Generando deploy.tar.gz..."
tar -czf "$TMP_DIR/deploy.tar.gz" -C "$TMP_DIR/deploy" .
tar -tzf "$TMP_DIR/deploy.tar.gz" >/dev/null || fail "El archivo deploy.tar.gz no se puede leer."
tar -tvzf "$TMP_DIR/deploy.tar.gz" | grep -q 'node_modules/@street-status/backend ->' \
  || fail "El tar no preservó el symlink del workspace backend."

cp -a "$TMP_DIR/deploy" "$NEXT_DEPLOY"
cp "$TMP_DIR/deploy.tar.gz" "$NEXT_ARCHIVE"
rm -rf "$ROOT/deploy"
mv "$NEXT_DEPLOY" "$ROOT/deploy"
mv "$NEXT_ARCHIVE" "$ROOT/deploy.tar.gz"

log "Paquete listo: $ROOT/deploy.tar.gz"
du -h "$ROOT/deploy.tar.gz"

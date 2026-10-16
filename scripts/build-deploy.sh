#!/usr/bin/env bash
set -euo pipefail

log() { printf '[build-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for required in package.json package-lock.json backend/package.json frontend/package.json app.js; do
  [[ -f "$ROOT/$required" ]] || fail "No se encontró $required en la raíz del proyecto."
done
command -v docker >/dev/null 2>&1 || fail "Docker CLI no está instalado."
command -v file >/dev/null 2>&1 || fail "Se necesita el comando 'file' para verificar binarios."
docker info >/dev/null 2>&1 || fail "Docker no está iniciado o el usuario no puede acceder al daemon."

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/street-status-deploy.XXXXXX")"
NEXT_DEPLOY="$ROOT/.deploy.next.$$"
NEXT_ARCHIVE="$ROOT/.deploy.tar.gz.next.$$"
cleanup() {
  rm -rf "$TMP_DIR" "$NEXT_DEPLOY" "$NEXT_ARCHIVE"
}
trap cleanup EXIT

log "Construyendo con node:20-bookworm para Linux x64/glibc."
if ! docker image inspect node:20-bookworm >/dev/null 2>&1; then
  log "Descargando node:20-bookworm..."
  docker pull --platform linux/amd64 node:20-bookworm
fi

docker run --rm --platform linux/amd64 \
  --mount "type=bind,src=$ROOT,dst=/source,readonly" \
  --mount "type=bind,src=$TMP_DIR,dst=/out" \
  node:20-bookworm bash -euo pipefail -c '
    WORK=/tmp/street-status-build
    PROD=/tmp/street-status-production
    mkdir -p "$WORK" "$PROD/backend" "$PROD/frontend" /out/deploy

    echo "[container] Copiando el código sin node_modules, .git ni secretos .env..."
    tar -C /source \
      --exclude=.git \
      --exclude=node_modules \
      --exclude="*/node_modules" \
      --exclude="**/node_modules" \
      --exclude=.env \
      --exclude=".env.*" \
      --exclude=frontend/dist \
      --exclude=backend/dist \
      --exclude=deploy \
      --exclude=deploy.tar.gz \
      --exclude=data/routing \
      --exclude=backend/data/routing \
      -cf - . | tar -C "$WORK" -xf -

    cd "$WORK"
    echo "[container] npm ci completo para compilar frontend y backend..."
    npm ci --include=dev
    npm run build

    echo "[container] Instalando solo dependencias de producción del backend..."
    cp package.json package-lock.json "$PROD/"
    cp backend/package.json "$PROD/backend/"
    cp frontend/package.json "$PROD/frontend/"
    cd "$PROD"
    npm ci --omit=dev --workspace @street-status/backend \
      --include-workspace-root=false --no-audit --no-fund

    echo "[container] Armando deploy/..."
    cp "$WORK/app.js" /out/deploy/app.js
    cp "$WORK/package.json" "$WORK/package-lock.json" /out/deploy/
    cp -a "$PROD/node_modules" /out/deploy/node_modules
    mkdir -p /out/deploy/backend /out/deploy/frontend /out/deploy/public
    if [ -d "$PROD/backend/node_modules" ]; then
      cp -a "$PROD/backend/node_modules" /out/deploy/backend/node_modules
    fi
    cp "$WORK/backend/package.json" /out/deploy/backend/package.json
    cp -a "$WORK/backend/src" "$WORK/backend/dist" "$WORK/backend/drizzle" /out/deploy/backend/
    cp "$WORK/frontend/package.json" /out/deploy/frontend/package.json
    cp -a "$WORK/frontend/dist/." /out/deploy/public/

    echo "[container] Generando archivo con GNU tar..."
    tar -czf /out/deploy.tar.gz -C /out/deploy .
  '

[[ -d "$TMP_DIR/deploy" && -f "$TMP_DIR/deploy.tar.gz" ]] || fail "Docker no produjo deploy/ y deploy.tar.gz."
tar -tzf "$TMP_DIR/deploy.tar.gz" >/dev/null || fail "El archivo deploy.tar.gz no se puede leer."
tar -tvzf "$TMP_DIR/deploy.tar.gz" | grep -q 'node_modules/@street-status/backend ->' \
  || fail "El tar no preservó el symlink del workspace backend."
log "Verificando el contenido Linux del paquete..."
bash "$ROOT/scripts/verify-deploy.sh" "$TMP_DIR/deploy"

cp -a "$TMP_DIR/deploy" "$NEXT_DEPLOY"
cp "$TMP_DIR/deploy.tar.gz" "$NEXT_ARCHIVE"
rm -rf "$ROOT/deploy"
mv "$NEXT_DEPLOY" "$ROOT/deploy"
mv "$NEXT_ARCHIVE" "$ROOT/deploy.tar.gz"

log "Paquete listo: $ROOT/deploy.tar.gz"
du -h "$ROOT/deploy.tar.gz"

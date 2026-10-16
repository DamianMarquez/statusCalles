#!/usr/bin/env bash
set -euo pipefail

log() { printf '[verify-deploy] %s\n' "$*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${1:-$ROOT/deploy}"
MODE="${2:-}"
[[ "$MODE" == "" || "$MODE" == "--skip-docker" ]] || fail "Uso: verify-deploy.sh [directorio-deploy] [--skip-docker]"
[[ -d "$DEPLOY_DIR" ]] || fail "No existe el directorio de despliegue: $DEPLOY_DIR"
DEPLOY_DIR="$(cd "$DEPLOY_DIR" && pwd)"

for required in app.js package.json package-lock.json backend/package.json frontend/package.json backend/dist/server.js backend/dist/server-app.js backend/src backend/drizzle public/index.html node_modules; do
  [[ -e "$DEPLOY_DIR/$required" ]] || fail "Falta en deploy/: $required"
done
[[ -L "$DEPLOY_DIR/node_modules/@street-status/backend" ]] \
  || fail "Falta el symlink del workspace backend en node_modules."
command -v file >/dev/null 2>&1 || fail "Se necesita el comando 'file'."
node --check "$DEPLOY_DIR/app.js"

DANGLING=()
while IFS= read -r -d '' LINK; do
  [[ -e "$LINK" ]] || DANGLING+=("$LINK")
done < <(find "$DEPLOY_DIR/node_modules" -type l -print0)
if [[ -d "$DEPLOY_DIR/backend/node_modules" ]]; then
  while IFS= read -r -d '' LINK; do
    [[ -e "$LINK" ]] || DANGLING+=("$LINK")
  done < <(find "$DEPLOY_DIR/backend/node_modules" -type l -print0)
fi
if (( ${#DANGLING[@]} )); then
  printf '%s\n' "${DANGLING[@]}" >&2
  fail "Se encontraron symlinks rotos dentro de node_modules."
fi

log "Buscando dependencias de otras plataformas..."
FOREIGN="$(find "$DEPLOY_DIR/node_modules" "$DEPLOY_DIR/backend/node_modules" -type d 2>/dev/null \
  | grep -E '/([^/]*(darwin|win32|win64|windows|freebsd|openbsd|sunos|aix|android|linux-(arm|arm64|ia32|s390x|ppc64|riscv64|loong64|x64-musl))[^/]*)$' \
  || true)"
if [[ -n "$FOREIGN" ]]; then
  printf '%s\n' "$FOREIGN" >&2
  fail "Se encontraron paquetes binarios de plataformas distintas a Linux x64/glibc."
fi

NATIVE_COUNT=0
while IFS= read -r -d '' BINARY; do
  DESCRIPTION="$(file -b "$BINARY")"
  [[ "$DESCRIPTION" == *"ELF 64-bit"* && "$DESCRIPTION" == *"x86-64"* ]] \
    || fail "Binario nativo incompatible: $BINARY ($DESCRIPTION)"
  NATIVE_COUNT=$((NATIVE_COUNT + 1))
done < <(find "$DEPLOY_DIR/node_modules" "$DEPLOY_DIR/backend/node_modules" -type f 2>/dev/null \
  \( -name '*.node' -o -path '*/@esbuild/linux-x64/bin/esbuild' -o -path '*/esbuild/bin/esbuild' \) -print0)
log "Binarios nativos Linux x64/glibc verificados: $NATIVE_COUNT."

if [[ "$MODE" == "--skip-docker" ]]; then
  log "Importando el backend con Node local; esto no prueba la carga de binarios Linux en el host."
  (cd "$DEPLOY_DIR" && node --input-type=module -e "await import('./backend/dist/server-app.js')")
else
  command -v docker >/dev/null 2>&1 || fail "Docker es necesario para la prueba de importación Linux."
  docker info >/dev/null 2>&1 || fail "Docker no está iniciado o el usuario no puede acceder al daemon."
  docker image inspect node:20-bookworm >/dev/null 2>&1 || docker pull --platform linux/amd64 node:20-bookworm
  log "Importando el backend dentro de node:20-bookworm/linux-amd64..."
  docker run --rm --platform linux/amd64 \
    --mount "type=bind,src=$DEPLOY_DIR,dst=/deploy,readonly" \
    --workdir /deploy \
    node:20-bookworm node --input-type=module -e "await import('./backend/dist/server-app.js')"
fi

log "Paquete válido: $DEPLOY_DIR"

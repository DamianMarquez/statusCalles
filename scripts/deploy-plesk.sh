#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

warn() {
  log "AVISO: $*"
}

on_error() {
  local exit_code=$?
  log "ERROR: el proceso falló en la línea ${BASH_LINENO[0]} (código ${exit_code})."
  exit "$exit_code"
}
trap on_error ERR

export PATH="$HOME/.nodenv/shims:$HOME/.nodenv/bin:$PATH"
if command -v nodenv >/dev/null 2>&1; then
  eval "$(nodenv init -)" 2>/dev/null || true
fi
export NODENV_VERSION=20

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCUMENT_ROOT="${PLESK_DOCUMENT_ROOT:-$BASE_DIR}"
APP_TMP_DIR="${PLESK_APP_TMP_DIR:-$BASE_DIR/tmp}"
MISSING_RUNTIME_VARS=()

env_file_has() {
  local name="$1"
  [[ -f "$BASE_DIR/.env" ]] || return 1
  awk -v key="$name" '
    {
      line = $0
      sub(/^[[:space:]]*/, "", line)
      if (line ~ ("^" key "[[:space:]]*=")) {
        sub(/^[^=]*=/, "", line)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line != "" && line !~ /^#/) found = 1
      }
    }
    END { exit(found ? 0 : 1) }
  ' "$BASE_DIR/.env"
}

is_configured() {
  local name="$1"
  [[ -n "${!name:-}" ]] || env_file_has "$name"
}

log "============================================================"
log "Street Status: inicio del deploy"
log "Directorio del proyecto: $BASE_DIR"
log "Node activo: $(node --version) | npm: $(npm --version)"
log "Document root: $DOCUMENT_ROOT"
log "Directorio Passenger: $APP_TMP_DIR"
log "============================================================"

log "Validando variables de ejecución (no se mostrarán valores secretos)."
log "La comprobación ve variables heredadas por Run Script y claves presentes en $BASE_DIR/.env."
if is_configured DATABASE_URL; then
  log "OK: DATABASE_URL está configurada (valor oculto)."
else
  warn "Falta DATABASE_URL. El build continuará, pero Fastify no podrá iniciar hasta configurarla en la app Node de Plesk o en .env."
  MISSING_RUNTIME_VARS+=(DATABASE_URL)
fi
if is_configured CORS_ORIGIN; then
  log "OK: CORS_ORIGIN está configurada (valor oculto)."
else
  warn "Falta CORS_ORIGIN. El build continuará, pero el navegador puede no poder acceder a la API desde el dominio público."
  MISSING_RUNTIME_VARS+=(CORS_ORIGIN)
fi
if is_configured PORT; then
  log "OK: PORT está configurada por Plesk (valor oculto)."
elif is_configured BACKEND_PORT; then
  log "INFO: PORT no está visible; BACKEND_PORT está configurada como alternativa (valor oculto)."
else
  warn "No se encontró PORT ni BACKEND_PORT; el backend usará su puerto local predeterminado 3000."
  MISSING_RUNTIME_VARS+=(PORT/BACKEND_PORT)
fi
node_env_is_production() {
  if [[ -n "${NODE_ENV:-}" ]]; then
    [[ "$NODE_ENV" == "production" ]]
    return
  fi
  awk -F= '
  /^[[:space:]]*NODE_ENV[[:space:]]*=/ {
    value = $0
    sub(/^[^=]*=/, "", value)
    gsub(/[[:space:]"\047]/, "", value)
    if (value == "production") found = 1
  }
  END { exit(found ? 0 : 1) }
' "$BASE_DIR/.env" 2>/dev/null
}
if node_env_is_production; then
  log "OK: NODE_ENV está en production; las cookies de sesión usarán Secure."
else
  warn "NODE_ENV no figura como production; verificá que esté configurada en Plesk para proteger las cookies de sesión."
  MISSING_RUNTIME_VARS+=(NODE_ENV=production)
fi
for optional_variable in TRUST_PROXY USIG_ADDRESS_SEARCH_URL DB_POOL_MAX DB_IDLE_TIMEOUT_MS DB_CONNECTION_TIMEOUT_MS DB_QUERY_TIMEOUT_MS; do
  if is_configured "$optional_variable"; then
    log "OK: variable opcional $optional_variable configurada (valor oculto)."
  else
    log "INFO: $optional_variable no configurada; la aplicación usará su valor predeterminado o desactivará esa opción."
  fi
done

cd "$BASE_DIR"

log "Instalando o actualizando dependencias..."
step_start=$SECONDS
npm install --include=dev --no-audit --no-fund
log "Dependencias listas en $((SECONDS - step_start)) s."

log "Compilando backend y frontend..."
step_start=$SECONDS
npm run build
log "Build completo en $((SECONDS - step_start)) s."

log "Copiando archivos al document root..."
mkdir -p "$DOCUMENT_ROOT"
cp -R "$BASE_DIR/frontend/dist/." "$DOCUMENT_ROOT/"
log "Frontend publicado en $DOCUMENT_ROOT."

log "Solicitando reinicio de Passenger..."
mkdir -p "$APP_TMP_DIR"
touch "$APP_TMP_DIR/restart.txt"
log "Deploy finalizado correctamente. Marcador: $APP_TMP_DIR/restart.txt"
log "Archivo de inicio configurado en Plesk: app.js"
if ((${#MISSING_RUNTIME_VARS[@]} > 0)); then
  warn "Deploy completado con variables para revisar: ${MISSING_RUNTIME_VARS[*]}."
else
  log "Validación de variables de ejecución completa; no se detectaron faltantes críticos."
fi
log "============================================================"

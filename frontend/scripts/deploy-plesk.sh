#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$FRONTEND_DIR"

log() { printf '[frontend-deploy] %s\n' "$*"; }
fail() { printf '[frontend-deploy] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -f package.json ]] || fail "No se encontró frontend/package.json."
[[ -f package-lock.json ]] || fail "No se encontró frontend/package-lock.json. Generá el lockfile antes del deploy."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
[[ "$NODE_MAJOR" == "20" ]] || fail "Se requiere Node 20 en Plesk; versión detectada: ${NODE_MAJOR:-no disponible}."
command -v npm >/dev/null 2>&1 || fail "npm no está disponible en el entorno Run Script de Plesk."

if [[ -z "${VITE_API_URL:-}" ]]; then
  for env_file in .env.production .env; do
    [[ -f "$env_file" ]] || continue
    while IFS= read -r env_line || [[ -n "$env_line" ]]; do
      [[ "$env_line" =~ ^[[:space:]]*VITE_API_URL[[:space:]]*=(.*)$ ]] || continue
      VITE_API_URL="${BASH_REMATCH[1]}"
      VITE_API_URL="${VITE_API_URL#"${VITE_API_URL%%[![:space:]]*}"}"
      VITE_API_URL="${VITE_API_URL%"${VITE_API_URL##*[![:space:]]}"}"
      case "$VITE_API_URL" in
        \"*\") VITE_API_URL="${VITE_API_URL:1:${#VITE_API_URL}-2}" ;;
        \'*\') VITE_API_URL="${VITE_API_URL:1:${#VITE_API_URL}-2}" ;;
      esac
      break
    done < "$env_file"
    [[ -n "$VITE_API_URL" ]] && break
  done
fi

[[ -n "${VITE_API_URL:-}" ]] || fail "Falta VITE_API_URL. Configurala en Plesk o en frontend/.env.production (ej.: https://api.pozometro.com.ar)."
export VITE_API_URL
if ! node -e '
  try {
    const url = new URL(process.env.VITE_API_URL);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || !["", "/", "/api"].includes(url.pathname)) process.exit(1);
  } catch { process.exit(1); }
'; then
  fail "VITE_API_URL debe ser un origen HTTPS público (opcionalmente terminado en /api), sin credenciales, query ni fragmento."
fi

log "Node $(node --version), npm $(npm --version)."
log "API pública configurada; no se imprimirá porque queda incorporada al bundle."
log "Instalando dependencias del frontend desde su lockfile (sin workspaces)."
npm ci --include=dev --workspaces=false --no-audit --no-fund

log "Compilando la SPA."
npm run build --workspaces=false

[[ -s dist/index.html ]] || fail "El build no produjo dist/index.html."
[[ -s dist/.htaccess ]] || fail "Falta dist/.htaccess; revisá frontend/public/.htaccess."
log "Deploy listo en $FRONTEND_DIR/dist. Apache/Plesk debe servir esa carpeta como document root."

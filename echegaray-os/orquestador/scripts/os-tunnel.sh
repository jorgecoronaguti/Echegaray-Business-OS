#!/usr/bin/env bash
# Túnel HTTPS saliente hacia el motor interactivo (:8790) + auto-registro.
#
# El server no acepta tráfico entrante salvo SSH, así que el OS se expone con un
# túnel saliente (cloudflared). La URL del túnel cambia en cada reinicio; por eso,
# apenas la tenemos, la publicamos en Supabase (os_runtime) para que Vercel y la
# extensión la descubran. systemd reinicia este script si el túnel se cae, y el
# nuevo arranque vuelve a publicar la URL nueva: auto-reparable.
set -euo pipefail

APP_DIR=/home/jorge/echegaray-os/app/echegaray-os
NODE=/home/jorge/.nvm/versions/node/v24.18.0/bin/node
CF=${CLOUDFLARED_BIN:-/home/jorge/bin/cloudflared}
LOG=$(mktemp /tmp/os-tunnel.XXXXXX.log)

cleanup() { [ -n "${CFPID:-}" ] && kill "$CFPID" 2>/dev/null || true; rm -f "$LOG"; }
trap cleanup EXIT

"$CF" tunnel --url http://localhost:8790 --no-autoupdate > "$LOG" 2>&1 &
CFPID=$!

URL=""
for _ in $(seq 1 30); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  kill -0 "$CFPID" 2>/dev/null || { echo "cloudflared murió antes de dar URL:"; cat "$LOG"; exit 1; }
  sleep 1
done
[ -z "$URL" ] && { echo "no se obtuvo URL del túnel en 30s"; exit 1; }

echo "túnel arriba: $URL — publicando endpoint…"
( cd "$APP_DIR" && "$NODE" orquestador/scripts/os-endpoint.mjs set "$URL" ) \
  || echo "ADVERTENCIA: no se pudo publicar el endpoint en Supabase (el túnel sigue arriba)"

# Mantener el proceso vivo mientras el túnel viva; si cae, systemd nos reinicia.
wait "$CFPID"

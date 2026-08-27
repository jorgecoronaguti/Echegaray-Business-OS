#!/usr/bin/env bash
# Túneles HTTPS salientes hacia el OS + auto-registro de los endpoints.
#
# El OS se expone con túneles SALIENTES (cloudflared). Son DOS, porque son dos puertas distintas con
# autenticación distinta:
#
# CORRECCIÓN (27/08/2026, auditoría): este comentario decía «el server no acepta tráfico entrante
# salvo SSH» y era FALSO — medido desde afuera, `:8790` escuchaba en 0.0.0.0 y contestaba 200 desde
# la IP pública. Se cerró: los dos servicios escuchan ahora en 127.0.0.1 y el túnel se conecta por
# loopback, que es lo único que necesitaba. El túnel no está para sortear un firewall (este server no
# tiene uno que filtre): está para dar una URL HTTPS estable a Vercel sin publicar la IP de la VM.
#
#   :8790  motor interactivo  → os_runtime.interactive_endpoint  (extensión, /api/os/*)
#   :8791  puerta de XSAS     → os_runtime.xsas_endpoint         (/api/xsas)
#
# NO se unifican en un solo túnel con un proxy delante, y no es por comodidad: el motor interactivo
# tiene su propio token y la puerta de XSAS su propio secreto. Un proxy que reparta por ruta sería un
# lugar más donde una ruta puede quedar sin verificar — y «auth bypass» es exactamente el modo de
# falla que este archivo no puede introducir.
#
# La URL de un túnel rápido cambia en cada reinicio; por eso, apenas la tenemos, la publicamos en
# Supabase (os_runtime) y quien quiera hablar con el OS la lee primero. El frente estable de cara al
# mundo es Vercel (https://app.ecsas.com.ar/api/…), que no cambia nunca; lo que rota es el tramo
# interno, y rota solo. Un túnel con nombre fijo exige una cuenta de Cloudflare con la zona
# `ecsas.com.ar` (hoy el DNS está en DonWeb): es una decisión del dueño, no una limitación del código.
set -euo pipefail

# El directorio de la app sale de DÓNDE ESTÁ ESTE SCRIPT, no de una constante. Con la ruta escrita
# a mano, la copia productiva del script publicaba el endpoint corriendo el código del árbol de
# desarrollo: el servicio decía «producción» y ejecutaba otra cosa.
APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
NODE=/home/jorge/.nvm/versions/node/v24.18.0/bin/node
CF=${CLOUDFLARED_BIN:-/home/jorge/bin/cloudflared}

PIDS=()
LOGS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  for l in "${LOGS[@]:-}"; do rm -f "$l"; done
}
trap cleanup EXIT

# Levanta un túnel contra un puerto local y publica su URL bajo una clave. Devuelve por stdout el PID.
levantar() {
  local puerto=$1 clave=$2
  local log; log=$(mktemp "/tmp/os-tunnel-${clave}.XXXXXX.log")
  LOGS+=("$log")
  "$CF" tunnel --url "http://localhost:${puerto}" --no-autoupdate > "$log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")

  local url=""
  for _ in $(seq 1 30); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)
    [ -n "$url" ] && break
    kill -0 "$pid" 2>/dev/null || { echo "cloudflared (${clave}) murió antes de dar URL:"; cat "$log"; exit 1; }
    sleep 1
  done
  [ -z "$url" ] && { echo "no se obtuvo URL del túnel ${clave} en 30s"; exit 1; }

  echo "túnel ${clave} arriba: $url — publicando endpoint…"
  ( cd "$APP_DIR" && "$NODE" orquestador/scripts/os-endpoint.mjs set "$url" "$clave" ) \
    || echo "ADVERTENCIA: no se pudo publicar ${clave} en Supabase (el túnel sigue arriba)"
}

levantar 8790 interactive_endpoint
levantar 8791 xsas_endpoint

# Mantener el proceso vivo mientras vivan los túneles; si alguno cae, salimos y systemd nos reinicia
# — y el reinicio vuelve a publicar las dos URLs nuevas.
wait -n "${PIDS[@]}"
echo "un túnel cayó — saliendo para que systemd reinicie ambos"
exit 1

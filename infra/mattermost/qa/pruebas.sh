#!/usr/bin/env bash
# ==============================================================================
# Echegaray Business OS — Mattermost PR-2 (Path B: Caddy reverse proxy)
# QA de despliegue: pruebas READ-ONLY y reproducibles.
#
# QUÉ HACE: verifica que el aparato de comunicación (Mattermost + Caddy + OS)
#           esté sano y seguro, SIN mutar nada.
#
# ARQUITECTURA (Path B, elegida por el dueño — NO es Cloudflare Tunnel):
#   Internet ─(80/443)→ Caddy (echegaray-mm-caddy, contenedor del compose)
#                         │  termina TLS (Let's Encrypt/ZeroSSL, ACME automático)
#                         └─ reverse_proxy → mattermost:8065 (red interna del compose)
#   Mattermost sigue publicando SÓLO 127.0.0.1:8065 en el host (acceso local/VM).
#   Postgres sigue sin publicar puertos (sólo red interna).
#
# QUÉ NO HACE (regla de oro, no negociable):
#   - NO levanta/reinicia contenedores (ni Caddy ni MM ni DB).
#   - NO abre ni cierra puertos ni toca el firewall.
#   - NO corre el bootstrap ni crea canales.
#   - NO saca ni renueva certificados.
#   - Sólo LEE / CONSULTA (dig, curl -I, docker inspect/stats/logs, openssl,
#     ss, mmctl --local system status).
#
# CÓDIGO DE SALIDA:
#   0  -> todo lo que YA debería andar hoy, anda (aunque Caddy esté PENDIENTE).
#   1  -> algo que YA debería andar está ROTO (regresión real).
#
# La exposición pública por Caddy todavía puede no estar activa: eso se reporta
# PENDIENTE, NO hace fallar el script. La distinción clave es:
#   ROTO      = algo que hoy debería funcionar y no funciona            -> exit 1
#   PENDIENTE = algo que aún no fue activado (Caddy sin levantar, A      -> exit 0
#               record sin propagar, cert Let's Encrypt provisionando)
#
# USO:
#   bash infra/mattermost/qa/pruebas.sh          # todas las pruebas
#   bash infra/mattermost/qa/pruebas.sh -v       # verboso (muestra detalle)
#
# Requiere (en la VM): docker, curl (imprescindibles); dig, openssl, ss
# (recomendados — si faltan, esas verificaciones se omiten con WARN). mmctl es
# opcional (se usa vía `docker exec`, no hace falta instalarlo en el host).
# ==============================================================================

set -u  # variable no definida = error. NO usamos `set -e`: queremos correr
        # TODAS las pruebas y reportar, no abortar en la primera que falle.

# ── Parámetros (ajustables por entorno, con defaults reales de PR-1/PR-2) ─────
CHAT_HOST="${MM_CHAT_HOST:-chat.ecsas.com.ar}"      # hostname público de Mattermost (Caddy)
EXPECTED_IP="${MM_EXPECTED_IP:-64.176.22.159}"     # IP pública de la VM (A record esperado)
OS_HOST="${OS_HOST:-app.ecsas.com.ar}"             # hostname del Business OS (Vercel)
MM_LOOPBACK_HOST="${MM_LOOPBACK_HOST:-127.0.0.1}"  # MM sólo escucha en loopback
MM_LOOPBACK_PORT="${MM_LOOPBACK_PORT:-8065}"
MM_APP_CTR="${MM_APP_CTR:-echegaray-mm-app}"       # contenedor Mattermost
MM_DB_CTR="${MM_DB_CTR:-echegaray-mm-db}"          # contenedor Postgres dedicado
MM_CADDY_CTR="${MM_CADDY_CTR:-echegaray-mm-caddy}" # contenedor Caddy (reverse proxy TLS)
MEM_WARN_PCT="${MEM_WARN_PCT:-90}"                 # umbral de alerta de memoria (%)
CURL_TIMEOUT="${CURL_TIMEOUT:-12}"                 # segundos por request de red
WS_TIMEOUT="${WS_TIMEOUT:-6}"                       # WS: el 101 llega al instante; curl
                                                   # mantiene la conexión abierta, así que
                                                   # cortamos antes para no colgar la prueba

VERBOSE=0
[[ "${1:-}" == "-v" || "${1:-}" == "--verbose" ]] && VERBOSE=1

# ── Contadores y salida ──────────────────────────────────────────────────────
FAILS=0; PENDS=0; WARNS=0; OKS=0

# Colores sólo si la salida es una terminal.
if [[ -t 1 ]]; then
  C_OK=$'\e[32m'; C_FAIL=$'\e[31m'; C_PEND=$'\e[33m'; C_WARN=$'\e[35m'; C_DIM=$'\e[2m'; C_B=$'\e[1m'; C_0=$'\e[0m'
else
  C_OK=""; C_FAIL=""; C_PEND=""; C_WARN=""; C_DIM=""; C_B=""; C_0=""
fi

ok()   { OKS=$((OKS+1));   printf '  %s[ OK ]%s %s\n'        "$C_OK"   "$C_0" "$1"; }
fail() { FAILS=$((FAILS+1)); printf '  %s[FAIL]%s %s\n'      "$C_FAIL" "$C_0" "$1"; }
pend() { PENDS=$((PENDS+1)); printf '  %s[PEND]%s %s\n'      "$C_PEND" "$C_0" "$1"; }
warn() { WARNS=$((WARNS+1)); printf '  %s[WARN]%s %s\n'      "$C_WARN" "$C_0" "$1"; }
info() { [[ $VERBOSE -eq 1 ]] && printf '        %s%s%s\n'   "$C_DIM"  "$1" "$C_0"; return 0; }
sect() { printf '\n%s== %s ==%s\n' "$C_B" "$1" "$C_0"; }

have() { command -v "$1" >/dev/null 2>&1; }

# http_code <curl-args...> -> imprime SIEMPRE 3 dígitos (000 si no hubo respuesta).
# curl con -w '%{http_code}' ya emite "000" en fallo de conexión; el problema es que
# además sale con código != 0 (y en un upgrade WebSocket 101 mantiene la conexión hasta
# el timeout). NO encadenamos `|| echo 000` porque duplicaría la salida ("101000").
# Capturamos la salida tal cual y normalizamos a 3 dígitos.
http_code() {
  local out
  out=$(curl -s -o /dev/null -w '%{http_code}' "$@" 2>/dev/null)
  [[ "$out" =~ ^[0-9]{3}$ ]] && printf '%s' "$out" || printf '000'
}

# ==============================================================================
sect "0. Herramientas disponibles"
# ==============================================================================
MISSING=""
for t in docker curl; do have "$t" || MISSING="$MISSING $t"; done
if [[ -n "$MISSING" ]]; then
  fail "Faltan herramientas imprescindibles:$MISSING (esta prueba corre EN LA VM)"
  # Sin docker/curl no tiene sentido seguir: es un problema de entorno, no del despliegue.
  echo; printf '%sAbortando: entorno incompleto.%s\n' "$C_FAIL" "$C_0"; exit 1
fi
have dig     || warn "dig no está instalado -> pruebas de DNS se omiten (instalar dnsutils/bind-tools)"
have openssl || warn "openssl no está instalado -> validación fina de certificado se omite"
have ss      || warn "ss no está instalado -> verificación de sockets se omite (instalar iproute2)"
ok "docker y curl presentes"

# ==============================================================================
sect "1. Salud local de Mattermost (DEBE andar hoy)"
# ==============================================================================
# 1a. Contenedores existen y están 'healthy' según Docker.
for ctr in "$MM_APP_CTR" "$MM_DB_CTR"; do
  if ! docker inspect "$ctr" >/dev/null 2>&1; then
    fail "Contenedor '$ctr' no existe (¿se levantó el stack de PR-1?)"
    continue
  fi
  state=$(docker inspect --format '{{.State.Status}}' "$ctr" 2>/dev/null)
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}}' "$ctr" 2>/dev/null)
  if [[ "$state" == "running" && "$health" == "healthy" ]]; then
    ok "Contenedor '$ctr': running + healthy"
  elif [[ "$state" == "running" && "$health" == "sin-healthcheck" ]]; then
    warn "Contenedor '$ctr': running pero sin healthcheck definido"
  else
    fail "Contenedor '$ctr': estado='$state' health='$health' (debería running+healthy)"
  fi
done

# 1b. Ping HTTP en loopback -> Mattermost vivo. Endpoint oficial: /api/v4/system/ping
ping_code=$(http_code --max-time "$CURL_TIMEOUT" \
  "http://${MM_LOOPBACK_HOST}:${MM_LOOPBACK_PORT}/api/v4/system/ping")
if [[ "$ping_code" == "200" ]]; then
  ok "MM responde /api/v4/system/ping en ${MM_LOOPBACK_HOST}:${MM_LOOPBACK_PORT} (HTTP 200)"
else
  fail "MM NO responde ping en loopback (HTTP $ping_code) — la app debería estar arriba"
fi

# 1c. mmctl --local: estado interno de servidor/DB/filestore (socket interno, no expuesto).
if mmctl_out=$(docker exec "$MM_APP_CTR" /mattermost/bin/mmctl --local system status 2>/dev/null); then
  if grep -qi 'Server status: OK' <<<"$mmctl_out"; then
    ok "mmctl --local system status: Server OK"
    grep -qi 'Database Status: OK'  <<<"$mmctl_out" && info "Database Status: OK"
    grep -qi 'Filestore Status: OK' <<<"$mmctl_out" && info "Filestore Status: OK"
  else
    fail "mmctl --local no reporta 'Server status: OK'"
    info "$mmctl_out"
  fi
else
  warn "No se pudo ejecutar mmctl --local (¿ENABLELOCALMODE off o contenedor sin permisos?)"
fi

# 1d. WebSocket LOCAL: Mattermost EXIGE WebSocket para tiempo real.
#     Endpoint oficial: /api/v4/websocket -> debe devolver 101 Switching Protocols.
#     Se prueba contra loopback (siempre debería andar, no depende de Caddy).
ws_local=$(http_code --max-time "$WS_TIMEOUT" \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://${MM_LOOPBACK_HOST}:${MM_LOOPBACK_PORT}/api/v4/websocket")
if [[ "$ws_local" == "101" ]]; then
  ok "WebSocket local /api/v4/websocket -> 101 Switching Protocols (tiempo real OK)"
else
  fail "WebSocket local NO hace upgrade (HTTP $ws_local, se esperaba 101)"
fi

# ==============================================================================
sect "2. Aislamiento y superficie de red (DEBE cumplirse hoy)"
# ==============================================================================
# Con Path B (Caddy) SÍ se abren 80/443 al exterior (los publica Caddy) — eso es
# esperado y correcto (§6 lo verifica). Lo que NUNCA debe pasar:
#   - Postgres 5432 publicado al host.
#   - Mattermost 8065 en 0.0.0.0 (debe seguir SÓLO en 127.0.0.1: Caddy lo alcanza
#     por la red interna del compose como `mattermost:8065`, no por un puerto abierto).
if have ss; then
  pg_listen=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -E '(:|\.)5432$' || true)
  if [[ -z "$pg_listen" ]]; then
    ok "Postgres 5432 NO está publicado en el host (aislado en red interna del compose)"
  else
    # Si aparece, distinguir 0.0.0.0 (grave) de 127.0.0.1 (menos grave pero no deseado).
    if grep -qE '(^|[^0-9])0\.0\.0\.0:5432|(^|[^0-9])\[::\]:5432|\*:5432' <<<"$pg_listen"; then
      fail "Postgres 5432 EXPUESTO a 0.0.0.0 (¡debe ser sólo interno!): $pg_listen"
    else
      warn "Postgres 5432 escucha en el host ($pg_listen). PR-1 lo quiere sólo en red interna."
    fi
  fi
  # 2b. Mattermost debe escuchar SÓLO en loopback, nunca 0.0.0.0.
  mm_listen=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -E "(:|\.)${MM_LOOPBACK_PORT}\$" || true)
  if [[ -z "$mm_listen" ]]; then
    warn "No veo el puerto ${MM_LOOPBACK_PORT} escuchando en el host (¿port mapping distinto?)"
  elif grep -qE "(^|[^0-9])0\.0\.0\.0:${MM_LOOPBACK_PORT}|\*:${MM_LOOPBACK_PORT}|\[::\]:${MM_LOOPBACK_PORT}" <<<"$mm_listen"; then
    fail "Mattermost ${MM_LOOPBACK_PORT} EXPUESTO a 0.0.0.0 — debe ser sólo 127.0.0.1 (lo publica Caddy por la red interna, no el host)"
  elif grep -qE "127\.0\.0\.1:${MM_LOOPBACK_PORT}" <<<"$mm_listen"; then
    ok "Mattermost ${MM_LOOPBACK_PORT} escucha SÓLO en 127.0.0.1 (correcto: al público entra por Caddy)"
  else
    warn "Mattermost ${MM_LOOPBACK_PORT} escucha en '$mm_listen' (revisar que sea loopback)"
  fi
else
  # Fallback sin ss: leer el port mapping de docker (no ve 0.0.0.0 del host directamente,
  # pero confirma la intención del compose).
  map=$(docker port "$MM_APP_CTR" 2>/dev/null || true)
  if grep -q '127.0.0.1:' <<<"$map"; then
    ok "docker port confirma mapeo a 127.0.0.1 (ss no disponible para verificación fina)"
  else
    warn "Sin ss y sin mapeo 127.0.0.1 claro en 'docker port' — verificar manualmente"
  fi
  info "$map"
fi

# ==============================================================================
sect "3. Consumo de recursos (informativo / alerta blanda)"
# ==============================================================================
# Incluye Caddy si el contenedor existe (es liviano; alpine). Se listan sólo los
# contenedores presentes para no ensuciar la salida antes de levantar Caddy.
STATS_CTRS=("$MM_APP_CTR" "$MM_DB_CTR")
docker inspect "$MM_CADDY_CTR" >/dev/null 2>&1 && STATS_CTRS+=("$MM_CADDY_CTR")
stats=$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' \
  "${STATS_CTRS[@]}" 2>/dev/null || true)
if [[ -z "$stats" ]]; then
  warn "docker stats no devolvió datos"
else
  while IFS='|' read -r name cpu mem memp; do
    [[ -z "$name" ]] && continue
    mempn=${memp%\%}; mempn=${mempn%.*}
    if [[ "$mempn" =~ ^[0-9]+$ ]] && (( mempn >= MEM_WARN_PCT )); then
      warn "$name usa $memp de memoria (>= ${MEM_WARN_PCT}%) — CPU $cpu, $mem"
    else
      ok "$name: CPU $cpu, MEM $mem ($memp)"
    fi
  done <<<"$stats"
fi

# ==============================================================================
sect "4. Revisión de logs recientes (alerta blanda)"
# ==============================================================================
# Buscamos señales de error en las últimas líneas. No falla duro: reporta.
# Ruido benigno ESPERADO antes del bootstrap (WT2 aún no creó admin/equipo/canales):
#   - "Failed to get system bot" / "List of admins is empty": Mattermost intenta usar el
#     bot de sistema para recordatorios y no hay admin todavía. Desaparece tras el bootstrap.
#   - '0 errors' / 'error_url': campos informativos, no incidentes.
# Ruido benigno ESPERADO en Caddy antes de tener el A record / cert:
#   - "obtaining certificate" / "challenge failed" / "no OCSP" mientras ACME reintenta:
#     Caddy reintenta solo hasta que DNS propaga y saca el cert. No es incidente.
# Si esta lista tapa un error real, se ve igual con: docker logs --tail 200 <ctr>.
BENIGN_RE='0 errors|error_?url|Failed to get system bot|List of admins is empty|obtaining certificate|solving challenge|challenge failed|no matching|will retry|context canceled'
INCLUDE_RE='"level":"(error|critical|fatal)"|level=error|"level":"error"|FATAL|PANIC'
LOG_CTRS=("$MM_APP_CTR" "$MM_DB_CTR")
docker inspect "$MM_CADDY_CTR" >/dev/null 2>&1 && LOG_CTRS+=("$MM_CADDY_CTR")
for ctr in "${LOG_CTRS[@]}"; do
  docker inspect "$ctr" >/dev/null 2>&1 || continue
  logs=$(docker logs --tail 200 "$ctr" 2>&1 || true)
  real=$(grep -iE "$INCLUDE_RE" <<<"$logs" | grep -viE "$BENIGN_RE" || true)
  # grep -c ya imprime "0" cuando no hay coincidencias (aunque salga con código 1):
  # NO encadenar `|| echo 0` o duplicaría la cuenta.
  benign=$(grep -icE "$INCLUDE_RE" <<<"$logs"); benign=${benign:-0}
  if [[ -z "$real" ]]; then errcount=0; else errcount=$(grep -c . <<<"$real"); fi
  if [[ "$errcount" == "0" ]]; then
    if [[ "$benign" -gt 0 ]]; then
      ok "$ctr: sin errores reales en 200 líneas ($benign línea(s) de ruido benigno pre-activación, esperado)"
    else
      ok "$ctr: sin errores/critical/fatal en las últimas 200 líneas de log"
    fi
  else
    warn "$ctr: $errcount línea(s) de error/critical/fatal NO esperado en las últimas 200 (revisar: docker logs --tail 200 $ctr)"
    [[ $VERBOSE -eq 1 ]] && tail -5 <<<"$real" | sed 's/^/          /'
  fi
done

# ==============================================================================
sect "5. Business OS sigue respondiendo (DEBE andar hoy)"
# ==============================================================================
# El OS es independiente de Mattermost/Caddy. Que Caddy/MM cambien no debe afectarlo.
os_code=$(http_code --max-time "$CURL_TIMEOUT" -L "https://${OS_HOST}/")
# Cualquier respuesta HTTP (2xx/3xx/401/403) prueba que el OS está vivo; 000 = inalcanzable.
if [[ "$os_code" =~ ^(2|3)[0-9][0-9]$ || "$os_code" == "401" || "$os_code" == "403" ]]; then
  ok "OS ${OS_HOST} responde (HTTP $os_code) — no afectado por el aparato de comunicación"
elif [[ "$os_code" == "000" ]]; then
  fail "OS ${OS_HOST} INALCANZABLE (HTTP 000) — debería estar arriba (o revisar salida de red de la VM)"
else
  warn "OS ${OS_HOST} respondió HTTP $os_code (inesperado, revisar)"
fi

# ==============================================================================
sect "6. Exposición pública de Mattermost por Caddy (PENDIENTE hasta activar)"
# ==============================================================================
# Estas pruebas SÓLO fallan si Caddy YA está publicando pero algo está roto.
# Si todavía no se activó la exposición pública -> PENDIENTE (no FAIL). Se activa
# PENDIENTE cuando alguna de estas condiciones aún no se cumple:
#   - el contenedor Caddy no está corriendo (aún no `docker compose up -d caddy`);
#   - el A record `chat` -> IP de la VM no propagó todavía (Caddy no puede sacar cert);
#   - Caddy corre y el DNS propagó pero 443 todavía no responde (ACME provisionando).

# 6a. ¿Existe y corre el contenedor Caddy? (señal local primaria en la VM)
caddy_running=0
if docker inspect "$MM_CADDY_CTR" >/dev/null 2>&1; then
  c_state=$(docker inspect --format '{{.State.Status}}' "$MM_CADDY_CTR" 2>/dev/null)
  c_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin-healthcheck{{end}}' "$MM_CADDY_CTR" 2>/dev/null)
  if [[ "$c_state" == "running" ]]; then
    caddy_running=1
    if [[ "$c_health" == "healthy" || "$c_health" == "sin-healthcheck" ]]; then
      ok "Contenedor Caddy '$MM_CADDY_CTR': running${c_health:+ ($c_health)}"
    else
      warn "Contenedor Caddy '$MM_CADDY_CTR': running pero health='$c_health'"
    fi
  else
    warn "Contenedor Caddy '$MM_CADDY_CTR' existe pero estado='$c_state' (no running)"
  fi
else
  pend "Caddy no desplegado todavía: contenedor '$MM_CADDY_CTR' no existe (activar con 'docker compose up -d caddy' — ver ACTIVACION-NIVEL-E.md)"
fi

# 6b. 80/443 publicados en el host por Caddy (esperado en Path B; informativo).
if have ss && [[ $caddy_running -eq 1 ]]; then
  http_listen=$(ss -ltn 2>/dev/null | awk '{print $4}' | grep -E '(:|\.)(80|443)$' || true)
  if grep -qE '(:|\.)443$' <<<"$http_listen" && grep -qE '(:|\.)80$' <<<"$http_listen"; then
    ok "Puertos 80 y 443 publicados en el host (Caddy expone HTTP+HTTPS — correcto en Path B)"
  else
    warn "Caddy corre pero no veo 80 y 443 publicados en el host (revisar port mapping del compose)"
    info "listeners 80/443: ${http_listen:-ninguno}"
  fi
fi

# 6c. DNS del hostname público -> debe apuntar a la IP de la VM.
dns_ok=0
if have dig; then
  dns_ans=$(dig +short +time=3 +tries=2 "$CHAT_HOST" A 2>/dev/null | grep -E '^[0-9]' || true)
  if [[ -n "$dns_ans" ]]; then
    if grep -qx "$EXPECTED_IP" <<<"$dns_ans"; then
      dns_ok=1
      ok "DNS: $CHAT_HOST -> $EXPECTED_IP (A record correcto en DonWeb)"
    else
      dns_ok=1
      warn "DNS: $CHAT_HOST resuelve a '$dns_ans' pero se esperaba $EXPECTED_IP (¿A record a otra IP?)"
    fi
  else
    pend "DNS: $CHAT_HOST aún no resuelve (falta el A record 'chat' -> $EXPECTED_IP en DonWeb, o no propagó)"
  fi
else
  info "dig no disponible: el estado DNS se infiere de la respuesta HTTPS"
fi

# 6d. ¿Caddy ya publica HTTPS? Determina si lo de abajo es MUST o PENDIENTE.
#     Gate: si el ping público no responde (000), es PENDIENTE con motivo preciso.
pub_code=$(http_code --max-time "$CURL_TIMEOUT" "https://${CHAT_HOST}/api/v4/system/ping")
if [[ "$pub_code" == "000" ]]; then
  if [[ $caddy_running -eq 0 ]]; then
    pend "HTTPS público: https://${CHAT_HOST} no responde — Caddy aún no está levantado"
  elif have dig && [[ $dns_ok -eq 0 ]]; then
    pend "HTTPS público: https://${CHAT_HOST} no responde — el A record aún no propagó (Caddy no puede sacar el cert sin DNS)"
  else
    pend "HTTPS público: https://${CHAT_HOST} no responde todavía — Caddy provisionando el certificado Let's Encrypt/ZeroSSL (ACME reintenta solo)"
  fi
  pend "SSL/cadena/vencimiento: se validará cuando Caddy publique HTTPS"
  pend "Redirección 80 -> 443: se validará cuando Caddy publique HTTP"
  pend "WebSocket público /api/v4/websocket: se validará cuando Caddy publique HTTPS"
  pend "App móvil oficial (Android/iPhone): validación manual del dueño (ver CHECKLIST-PRODUCCION.md / ACTIVACION-NIVEL-E.md)"
else
  # ── Caddy YA publica HTTPS: de acá en más, un fallo es ROTO, no PENDIENTE. ──
  if [[ "$pub_code" == "200" ]]; then
    ok "HTTPS público: https://${CHAT_HOST}/api/v4/system/ping -> HTTP 200 (MM publicado por Caddy)"
  else
    fail "Caddy responde pero /api/v4/system/ping devolvió HTTP $pub_code (se esperaba 200)"
  fi

  # 6e. HTTPS real: certificado válido, cadena confiable, no self-signed, no vencido.
  #     Caddy usa Let's Encrypt o ZeroSSL (ambos CAs públicas confiables): NO se exige
  #     un emisor concreto, sólo que la cadena sea confiable y no sea self-signed.
  if have openssl; then
    cert=$(echo | timeout "$CURL_TIMEOUT" openssl s_client -connect "${CHAT_HOST}:443" \
            -servername "$CHAT_HOST" 2>/dev/null)
    if [[ -z "$cert" ]]; then
      fail "No se pudo abrir sesión TLS con ${CHAT_HOST}:443 (Caddy responde HTTP pero TLS falló)"
    else
      # verify: 'Verify return code: 0 (ok)' => cadena confiable.
      if grep -q 'Verify return code: 0 (ok)' <<<"$cert"; then
        ok "SSL: cadena confiable (Verify return code: 0 ok — no self-signed)"
      else
        vr=$(grep 'Verify return code:' <<<"$cert" | head -1)
        fail "SSL: cadena NO confiable -> ${vr:-sin código de verificación} (¿Caddy sirviendo su cert interno self-signed porque ACME aún no completó?)"
      fi
      # subject == issuer => self-signed.
      subj=$(sed -n 's/^subject=//p' <<<"$cert" | head -1)
      iss=$(sed -n 's/^issuer=//p'  <<<"$cert" | head -1)
      if [[ -n "$subj" && "$subj" == "$iss" ]]; then
        fail "SSL: certificado self-signed (subject == issuer): $subj"
      else
        info "issuer: ${iss:-?}"
        # Informativo: confirmar que el emisor es uno de los CAs por defecto de Caddy.
        if grep -qiE "let's encrypt|zerossl" <<<"$iss"; then
          info "emisor reconocido (Let's Encrypt / ZeroSSL — CA por defecto de Caddy)"
        fi
      fi
      # Vencimiento: que le queden al menos 7 días.
      pem=$(sed -n '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' <<<"$cert")
      if [[ -n "$pem" ]]; then
        if echo "$pem" | openssl x509 -noout -checkend $((7*86400)) >/dev/null 2>&1; then
          notafter=$(echo "$pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
          ok "SSL: certificado vigente (vence: ${notafter:-?}, > 7 días)"
        else
          notafter=$(echo "$pem" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
          fail "SSL: certificado vence en < 7 días o ya venció (notAfter: ${notafter:-?})"
        fi
      fi
    fi
  else
    # Sin openssl: al menos que curl no se queje del certificado.
    if curl -sS -o /dev/null --max-time "$CURL_TIMEOUT" "https://${CHAT_HOST}/api/v4/system/ping" 2>/dev/null; then
      ok "SSL: curl aceptó el certificado de ${CHAT_HOST} (validación fina requiere openssl)"
    else
      fail "SSL: curl rechazó el certificado de ${CHAT_HOST}"
    fi
  fi

  # 6f. Puerto 80: Caddy redirige HTTP -> HTTPS automáticamente (y sirve el reto ACME).
  #     No seguimos la redirección (-L off): sólo confirmamos el 3xx a HTTPS.
  http80=$(http_code --max-time "$CURL_TIMEOUT" "http://${CHAT_HOST}/")
  if [[ "$http80" =~ ^30[0-9]$ ]]; then
    ok "Puerto 80: http://${CHAT_HOST}/ -> HTTP $http80 (Caddy redirige a HTTPS, comportamiento por defecto)"
  elif [[ "$http80" == "200" ]]; then
    warn "Puerto 80: devolvió 200 en '/' (se esperaba redirección 3xx a HTTPS; 200 puede ser un reto ACME sirviéndose)"
  elif [[ "$http80" == "000" ]]; then
    fail "Puerto 80: http://${CHAT_HOST}/ no responde — Caddy necesita 80 abierto para el reto ACME y para redirigir a HTTPS"
  else
    warn "Puerto 80: http://${CHAT_HOST}/ devolvió HTTP $http80 (inesperado, revisar)"
  fi

  # 6g. WebSocket público: MM necesita WS a través de Caddy para el tiempo real móvil/web.
  #     Caddy hace de reverse_proxy y pasa el Upgrade de forma transparente.
  ws_pub=$(http_code --max-time "$WS_TIMEOUT" \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "https://${CHAT_HOST}/api/v4/websocket")
  if [[ "$ws_pub" == "101" ]]; then
    ok "WebSocket público https://${CHAT_HOST}/api/v4/websocket -> 101 (tiempo real por Caddy OK)"
  else
    fail "WebSocket público NO hace upgrade (HTTP $ws_pub) — Caddy debe pasar el Upgrade/WS al backend"
  fi
fi

# ==============================================================================
sect "Resumen"
# ==============================================================================
printf '  %sOK:%s %d   %sPENDIENTE:%s %d   %sWARN:%s %d   %sFAIL:%s %d\n' \
  "$C_OK" "$C_0" "$OKS" "$C_PEND" "$C_0" "$PENDS" "$C_WARN" "$C_0" "$WARNS" "$C_FAIL" "$C_0" "$FAILS"

if (( FAILS > 0 )); then
  printf '\n%sRESULTADO: hay %d regresión(es) — algo que YA debería andar está roto.%s\n' "$C_FAIL" "$FAILS" "$C_0"
  exit 1
fi
if (( PENDS > 0 )); then
  printf '\n%sRESULTADO: sano. Quedan %d ítem(s) PENDIENTE(s) de activación (Caddy/DNS/cert/móvil).%s\n' "$C_PEND" "$PENDS" "$C_0"
else
  printf '\n%sRESULTADO: todo verde — despliegue publicado por Caddy y sano.%s\n' "$C_OK" "$C_0"
fi
exit 0

#!/usr/bin/env bash
# ==============================================================================
# Echegaray Business OS — Mattermost PR-2
# QA de despliegue: pruebas READ-ONLY y reproducibles.
#
# QUÉ HACE: verifica que el aparato de comunicación (Mattermost + Cloudflare
#           Tunnel + OS) esté sano y seguro, SIN mutar nada.
#
# QUÉ NO HACE (regla de oro, no negociable):
#   - NO reinicia contenedores.
#   - NO toca el túnel de Cloudflare.
#   - NO abre ni cierra puertos.
#   - NO corre el bootstrap ni crea canales.
#   - Sólo LEE / CONSULTA (dig, curl -I, docker inspect/stats/logs, openssl,
#     ss, mmctl --local system status).
#
# CÓDIGO DE SALIDA:
#   0  -> todo lo que YA debería andar hoy, anda (aunque el túnel esté PENDIENTE).
#   1  -> algo que YA debería andar está ROTO (regresión real).
#
# El túnel público todavía puede no estar activo: eso se reporta PENDIENTE,
# NO hace fallar el script. La distinción clave es:
#   ROTO      = algo que hoy debería funcionar y no funciona  -> exit 1
#   PENDIENTE = algo que aún no fue activado por el dueño/WT1  -> exit 0
#
# USO:
#   bash infra/mattermost/qa/pruebas.sh          # todas las pruebas
#   bash infra/mattermost/qa/pruebas.sh -v       # verboso (muestra detalle)
#
# Requiere (en la VM): docker, dig, curl, openssl, ss. mmctl es opcional
# (se usa vía `docker exec`, no hace falta instalarlo en el host).
# ==============================================================================

set -u  # variable no definida = error. NO usamos `set -e`: queremos correr
        # TODAS las pruebas y reportar, no abortar en la primera que falle.

# ── Parámetros (ajustables por entorno, con defaults reales de PR-1/PR-2) ─────
CHAT_HOST="${MM_CHAT_HOST:-chat.ecsas.com.ar}"      # hostname público de Mattermost (WT1)
OS_HOST="${OS_HOST:-app.ecsas.com.ar}"             # hostname del Business OS (Vercel)
MM_LOOPBACK_HOST="${MM_LOOPBACK_HOST:-127.0.0.1}"  # MM sólo escucha en loopback
MM_LOOPBACK_PORT="${MM_LOOPBACK_PORT:-8065}"
MM_APP_CTR="${MM_APP_CTR:-echegaray-mm-app}"       # contenedor Mattermost
MM_DB_CTR="${MM_DB_CTR:-echegaray-mm-db}"          # contenedor Postgres dedicado
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
#     Se prueba contra loopback (siempre debería andar, no depende del túnel).
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
# 2a. Postgres NO debe estar publicado al host en absoluto (ni loopback ni 0.0.0.0).
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
    fail "Mattermost ${MM_LOOPBACK_PORT} EXPUESTO a 0.0.0.0 — debe ser sólo 127.0.0.1 (lo publica el túnel, no el host)"
  elif grep -qE "127\.0\.0\.1:${MM_LOOPBACK_PORT}" <<<"$mm_listen"; then
    ok "Mattermost ${MM_LOOPBACK_PORT} escucha SÓLO en 127.0.0.1 (correcto: entra por el túnel)"
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
stats=$(docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}' \
  "$MM_APP_CTR" "$MM_DB_CTR" 2>/dev/null || true)
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
# Si esta lista tapa un error real, se ve igual con: docker logs --tail 200 <ctr>.
BENIGN_RE='0 errors|error_?url|Failed to get system bot|List of admins is empty'
INCLUDE_RE='"level":"(error|critical|fatal)"|level=error|FATAL|PANIC'
for ctr in "$MM_APP_CTR" "$MM_DB_CTR"; do
  docker inspect "$ctr" >/dev/null 2>&1 || continue
  logs=$(docker logs --tail 200 "$ctr" 2>&1 || true)
  real=$(grep -iE "$INCLUDE_RE" <<<"$logs" | grep -viE "$BENIGN_RE" || true)
  # grep -c ya imprime "0" cuando no hay coincidencias (aunque salga con código 1):
  # NO encadenar `|| echo 0` o duplicaría la cuenta.
  benign=$(grep -icE "$INCLUDE_RE" <<<"$logs"); benign=${benign:-0}
  if [[ -z "$real" ]]; then errcount=0; else errcount=$(grep -c . <<<"$real"); fi
  if [[ "$errcount" == "0" ]]; then
    if [[ "$benign" -gt 0 ]]; then
      ok "$ctr: sin errores reales en 200 líneas ($benign línea(s) de ruido benigno pre-bootstrap, esperado)"
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
# El OS es independiente de Mattermost. Que el túnel/MM cambien no debe afectarlo.
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
sect "6. Exposición pública de Mattermost por el túnel (PENDIENTE hasta WT1)"
# ==============================================================================
# Estas pruebas SÓLO fallan si el túnel YA está activo pero algo está roto.
# Si el túnel aún no se creó (DNS sin registro / sin respuesta HTTPS) -> PENDIENTE.

# 6a. DNS del hostname público.
dns_ok=0
if have dig; then
  dns_ans=$(dig +short +time=3 +tries=2 "$CHAT_HOST" 2>/dev/null | grep -vE '^;;' || true)
  if [[ -n "$dns_ans" ]]; then
    dns_ok=1
    ok "DNS: $CHAT_HOST resuelve"
    info "$dns_ans"
  else
    pend "DNS: $CHAT_HOST no resuelve todavía (falta el CNAME en DonWeb apuntando al túnel)"
  fi
else
  # Sin dig, intentamos inferir por conectividad HTTPS más abajo.
  info "dig no disponible: el estado DNS se infiere de la respuesta HTTPS"
fi

# 6b. ¿El túnel está sirviendo HTTPS? Determina si las pruebas de abajo son MUST o PENDIENTE.
tunnel_code=$(http_code --max-time "$CURL_TIMEOUT" "https://${CHAT_HOST}/api/v4/system/ping")
if [[ "$tunnel_code" == "000" ]]; then
  pend "Túnel público: https://${CHAT_HOST} aún no responde — Cloudflare Tunnel no activado (tarea de WT1 + CNAME + login del dueño)"
  pend "SSL/cadena/vencimiento: se validará cuando el túnel esté activo"
  pend "WebSocket público /api/v4/websocket: se validará cuando el túnel esté activo"
  pend "App móvil oficial: validación manual del dueño cuando el túnel esté activo (ver CHECKLIST-PRODUCCION.md)"
else
  # ── El túnel YA responde: de acá en más, un fallo es ROTO, no PENDIENTE. ──
  if [[ "$tunnel_code" == "200" ]]; then
    ok "Túnel público: https://${CHAT_HOST}/api/v4/system/ping -> HTTP 200 (MM publicado)"
  else
    fail "Túnel activo pero /api/v4/system/ping devolvió HTTP $tunnel_code (se esperaba 200)"
  fi

  # 6c. HTTPS real: certificado válido, no self-signed, cadena confiable, no vencido.
  if have openssl; then
    cert=$(echo | timeout "$CURL_TIMEOUT" openssl s_client -connect "${CHAT_HOST}:443" \
            -servername "$CHAT_HOST" 2>/dev/null)
    if [[ -z "$cert" ]]; then
      fail "No se pudo abrir sesión TLS con ${CHAT_HOST}:443 (túnel responde HTTP pero TLS falló)"
    else
      # verify: 'Verify return code: 0 (ok)' => cadena confiable.
      if grep -q 'Verify return code: 0 (ok)' <<<"$cert"; then
        ok "SSL: cadena confiable (Verify return code: 0 ok — no self-signed)"
      else
        vr=$(grep 'Verify return code:' <<<"$cert" | head -1)
        fail "SSL: cadena NO confiable -> ${vr:-sin código de verificación}"
      fi
      # subject == issuer => self-signed.
      subj=$(sed -n 's/^subject=//p' <<<"$cert" | head -1)
      iss=$(sed -n 's/^issuer=//p'  <<<"$cert" | head -1)
      if [[ -n "$subj" && "$subj" == "$iss" ]]; then
        fail "SSL: certificado self-signed (subject == issuer): $subj"
      else
        info "issuer: ${iss:-?}"
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

  # 6d. WebSocket público: MM necesita WS a través del túnel para el tiempo real móvil/web.
  ws_pub=$(http_code --max-time "$WS_TIMEOUT" \
    -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    "https://${CHAT_HOST}/api/v4/websocket")
  if [[ "$ws_pub" == "101" ]]; then
    ok "WebSocket público https://${CHAT_HOST}/api/v4/websocket -> 101 (tiempo real por el túnel OK)"
  else
    fail "WebSocket público NO hace upgrade (HTTP $ws_pub) — el túnel debe permitir Upgrade/WS"
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
  printf '\n%sRESULTADO: sano. Quedan %d ítem(s) PENDIENTE(s) de activación (túnel/DNS/móvil).%s\n' "$C_PEND" "$PENDS" "$C_0"
else
  printf '\n%sRESULTADO: todo verde — despliegue publicado y sano.%s\n' "$C_OK" "$C_0"
fi
exit 0

#!/bin/sh
# ARRANQUE DEL NAVEGADOR DE BALANZ: display → gestor de ventanas → VNC → Chromium.
#
# Chromium queda en PRIMER PLANO a propósito. Es el proceso que importa: si se muere, el contenedor
# muere, y la política de reinicio de Docker lo vuelve a levantar. Un entrypoint que sobrevive a la
# muerte del navegador es un contenedor "sano" sin navegador — la clase de verde que no significa
# nada, y que este repo ya pagó cara en otros servicios.
set -eu

ANCHO=${ANCHO:-1600}
ALTO=${ALTO:-1000}
DISPLAY=${DISPLAY:-:99}
export DISPLAY
PERFIL=${PERFIL:-/profile/chrome-balanz}
ESTADO=${ESTADO:-/estado}
URL_INICIAL=${URL_INICIAL:-https://clientes.balanz.com}

log() { echo "[balanz-runtime] $*"; }

# ── 1 · DISPLAY ─────────────────────────────────────────────────────────────────────────────────
# El lock queda si el contenedor murió mal; sin borrarlo, Xvfb se niega a arrancar y el contenedor
# entra en un bucle de reinicio que parece un problema de red.
rm -f "/tmp/.X${DISPLAY#:}-lock" 2>/dev/null || true
log "Xvfb ${DISPLAY} ${ANCHO}x${ALTO}"
Xvfb "$DISPLAY" -screen 0 "${ANCHO}x${ALTO}x24" -nolisten tcp &
XVFB_PID=$!

# Esperar el socket de verdad, no `sleep 2`. Un sleep fijo funciona en la máquina donde se escribió.
i=0
while [ ! -e "/tmp/.X11-unix/X${DISPLAY#:}" ]; do
  i=$((i + 1))
  [ "$i" -gt 100 ] && { log "ERROR: Xvfb no levantó en 10 s"; exit 1; }
  kill -0 "$XVFB_PID" 2>/dev/null || { log "ERROR: Xvfb murió al arrancar"; exit 1; }
  sleep 0.1
done
log "display listo"

# ── 2 · GESTOR DE VENTANAS ──────────────────────────────────────────────────────────────────────
# Sin gestor de ventanas los diálogos de Chromium abren sin foco de teclado: la pantalla remota se
# vería bien y no se podría tipear la contraseña en ella.
openbox --sm-disable &

# ── 3 · VNC ─────────────────────────────────────────────────────────────────────────────────────
#
# La contraseña se genera SOLA la primera vez y queda en el estado bind-monteado, que la pasarela del
# host lee para armar la sesión remota. Nunca se escribe en el repo, ni en la imagen, ni en un log, y
# no es una credencial de Balanz: sólo protege el acceso al escritorio.
#
# `-localhost` hace que x11vnc escuche en 127.0.0.1 DEL CONTENEDOR, y ahí no lo alcanzaría el
# publicado de Docker. Por eso NO se usa: el aislamiento lo dan la red propia del contenedor y el
# publicado a 127.0.0.1 del host (ver `balanz-runtime.mjs`), no un bind interno.
mkdir -p "$ESTADO"
CLAVE="$ESTADO/vnc.pass"
PLANA="$ESTADO/vnc.plain"
if [ ! -f "$CLAVE" ] || [ ! -f "$PLANA" ]; then
  log "generando contraseña de escritorio remoto (primera vez)"
  # `-storepasswd` guarda la clave ofuscada, que es lo que x11vnc sabe leer. La pasarela del host
  # necesita además la versión en claro para dársela al cliente del escritorio, así que se guarda
  # aparte y con permisos de sólo dueño. NO es una credencial de Balanz: da acceso a la pantalla,
  # nunca a la cuenta, y el login del bróker se sigue haciendo a mano sobre esa pantalla.
  #
  # OCHO CARACTERES, Y NO ES UNA CONCESIÓN: el esquema de autenticación de VNC usa DES con una clave
  # de 8 bytes, así que `-storepasswd` TRUNCA a 8 y el cliente también. La versión anterior generaba
  # 24 y guardaba 24 en claro, con lo cual el archivo prometía ~2^143 de entropía y el efecto real
  # era ~2^47. No cambiaba la exposición —detrás hay loopback y un token firmado— pero un comentario
  # que promete más de lo que el mecanismo entrega es exactamente lo que hace que nadie vuelva a
  # revisarlo. Se generan 8 y se dice por qué.
  NUEVA=$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 8)
  x11vnc -storepasswd "$NUEVA" "$CLAVE" >/dev/null 2>&1
  printf '%s' "$NUEVA" > "$PLANA"
  chmod 0600 "$CLAVE" "$PLANA"
  unset NUEVA
fi
# SIN `-nopw`: esa opción convive mal con `-rfbauth` y su combinación dejaba el escritorio sin
# credencial. El aislamiento de red es la primera defensa (el puerto sólo existe en 127.0.0.1 de la
# VM), y la credencial es la segunda.
x11vnc -display "$DISPLAY" -rfbauth "$CLAVE" -rfbport 5900 -forever -shared \
       -noxdamage -quiet -bg -o "$ESTADO/x11vnc.log"
log "vnc en :5900"

# ── 4 · CHROMIUM ────────────────────────────────────────────────────────────────────────────────
#
# Perfil DEDICADO y persistente. No se copia ningún perfil existente: nace vacío y la sesión la abre
# una persona a mano. Que el perfil sobreviva al reinicio es lo que hace que no haya que volver a
# loguearse cada vez que se reinicia el contenedor.
mkdir -p "$PERFIL"

# ── EL CANDADO DEL PERFIL SOBREVIVE AL CONTENEDOR, Y ROMPE TODOS LOS REINICIOS ──────────────────
#
# Chromium marca el perfil en uso con `SingletonLock`, un symlink que apunta a `<hostname>-<pid>`. El
# hostname es el ID del contenedor, así que **cambia en cada arranque**, y el Chromium nuevo lee el
# candado viejo, concluye que el perfil está en uso "en otra computadora" y se niega a abrir:
#
#   The profile appears to be in use by another Chromium process (7) on another computer (84728961e8e4)
#
# Verificado: el primer reinicio del contenedor murió con código 21 exactamente así. Sin esta
# limpieza, el navegador arranca UNA vez y nunca más — y el síntoma (contenedor que reinicia en
# bucle) no se parece en nada a la causa.
#
# Borrarlo es seguro porque este perfil tiene un solo usuario posible: el Chromium de ESTE
# contenedor, que todavía no arrancó. No hay otro proceso al que le podamos pisar el perfil.
#
# `-L` ADEMÁS DE `-e`, y no es un detalle: `SingletonLock` es un symlink que apunta a
# `<hostname-viejo>-<pid>`, un destino que ya no existe. Sobre un symlink colgado, `-e` da FALSO —
# así que la primera versión de esta limpieza no borró nada y el contenedor siguió muriendo igual,
# con el mismo mensaje. Sólo `-L` ve el enlace roto, que es justamente el caso que hay que limpiar.
if [ -L "$PERFIL/SingletonLock" ] || [ -e "$PERFIL/SingletonLock" ] || [ -L "$PERFIL/SingletonSocket" ]; then
  log "limpiando candado de perfil de un arranque anterior"
  rm -f "$PERFIL/SingletonLock" "$PERFIL/SingletonSocket" "$PERFIL/SingletonCookie"
fi

# ── EL PUERTO DE DEPURACIÓN NO OBEDECE `--remote-debugging-address` ─────────────────────────────
#
# Comprobado en esta imagen: con `--remote-debugging-address=0.0.0.0` en la línea de comandos,
# `/proc/net/tcp` del contenedor muestra `0100007F:2406` — o sea 127.0.0.1:9222. Chromium ata el
# puerto a loopback igual, y el publicado de Docker apunta a una dirección donde no escucha nadie.
# Desde el host, `curl` no devolvía nada y el contenedor parecía sano.
#
# Así que el puerto se PUENTEA con un relay dentro del contenedor: `socat` escucha en 9223 y reenvía
# a 127.0.0.1:9222. Y esto termina siendo mejor que lo que se buscaba: Chromium sigue sin exponer su
# CDP ni siquiera dentro del contenedor, y lo único alcanzable es el relay — que a su vez sólo existe
# en la red privada del contenedor y en el 127.0.0.1 de la VM.
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &
log "relay CDP 9223 → 127.0.0.1:9222"

# ── LOS DOS CARTELES QUE TAPAN EL LOGIN ─────────────────────────────────────────────────────────
#
# Se vieron en la captura de la pantalla remota, y los dos importan porque caen JUSTO encima de lo
# único que una persona tiene que hacer en este navegador: escribir el usuario.
#
# · "Chromium didn't shut down correctly / Restore" aparece después de cada arranque sucio — o sea
#   después de CADA recuperación automática, que es justamente el camino que este runtime usa cuando
#   el navegador se cae. Un cartel que aparece siempre que algo se recuperó solo es el peor de todos:
#   convierte cada recuperación exitosa en una pantalla que parece rota.
# · el globo de traducción se superpone al formulario de ingreso.
set -- \
  --remote-debugging-port=9222 \
  --user-data-dir="$PERFIL" \
  --window-position=0,0 \
  --window-size="${ANCHO},${ALTO}" \
  --start-maximized \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --hide-crash-restore-bubble \
  --disable-features=Translate,TranslateUI,MediaRouter \
  --lang=es-AR \
  --disable-background-networking \
  --password-store=basic \
  --use-mock-keychain

# EL SANDBOX SE MANTIENE SALVO IMPOSIBILIDAD DEMOSTRADA. `ORQ_BALANZ_SIN_SANDBOX=1` lo desactiva, y
# sólo lo pone el arranque del host cuando comprobó —corriendo Chromium— que en este kernel no puede
# crear su espacio de nombres. Queda anotado en el estado para que la auditoría lo vea.
if [ "${ORQ_BALANZ_SIN_SANDBOX:-0}" = "1" ]; then
  log "ADVERTENCIA: sandbox de Chromium desactivado (imposibilidad comprobada en este kernel)"
  set -- "$@" --no-sandbox
fi

printf '{"arrancado_en":"%s","display":"%s","perfil":"%s","sandbox":%s}\n' \
  "$(date -Iseconds)" "$DISPLAY" "$PERFIL" \
  "$([ "${ORQ_BALANZ_SIN_SANDBOX:-0}" = "1" ] && echo false || echo true)" > "$ESTADO/runtime.json"

log "chromium → $URL_INICIAL"
exec chromium "$@" "$URL_INICIAL"

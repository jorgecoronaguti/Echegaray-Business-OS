# NAVEGADOR DEDICADO DE BALANZ — vive en la VM, no en la Mac del dueño.
#
# ═══ POR QUÉ UN CONTENEDOR Y NO UN CHROME SUELTO EN EL HOST ═══
#
# No fue una preferencia de estilo: fue lo único que se podía construir. La VM no tiene navegador
# instalado, no tiene servidor X, y el usuario `jorge` NO tiene sudo. Se intentaron, en orden:
#
#   1. Xvfb extraído de los .deb a un prefijo local (sin root). Arranca hasta el teclado y muere:
#      el servidor X invoca `/usr/bin/xkbcomp` por RUTA ABSOLUTA compilada, no respeta XKB_BINDIR en
#      este build, y sin teclado no hay forma de tipear una contraseña.
#   2. Montar el binario que falta con un espacio de nombres de usuario (`unshare --mount`). AppArmor
#      lo prohíbe en esta VM: `kernel.apparmor_restrict_unprivileged_userns=1`.
#
# Docker sí está disponible —`jorge` es del grupo `docker`, y Mattermost y Caddy ya corren así— y
# adentro del contenedor sí hay root para instalar el servidor X como corresponde.
#
# Y hay una segunda razón, que además es la buena: **aislamiento**. Este navegador va a sostener la
# sesión de un bróker. En el host tendría acceso de lectura al data room entero, a los `.env` con las
# credenciales de Google y Supabase, y al repo. Acá adentro ve su perfil y nada más.
#
# ═══ LO QUE ESTA IMAGEN NO HACE ═══
#
# No automatiza el login, no guarda credenciales, no copia el perfil de nadie y no trae ninguna
# sesión adentro. El perfil nace vacío y la sesión la inicia una persona, a mano, por la pantalla
# remota. La imagen es reproducible desde este archivo: no hay un paso manual escondido.

FROM debian:bookworm-slim

# ── Paquetes ────────────────────────────────────────────────────────────────────────────────────
#
# `chromium` de Debian es un .deb de verdad (en Ubuntu 26.04 sería un snap, que no corre en un
# contenedor). `openbox` es el gestor de ventanas mínimo: sin uno, los diálogos de Chromium abren sin
# foco y no se puede tipear en ellos — que es justo lo único que esta pantalla tiene que permitir.
#
# `chromium-sandbox` NO es opcional y no viene con `chromium`. Es el binario setuid que le permite a
# Chromium aislar sus procesos de render SIN espacios de nombres de usuario sin privilegios — que es
# justo lo que esta VM prohíbe (`apparmor_restrict_unprivileged_userns=1`). Sin este paquete la única
# salida sería `--no-sandbox`, o sea correr el motor que abre páginas de Internet sin aislamiento.
# Con él, el sandbox queda ACTIVO aunque el contenedor corra como usuario no root.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      chromium-sandbox \
      xvfb \
      x11vnc \
      openbox \
      xauth \
      fonts-liberation \
      fonts-dejavu-core \
      ca-certificates \
      procps \
      socat \
      tini \
    && rm -rf /var/lib/apt/lists/*

# El perfil y el estado del runtime se bind-montean desde el host. Se crean acá para que existan
# aunque el montaje falte, y para que el proceso no root pueda escribirlos.
#
# `/tmp/.X11-unix` lo crea el servidor X sólo si corre como root. Acá corre como el usuario del host,
# así que si el directorio no existe de antemano Xvfb no puede publicar su socket.
RUN mkdir -p /profile /estado /tmp/.X11-unix \
    && chmod 0777 /profile /estado \
    && chmod 1777 /tmp/.X11-unix

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0555 /usr/local/bin/entrypoint.sh

# ── Cómo se corre ───────────────────────────────────────────────────────────────────────────────
#
# El contenedor se lanza con `--user` del host (ver `balanz-runtime.mjs`), así el perfil bind-monteado
# queda con el dueño correcto y adentro NO se corre como root. `HOME=/profile` porque Chromium
# escribe en `$HOME` aunque se le pase `--user-data-dir`.
ENV HOME=/profile \
    DISPLAY=:99 \
    ANCHO=1600 \
    ALTO=1000

# `tini` como PID 1: sin él, Chromium deja zombis y el contenedor no muere limpio en un `restart`.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]

#!/usr/bin/env bash
#
# Echegaray Mattermost — bootstrap REPRODUCIBLE e IDEMPOTENTE (PR-2).
#
# Deja la instancia lista para uso (incluido móvil), SIN pasos manuales ocultos:
#   1. Aplica la configuración server-side declarativa (config.patch.json).
#   2. Crea el administrador inicial del sistema (parametrizado por env; sin password hardcodeada).
#   3. Crea el equipo "Echegaray".
#   4. Crea los canales operativos mínimos (channels.txt).
#   5. Asegura la membresía del admin en el equipo y en cada canal.
#
# IDEMPOTENTE: correrlo N veces no duplica ni falla. Chequea existencia antes de crear.
#
# CÓMO HABLA CON MATTERMOST: la imagen oficial es distroless (sin shell). mmctl vive DENTRO
# del contenedor en /mattermost/bin/mmctl y usa el LOCAL MODE (socket unix interno) — el mismo
# mecanismo que el healthcheck del docker-compose.yml. No requiere credenciales ni exponer puertos.
# Este script corre en el HOST e invoca mmctl vía `docker exec`.
#
# Requisitos: docker en el host; contenedor Mattermost corriendo y healthy; local mode habilitado
# (MM_SERVICESETTINGS_ENABLELOCALMODE=true, ya viene de PR-1).
#
# Uso:
#   cp .env.bootstrap.example .env.bootstrap    # y completar valores reales
#   ./bootstrap.sh
#
set -euo pipefail

# ── Ubicación del script (para resolver rutas relativas sin importar desde dónde se llame) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Cargar variables del bootstrap ──────────────────────────────────────────────────
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.bootstrap}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: falta $ENV_FILE. Copiá la plantilla y completala:" >&2
  echo "       cp .env.bootstrap.example .env.bootstrap" >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

# ── Validación de variables obligatorias ────────────────────────────────────────────
require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: la variable $name no está definida en $ENV_FILE" >&2
    exit 1
  fi
}
require MM_CONTAINER
require MM_ADMIN_EMAIL
require MM_ADMIN_USERNAME
require MM_ADMIN_PASSWORD
require MM_TEAM_NAME
require MM_TEAM_DISPLAY_NAME
MM_CONFIG_PATCH="${MM_CONFIG_PATCH:-config.patch.json}"
MM_CHANNELS_FILE="${MM_CHANNELS_FILE:-channels.txt}"

if [[ "$MM_ADMIN_PASSWORD" == "CAMBIAR_por_una_contrasena_fuerte" ]]; then
  echo "ERROR: MM_ADMIN_PASSWORD sigue con el placeholder. Poné una contraseña real." >&2
  exit 1
fi

# ── Helpers ─────────────────────────────────────────────────────────────────────────
log()  { printf '\033[1;34m[bootstrap]\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m[  ok  ]\033[0m %s\n' "$*"; }
skip() { printf '\033[1;33m[ skip ]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# mmctl DENTRO del contenedor, en local mode. --local es explícito (coincide con el healthcheck).
# Sin -i/-t a propósito: mmctl no lee stdin, y adjuntarlo robaría la entrada del `while read`
# de canales (bug clásico). stdin va a /dev/null por las dudas.
mmctl() { docker exec "$MM_CONTAINER" /mattermost/bin/mmctl --local "$@" </dev/null; }

# Captura la salida de mmctl sin que un exit non-zero (p. ej. "no encontrado") aborte el script
# ni ensucie el test por 'pipefail'. Devuelve el texto por stdout; el llamador hace el grep.
mmctl_out() { docker exec "$MM_CONTAINER" /mattermost/bin/mmctl --local "$@" </dev/null 2>/dev/null || true; }

# ── Pre-chequeos ────────────────────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker no está instalado o no está en el PATH."
docker inspect -f '{{.State.Running}}' "$MM_CONTAINER" >/dev/null 2>&1 \
  || die "el contenedor '$MM_CONTAINER' no existe. Levantá el stack de infra primero (docker compose up -d)."
[[ "$(docker inspect -f '{{.State.Running}}' "$MM_CONTAINER")" == "true" ]] \
  || die "el contenedor '$MM_CONTAINER' no está corriendo."

log "Verificando local mode de mmctl contra '$MM_CONTAINER'..."
mmctl system status >/dev/null 2>&1 \
  || die "mmctl --local no responde. ¿Está MM_SERVICESETTINGS_ENABLELOCALMODE=true y el server healthy?"
ok "mmctl --local operativo."

# ── 1. Configuración server-side (idempotente por naturaleza: aplicar el mismo patch no cambia nada) ──
if [[ -f "$MM_CONFIG_PATCH" ]]; then
  log "Aplicando patch de configuración: $MM_CONFIG_PATCH"
  # mmctl config patch lee un archivo LOCAL a mmctl (dentro del contenedor). Lo copiamos a /tmp del
  # contenedor y lo aplicamos. /tmp es efímero: se limpia al recrear el contenedor.
  docker cp "$MM_CONFIG_PATCH" "$MM_CONTAINER:/tmp/bootstrap.patch.json"
  mmctl config patch /tmp/bootstrap.patch.json >/dev/null
  ok "Configuración aplicada (archivos, sesión, contraseñas, push móvil, branding)."
else
  skip "No se encontró $MM_CONFIG_PATCH; se omite el patch de configuración."
fi

# ── 2. Administrador inicial (chequear existencia antes de crear) ────────────────────
log "Asegurando administrador inicial: $MM_ADMIN_USERNAME <$MM_ADMIN_EMAIL>"
if mmctl_out user search "$MM_ADMIN_EMAIL" | grep -qi "$MM_ADMIN_EMAIL"; then
  skip "El usuario admin ya existe; no se recrea (idempotente)."
else
  mmctl user create \
    --email "$MM_ADMIN_EMAIL" \
    --username "$MM_ADMIN_USERNAME" \
    --password "$MM_ADMIN_PASSWORD" \
    --system-admin \
    --email-verified >/dev/null
  ok "Admin creado."
fi
# Asegurar el rol de system admin es idempotente (promover a un admin no cambia nada).
mmctl roles system-admin "$MM_ADMIN_USERNAME" >/dev/null 2>&1 || true

# ── 3. Equipo (chequear existencia antes de crear) ───────────────────────────────────
log "Asegurando equipo: $MM_TEAM_NAME ($MM_TEAM_DISPLAY_NAME)"
if mmctl_out team search "$MM_TEAM_NAME" | grep -qiE "\b${MM_TEAM_NAME}\b"; then
  skip "El equipo '$MM_TEAM_NAME' ya existe; no se recrea."
else
  mmctl team create --name "$MM_TEAM_NAME" --display-name "$MM_TEAM_DISPLAY_NAME" >/dev/null
  ok "Equipo creado."
fi

# El admin debe pertenecer al equipo (agregar a un miembro existente es benigno → idempotente).
mmctl team users add "$MM_TEAM_NAME" "$MM_ADMIN_USERNAME" >/dev/null 2>&1 || true
ok "Admin asegurado como miembro del equipo."

# ── 4. Canales (chequear existencia antes de crear) ──────────────────────────────────
if [[ -f "$MM_CHANNELS_FILE" ]]; then
  log "Asegurando canales desde $MM_CHANNELS_FILE"
  # Leemos línea por línea; ignoramos comentarios y líneas vacías.
  while IFS='|' read -r ch_name ch_display ch_vis ch_purpose <&3 || [[ -n "$ch_name" ]]; do
    # Saltar comentarios y vacíos (trim de espacios del name).
    ch_name="$(echo "${ch_name:-}" | xargs)"
    [[ -z "$ch_name" || "$ch_name" == \#* ]] && continue
    ch_display="$(echo "${ch_display:-$ch_name}" | sed 's/^ *//; s/ *$//')"
    ch_vis="$(echo "${ch_vis:-public}" | xargs)"
    ch_purpose="$(echo "${ch_purpose:-}" | sed 's/^ *//; s/ *$//')"

    # ¿Ya existe en el equipo? channel search --team <team> <name>
    if mmctl_out channel search --team "$MM_TEAM_NAME" "$ch_name" | grep -qiE "\b${ch_name}\b"; then
      skip "Canal '$ch_name' ya existe."
    else
      priv_flag=()
      [[ "$ch_vis" == "private" ]] && priv_flag=(--private)
      mmctl channel create \
        --team "$MM_TEAM_NAME" \
        --name "$ch_name" \
        --display-name "$ch_display" \
        --purpose "$ch_purpose" \
        "${priv_flag[@]}" >/dev/null
      ok "Canal '$ch_name' ($ch_vis) creado."
    fi

    # 5. Asegurar al admin como miembro del canal (necesario sobre todo para canales privados).
    #    Agregar a un miembro existente es benigno → idempotente.
    mmctl channel users add "${MM_TEAM_NAME}:${ch_name}" "$MM_ADMIN_USERNAME" >/dev/null 2>&1 || true
  done 3< "$MM_CHANNELS_FILE"
else
  skip "No se encontró $MM_CHANNELS_FILE; no se crean canales."
fi

log "Bootstrap completo."
ok  "Instancia lista. Entrá con '$MM_ADMIN_USERNAME' por la web/app oficial apuntando al SiteURL público (definido por WT1)."

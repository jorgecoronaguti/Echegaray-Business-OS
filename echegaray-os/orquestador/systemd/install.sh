#!/usr/bin/env bash
# Instalador idempotente de los servicios systemd --user del orquestador en la VM.
# NO toca echegaray-claude-remote.service. Requiere Linger habilitado (ya lo está).
#
# Uso:  bash orquestador/systemd/install.sh
# Config de secretos: crea %h/.config/echegaray-orq/worker.env si no existe
# (NUNCA versionado). Editá ese archivo para apuntar a la Supabase real cuando
# tengas el DATABASE_URL del pooler con password.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
ENV_DIR="$HOME/.config/echegaray-orq"
ENV_FILE="$ENV_DIR/worker.env"

mkdir -p "$UNIT_DIR" "$ENV_DIR"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'ENV'
# Configuración del Work Fabric (NO versionar). Editá DATABASE_URL para prod.
# Interino (store durable local en la VM):
DATABASE_URL=postgres://postgres:orq_local@127.0.0.1:55433/orq
ORQ_DB_SSL=false
ORQ_CONCURRENCY=2
ORQ_LOG_LEVEL=info
ORQ_ENGINE=claude-cli

# ── Tesorero Inversor IA ──────────────────────────────────────────────────
# ORQ_TESORERIA_CANAL: canal de Mattermost donde publica. SIN esto no publica:
#   escribe el análisis en el journal y sigue. No es un error, es no publicar.
# ORQ_BALANZ_CDP: endpoint del Chrome dedicado (default http://127.0.0.1:9222).
#   SIN Chrome escuchando el ciclo devuelve SESSION_REQUIRED y NO intenta entrar.
# ORQ_BALANZ_EXTRACTOR_VALIDADO: ponerlo en 1 SOLO después de comparar a mano una
#   muestra del extractor contra la pantalla real (ver docs/tesoreria/RUNBOOK.md).
#   Sin esto, toda recomendación sale NO_ACCIONABLE — que es el default seguro.
#ORQ_TESORERIA_CANAL=
#ORQ_BALANZ_CDP=http://127.0.0.1:9222
#ORQ_BALANZ_EXTRACTOR_VALIDADO=0

# Cuando tengas el pooler real de Supabase (D1), reemplazá DATABASE_URL por:
#   postgresql://postgres.<ref>:<PASSWORD>@aws-1-sa-east-1.pooler.supabase.com:5432/postgres
# y ORQ_DB_SSL=true
ENV
  chmod 600 "$ENV_FILE"
  echo "creado $ENV_FILE (chmod 600)"
else
  echo "$ENV_FILE ya existe, no se sobrescribe"
fi

cp "$SRC_DIR"/echegaray-orq-*.service "$SRC_DIR"/echegaray-orq-*.timer "$UNIT_DIR/"
# Servicios del canal de la extensión (PRP-015): túnel HTTPS saliente + agenda.
cp "$SRC_DIR"/echegaray-os-*.service "$SRC_DIR"/echegaray-os-*.timer "$UNIT_DIR/"
# Tesorero Inversor IA. Va aparte porque no comparte prefijo: un glob que no lo
# incluyera dejaba el timer sin instalar y el agente sin correr nunca — el defecto
# más silencioso posible, porque no falla nada, simplemente no pasa.
cp "$SRC_DIR"/echegaray-tesorero.service "$SRC_DIR"/echegaray-tesorero.timer "$UNIT_DIR/"
# Navegador dedicado de Balanz + pantalla remota + vigía. Mismo motivo que arriba: no comparten
# prefijo con nada, y si el glob no los nombra el agente arranca sin navegador y avisa "no hay
# sesión" para siempre.
cp "$SRC_DIR"/echegaray-balanz-*.service "$SRC_DIR"/echegaray-balanz-*.timer "$UNIT_DIR/"
echo "units copiadas a $UNIT_DIR"

systemctl --user daemon-reload
systemctl --user enable --now echegaray-orq-worker.service
systemctl --user enable --now echegaray-orq-health.timer
systemctl --user enable --now echegaray-orq-cleanup.timer
systemctl --user enable --now echegaray-orq-vigilancia.timer
systemctl --user enable --now echegaray-orq-interactive.service
systemctl --user enable --now echegaray-os-tunnel.service      # túnel HTTPS saliente (canal extensión)
systemctl --user enable --now echegaray-os-schedules.timer     # disparador de recurrencias (agenda)

# El Tesorero se COPIA pero NO se habilita, a propósito. Antes de que corra solo hacen
# falta tres cosas que no puede darse a sí mismo: la migración aplicada, la reserva
# mínima aprobada por una persona y el extractor validado contra la pantalla real.
# Habilitarlo antes haría que publique análisis NO_ACCIONABLE dos veces por día.
#   systemctl --user enable --now echegaray-tesorero.timer
#
# El navegador de Balanz y su pantalla remota SÍ se habilitan: son infraestructura, no deciden nada,
# no publican plata y no gastan API. Tienen que estar arriba para que la sesión del bróker siga viva
# entre pedido y pedido — si el navegador se apaga, la sesión muere con la pestaña (`sessionStorage`)
# y habría que volver a iniciarla a mano cada vez.
systemctl --user enable --now echegaray-balanz-browser.service
systemctl --user enable --now echegaray-balanz-remoto.service

# ── EL VIGÍA NO SE HABILITA. DECISIÓN DEL DUEÑO, 03/08/2026 ─────────────────────────────────────
#
# El Tesorero funciona SÓLO A PEDIDO: sin corridas agendadas y sin rondas de supervisión. Que el
# navegador se recupere solo lo sigue haciendo Docker (`restart: unless-stopped`), y el análisis a
# pedido levanta lo que falte antes de mirar el mercado.
#
# Habilitarlos acá "porque son útiles" volvería a poner al agente a correr solo, que es exactamente
# lo que el dueño pidió que no pasara. Si algún día quiere volver:
#   systemctl --user enable --now echegaray-balanz-vigia.timer   # vigilancia cada 15 min
#   systemctl --user enable --now echegaray-tesorero.timer       # corridas 09:15 y 15:30
systemctl --user disable --now echegaray-balanz-vigia.timer 2>/dev/null || true
systemctl --user disable --now echegaray-tesorero.timer 2>/dev/null || true
echo "servicios habilitados y arrancados."
systemctl --user --no-pager status echegaray-orq-worker.service | head -6 || true

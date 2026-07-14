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
echo "units copiadas a $UNIT_DIR"

systemctl --user daemon-reload
systemctl --user enable --now echegaray-orq-worker.service
systemctl --user enable --now echegaray-orq-health.timer
systemctl --user enable --now echegaray-orq-cleanup.timer
systemctl --user enable --now echegaray-orq-vigilancia.timer
echo "servicios habilitados y arrancados."
systemctl --user --no-pager status echegaray-orq-worker.service | head -6 || true

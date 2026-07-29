#!/usr/bin/env bash
# Echegaray Mattermost — backup de la base dedicada + configuración.
#
# PR-1: deja la ESTRUCTURA y un script funcional de backup manual.
# La programación automática (cron/systemd timer) y la rotación off-site son PR-9.
#
# Qué respalda:
#   1. Dump lógico del PostgreSQL de Mattermost (pg_dump, comprimido).
#   2. La configuración de Mattermost (volumen mm-config).
#   3. Los ARCHIVOS SUBIDOS (volumen mm-data): mensajes con adjuntos, imágenes, avatares.
# Hasta que PR-6 mande los adjuntos a Google Drive, mm-data es el ÚNICO lugar donde viven
# esos archivos — por eso se respalda (cierra el riesgo de pérdida de datos R2).
#
# Uso:
#   ./backup.sh                 # escribe en ./dumps/
#   BACKUP_DIR=/ruta ./backup.sh # destino alternativo
#
# Restore (referencia, NO se ejecuta acá) — restaurar SIEMPRE base + archivos juntos:
#   # 1. Base:
#   gunzip -c dumps/mm-db-YYYYmmdd-HHMMSS.sql.gz | \
#     docker exec -i echegaray-mm-db psql -U "$MM_DB_USER" -d "$MM_DB_NAME"
#   # 2. Archivos subidos (con MM detenido para consistencia):
#   docker run --rm -v echegaray-mm-data:/dst -v "$PWD/dumps":/src:ro alpine \
#     sh -c 'rm -rf /dst/* && tar xzf /src/mm-data-YYYYmmdd-HHMMSS.tar.gz -C /dst'

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/dumps}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_CONTAINER="echegaray-mm-db"
CONFIG_VOLUME="echegaray-mm-config"
DATA_VOLUME="echegaray-mm-data"
STAMP="$(date +%Y%m%d-%H%M%S)"

# Cargar credenciales de la base desde el .env de la infra.
if [[ -f "$INFRA_DIR/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "$INFRA_DIR/.env"; set +a
else
  echo "ERROR: falta $INFRA_DIR/.env (copiá .env.example)." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# 1) Dump de la base (comprimido).
echo "→ Dump de PostgreSQL ($DB_CONTAINER)…"
docker exec -e PGPASSWORD="$MM_DB_PASSWORD" "$DB_CONTAINER" \
  pg_dump -U "$MM_DB_USER" -d "$MM_DB_NAME" --clean --if-exists \
  | gzip > "$BACKUP_DIR/mm-db-$STAMP.sql.gz"
echo "  ✓ $BACKUP_DIR/mm-db-$STAMP.sql.gz"

# 2) Configuración de Mattermost (volumen mm-config → tar.gz).
echo "→ Backup de configuración ($CONFIG_VOLUME)…"
docker run --rm -v "$CONFIG_VOLUME":/src:ro -v "$BACKUP_DIR":/dst alpine \
  tar czf "/dst/mm-config-$STAMP.tar.gz" -C /src . 2>/dev/null
echo "  ✓ $BACKUP_DIR/mm-config-$STAMP.tar.gz"

# 3) Archivos subidos (volumen mm-data → tar.gz). Montaje :ro — no modifica el volumen.
echo "→ Backup de archivos subidos ($DATA_VOLUME)…"
docker run --rm -v "$DATA_VOLUME":/src:ro -v "$BACKUP_DIR":/dst alpine \
  tar czf "/dst/mm-data-$STAMP.tar.gz" -C /src . 2>/dev/null
echo "  ✓ $BACKUP_DIR/mm-data-$STAMP.tar.gz"

# 4) Rotación por antigüedad.
echo "→ Rotando backups de más de $RETENTION_DAYS días…"
find "$BACKUP_DIR" -type f -name 'mm-*' -mtime +"$RETENTION_DAYS" -print -delete || true

echo "Backup completo: $STAMP"

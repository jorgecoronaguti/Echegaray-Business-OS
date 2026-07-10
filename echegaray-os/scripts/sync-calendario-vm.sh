#!/usr/bin/env bash
# Sincroniza el snapshot del calendario de cobros y pagos en una VM Ubuntu 24/7.
# Primero vuelca la cola de saldos al Sheet (flush-saldos) y luego regenera el
# snapshot (sync-calendario). Commitea y pushea ÚNICAMENTE el snapshot y solo si
# cambió: nunca toca ningún otro archivo del working tree.
#
# No contiene secretos: las credenciales las leen los scripts .mjs desde el
# entorno (SUPABASE_SERVICE_ROLE_KEY, GOOGLE_SERVICE_ACCOUNT_JSON). La rama
# destino se puede overridear con SYNC_BRANCH (default: main).
#
# Uso: scripts/sync-calendario-vm.sh   (pensado para cron/systemd de la VM)

set -euo pipefail

# Raíz real de la app derivada de la ubicación de este script -- sin rutas
# absolutas de ninguna máquina concreta.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
SNAPSHOT_ABS="$APP_DIR/src/features/flujo-caja/data/calendario-snapshot.json"
SNAPSHOT_REL="$(realpath --relative-to="$REPO_ROOT" "$SNAPSHOT_ABS")"
BRANCH="${SYNC_BRANCH:-main}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

log "Inicio sync (app: $APP_DIR | repo: $REPO_ROOT | rama: $BRANCH)"

cd "$APP_DIR"

# 1) Volcar la cola de saldos cargados desde la web al Sheet. Si falla, se
#    registra y el sync del calendario continúa igual (criterio del cron actual).
if node scripts/flush-saldos.mjs; then
  log "flush-saldos OK"
else
  log "flush-saldos falló (el sync del calendario continúa igual)"
fi

# 2) Regenerar el snapshot del calendario. Si esto falla, set -e aborta la
#    corrida y no se commitea nada (no se pushea un snapshot a medias).
node scripts/sync-calendario.mjs
log "sync-calendario OK"

# 3) Commit + push SOLO del snapshot y SOLO si cambió. Se opera con pathspec
#    explícito para no arrastrar ningún otro cambio del working tree.
if git -C "$REPO_ROOT" diff --quiet -- "$SNAPSHOT_REL"; then
  log "Sin cambios en el snapshot; nada que commitear ni pushear"
  exit 0
fi

log "Snapshot modificado; se commitea únicamente: $SNAPSHOT_REL"
git -C "$REPO_ROOT" add -- "$SNAPSHOT_REL"
git -C "$REPO_ROOT" commit -m "Sync automático del calendario de cobros y pagos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" -- "$SNAPSHOT_REL"

# Traer trabajo remoto antes de pushear. Si el rebase falla, se aborta para no
# dejar el repo a medio rebase y se reintenta en la próxima corrida.
if ! git -C "$REPO_ROOT" pull --rebase origin "$BRANCH"; then
  git -C "$REPO_ROOT" rebase --abort 2>/dev/null || true
  log "pull --rebase falló; se reintenta en la próxima corrida"
  exit 0
fi

git -C "$REPO_ROOT" push origin "$BRANCH"
log "Snapshot pusheado a origin/$BRANCH"

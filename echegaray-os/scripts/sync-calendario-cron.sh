#!/bin/zsh
# Sincroniza el snapshot del calendario y lo pushea si cambió. Corre vía
# LaunchAgent (com.echegaray.sync-calendario) cada 4 horas. Solo toca el
# archivo del snapshot: nunca commitea otro cambio del working tree.
set -e
export PATH="$HOME/.nvm/versions/node/v22.17.0/bin:/usr/bin:/bin:/usr/local/bin"
REPO="$HOME/Desktop/Echegaray-Business-OS"
SNAPSHOT="echegaray-os/src/features/flujo-caja/data/calendario-snapshot.json"
LOG="$HOME/Library/Logs/echegaray-sync-calendario.log"

{
  echo "--- $(date '+%Y-%m-%d %H:%M:%S') ---"
  cd "$REPO/echegaray-os"
  node scripts/sync-calendario.mjs

  cd "$REPO"
  if git diff --quiet -- "$SNAPSHOT"; then
    echo "sin cambios en el snapshot, nada que pushear"
    exit 0
  fi
  git add "$SNAPSHOT"
  git commit -m "Sync automático del calendario de cobros y pagos

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- "$SNAPSHOT" || true
  # rebase para no pisar trabajo remoto; si falla, se aborta y se reintenta en la próxima corrida
  git pull --rebase origin main || { git rebase --abort 2>/dev/null; echo "rebase falló, se reintenta en la próxima corrida"; exit 0; }
  git push origin main
  echo "snapshot pusheado"
} >> "$LOG" 2>&1

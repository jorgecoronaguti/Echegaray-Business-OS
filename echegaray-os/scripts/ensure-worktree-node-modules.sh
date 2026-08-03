#!/usr/bin/env bash
# Hace que TODO worktree (presente y futuro) resuelva node_modules sin `npm install` por copia.
# Node resuelve subiendo por el árbol: un único symlink en el PADRE de los worktrees alcanza a todos.
# Idempotente: correr cuantas veces haga falta. NO instala nada, NO duplica: comparte el node_modules real.
set -euo pipefail
MAIN_NM="/home/jorge/echegaray-os/app/echegaray-os/node_modules"
WT_DIR="/home/jorge/echegaray-os/app/.claude/worktrees"
[ -d "$MAIN_NM" ] || { echo "FALTA $MAIN_NM (corré npm install en main)"; exit 1; }
mkdir -p "$WT_DIR"
ln -sfn "$MAIN_NM" "$WT_DIR/node_modules"
echo "ok: $WT_DIR/node_modules -> $MAIN_NM"

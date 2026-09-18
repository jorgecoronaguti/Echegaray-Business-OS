#!/usr/bin/env bash
# INSTALA EL PORTERO DE RECURSOS PARA TODA LA MÁQUINA. Idempotente: se puede correr mil veces.
#
# Por qué hace falta una copia FUERA del repositorio: hay más de cien worktrees, casi todos en commits
# anteriores a este portero. La política tiene que regir también ahí, y el único lugar que todas las
# sesiones y worktrees comparten es el HOME. Entonces:
#   ~/.echegaray-os/bin/            copia del portero (la fuente de verdad sigue siendo el repo)
#   ~/.echegaray-os/recursos/       política efectiva + estado (cupos, cola, registro, log)
#   ~/bin/ecos                      enlace para escribir `ecos …` desde cualquier lado
#   ~/.claude/settings.json         hooks GLOBALES: portero de Bash + barrido al cerrar sesión/agente
#   systemd --user ecos-barrido.timer   barrido de huérfanos cada 5 minutos, por si un hook no llegó a correr

set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="${ECOS_RAIZ:-$HOME/.echegaray-os}"
BIN="$RAIZ/bin"; DIR="$RAIZ/recursos"
mkdir -p "$BIN" "$DIR/slots" "$DIR/cola" "$DIR/registro" "$DIR/log" "$HOME/bin"

# SE REEMPLAZA POR RENOMBRE, NO ESCRIBIENDO ENCIMA. `ecos` es un script de bash, y bash lo lee del
# disco A MEDIDA QUE LO EJECUTA: pisar el archivo de un `ecos` que está esperando en la cola le hace
# leer la mitad de la versión nueva desde el offset de la vieja. El renombre dentro del mismo
# directorio es atómico y deja al proceso vivo con el inodo anterior, intacto hasta que termine.
for f in ecos comun.mjs estado.mjs barrer.mjs hook-bash.mjs; do
  install -m 0755 "$AQUI/$f" "$BIN/.$f.nuevo" && mv -f "$BIN/.$f.nuevo" "$BIN/$f"
done
# La política instalada NO se pisa si ya existe: es el lugar donde el dueño ajusta límites.
[ -f "$DIR/politica.env" ] || install -m 0644 "$AQUI/politica.env" "$DIR/politica.env"
ln -sfn "$BIN/ecos" "$HOME/bin/ecos"

# ── Hooks globales de Claude Code (se fusionan, no se pisan) ──
node - "$HOME/.claude/settings.json" "$BIN" <<'JS'
const fs = require('node:fs'); const [ruta, bin] = process.argv.slice(2)
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(ruta, 'utf8')) } catch {}
cfg.hooks ||= {}
const portero = { type: 'command', command: `node ${bin}/hook-bash.mjs`, timeout: 10, statusMessage: 'recursos' }
const barrido = { type: 'command', command: `node ${bin}/barrer.mjs --motivo fin-de-sesion`, timeout: 30, statusMessage: 'limpiando huérfanos' }
const poner = (evento, matcher, hook) => {
  const lista = (cfg.hooks[evento] ||= [])
  const marca = hook.command.split(' ')[1]
  if (lista.some((e) => (e.hooks || []).some((h) => (h.command || '').includes(marca)))) return
  lista.push(matcher ? { matcher, hooks: [hook] } : { hooks: [hook] })
}
poner('PreToolUse', 'Bash', portero)
poner('SessionEnd', null, barrido)
poner('SubagentStop', null, barrido)
fs.writeFileSync(ruta, JSON.stringify(cfg, null, 2) + '\n')
console.log('hooks globales listos en ' + ruta)
JS

# ── Barrido periódico (systemd --user). Un timer, no un demonio: 50 ms cada 5 minutos. ──
UNIDADES="$HOME/.config/systemd/user"; mkdir -p "$UNIDADES"
cat > "$UNIDADES/ecos-barrido.service" <<UNIT
[Unit]
Description=Echegaray OS - barrido de procesos de desarrollo huérfanos
[Service]
Type=oneshot
ExecStart=$(command -v node) $BIN/barrer.mjs --motivo timer
UNIT
cat > "$UNIDADES/ecos-barrido.timer" <<UNIT
[Unit]
Description=Echegaray OS - barrido de huérfanos cada 5 minutos
[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
AccuracySec=30s
[Install]
WantedBy=timers.target
UNIT
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
systemctl --user daemon-reload
systemctl --user enable --now ecos-barrido.timer >/dev/null 2>&1 || true

echo "portero instalado: $BIN/ecos · política: $DIR/politica.env · timer: $(systemctl --user is-active ecos-barrido.timer 2>/dev/null || echo '?')"

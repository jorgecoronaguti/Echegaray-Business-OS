# Portero de recursos de la VM (`ecos`)

**Causa (17/09/2026).** La VM (4 núcleos, 7,2 GiB, swap 8 GiB) corre el OS productivo y además todo el
desarrollo. El hook de cierre (`.claude/hooks/validar-cierre.mjs`) corre en cada `Stop` y `SubagentStop`
de cada worktree y lanzaba `tsc`, la suite (203 archivos, un proceso por archivo) y eslint; Playwright
abría un Chromium por núcleo y su propio `next dev`; cada agente levantaba su servidor. Nada los
coordinaba. Resultado: 6,6 GiB usados, swap lleno, carga >60, VS Code Remote SSH sin responder.

**Mecanismo.** Una sola puerta para el trabajo pesado de desarrollo:

| Pieza | Qué hace |
|---|---|
| `ecos <clase> -- <cmd>` | Toma un cupo (`flock`), mide RAM/swap/carga antes de abrir, encola FIFO si no hay lugar, corre el comando en un scope de systemd (`ecos.slice`) con techo de memoria y de swap, y al terminar/fallar/cancelar apaga el scope entero. |
| `hook-bash.mjs` | `PreToolUse` de Bash (global y del proyecto): frena todo comando pesado que no pase por `ecos` y dice cómo lanzarlo. Cubre a Claude Code, agentes y los +100 worktrees viejos. |
| `barrer.mjs` | Apaga SOLO huérfanos: tareas cuyo `ecos` o cuya sesión murió, procesos de desarrollo adoptados por PID 1 o sin dueño vivo, o con el worktree borrado. Corre al cerrar sesión/agente, en emergencia y cada 5 min (`ecos-barrido.timer`). |
| `higiene-tmp.mjs` | Borra del `/tmp` real los directorios de `mkdtemp` de familias conocidas con más de 3 días, y sólo si ningún proceso vivo los tiene abiertos. Lo llama `barrer.mjs` en cada corrida. |
| `estado.mjs` | `ecos estado`: memoria, swap, carga, cupos, cola, procesos de desarrollo vivos. |
| `politica.env` | Los límites. La copia instalada (`~/.echegaray-os/recursos/`) manda. |
| `instalar.sh` | Copia todo a `~/.echegaray-os/bin`, enlaza `~/bin/ecos`, fusiona los hooks globales en `~/.claude/settings.json`, habilita el timer. Idempotente; el hook de cierre lo corre solo si falta. |

**Límites efectivos** (ver `politica.env`): 1 Next · 1 navegador · 1 validación pesada. Mínimo de
memoria libre para arrancar: 1500 / 1100 / 1200 MB. Nada pesado arranca con swap > 55 % ni carga > 10.
Emergencia (libre < 450 MB o swap > 85 %): se rechaza, no se encola, y se barren huérfanos. Techos por
scope: Next 3,3 GB (swap 512 MB) · navegador 2,2 GB (swap 256 MB) · validación 3,3 GB (swap 384 MB).
`node --test` corre con `--test-concurrencia` calculada por RAM/CPU real (1–3).

**Lo que nunca toca**: `echegaray-*.service`, Mattermost, Postgres, Docker, Caddy, cloudflared, el
navegador de Balanz, VS Code Server, las sesiones de Claude Code, `next start`.

**No aumenta el swap**: le pone techo al swap que puede usar el desarrollo.

**Segunda causa (20/09/2026).** `/tmp` es tmpfs **con cuota por usuario**; se agotó y ninguna sesión de
Claude Code pudo correr un comando —exit 1 sin salida, porque el harness escribe la salida de cada
comando en `/tmp`—. Lo llenaban 95.657 directorios de `mkdtemp` que nadie borraba: casi todos de la
suite de pruebas, más 13.502 del SDK externo de ARCA, acumulados desde el 7 de agosto.
`systemd-tmpfiles --clean` no los tocaba: mira atime, y cualquier `ls` sobre `/tmp` se lo refresca.

Se arregló en origen donde se pudo: **la suite corre con su propio `TMPDIR`** descartable
(`scripts/suite-pruebas.sh`), así ninguna prueba deja nada aunque no limpie; `documentos/leer.mjs`
borraba el archivo pero no su directorio; `ingesta/dwg.mjs` devuelve el temporal que crea para que el
que llama lo borre. `conocimiento/leer-archivo.mjs` y `conocimiento/buscar.mjs` ya limpiaban bien. Lo
que no se puede arreglar en origen —el SDK de ARCA— lo barre `higiene-tmp.mjs`.

Mensajes: `recursos: esperando recursos para X: <motivo> · libre N MB · swap N% · carga N` cada 30 s;
`turno concedido tras Ns`; `se agotó la espera` (código 75, nada se ejecutó).

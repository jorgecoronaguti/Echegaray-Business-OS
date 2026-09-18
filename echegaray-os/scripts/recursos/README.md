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
| `hook-bash.mjs` | `PreToolUse` de Bash (global y del proyecto): frena todo comando pesado que no pase por `ecos` y dice cómo lanzarlo. Cubre a Claude Code, agentes y los +100 worktrees viejos. Parte la línea por `;` `&&` `\|\|` `\|` `(` y saltos **sin mirar comillas**, a propósito: ver «Partidor por comillas». |
| `barrer.mjs` | Apaga SOLO huérfanos: tareas cuyo `ecos` o cuya sesión murió, procesos de desarrollo adoptados por PID 1 o sin dueño vivo, o con el worktree borrado. Corre al cerrar sesión/agente, en emergencia y cada 5 min (`ecos-barrido.timer`). |
| `estado.mjs` | `ecos estado`: memoria, swap, carga, cupos, cola, procesos de desarrollo vivos. |
| `politica.env` | Los límites. La copia instalada (`~/.echegaray-os/recursos/`) manda. |
| `instalar.sh` | Copia todo a `~/.echegaray-os/bin`, enlaza `~/bin/ecos`, fusiona los hooks globales en `~/.claude/settings.json`, habilita el timer. Idempotente; el hook de cierre lo corre solo si falta. Con `ECOS_RAIZ` distinta de `~/.echegaray-os` sólo copia el portero ahí: no toca `~/bin/ecos`, `settings.json` ni el timer. |

**Límites efectivos** (ver `politica.env`): 1 Next · 1 navegador · 1 validación pesada. Mínimo de
memoria libre para arrancar: 1500 / 1100 / 1200 MB. Nada pesado arranca con swap > 55 % ni carga > 10.
Emergencia (libre < 450 MB o swap > 85 %): se rechaza, no se encola, y se barren huérfanos. Techos por
scope: Next 3,3 GB (swap 512 MB) · navegador 2,2 GB (swap 256 MB) · validación 3,3 GB (swap 384 MB).
`node --test` corre con `--test-concurrencia` calculada por RAM/CPU real (1–3).

**Lo que nunca toca**: `echegaray-*.service`, Mattermost, Postgres, Docker, Caddy, cloudflared, el
navegador de Balanz, VS Code Server, las sesiones de Claude Code, `next start`.

**No aumenta el swap**: le pone techo al swap que puede usar el desarrollo.

Mensajes: `recursos: esperando X: <quién retiene el cupo, desde cuándo, con qué comando> · libre N MB ·
swap N% · carga N` cada 30 s; `turno concedido tras Ns`; al agotarse la espera, el diagnóstico completo
(quién tiene cada cupo, de qué sesión, quién está delante en la cola y la medición de la máquina) y
código 75, sin ejecutar nada.

---

## La forma correcta de una prueba de navegador

    E2E_PORT=3210 ecos e2e -- npx playwright test tests/mi-caso.spec.ts

**Una sola reserva.** `e2e` toma `next` y `browser` **juntos**, todo o nada, y Playwright levanta y
apaga su propio servidor (`E2E_PORT` además apaga el reuso: lo que se prueba sale del directorio desde
el que se corrió — ver el comentario en `playwright.config.ts`).

**Lo que no se hace:** dejar un `ecos next` abierto (un servidor de desarrollo retiene su cupo
indefinidamente) y pedir el navegador aparte. Ese servidor retiene el `next` que otro `e2e` necesita, y
tu navegador queda detrás de ese `e2e` en la cola. El portero ahora lo destraba solo, pero la forma
sigue siendo una reserva por prueba: dos reservas abiertas son dos cupos de los tres de la máquina.

## Bloqueo mutuo (18/09/2026) — qué pasó y qué lo impide ahora

**El caso.** `ecos next -- next dev` (sesión A) retiene `next`. `ecos e2e` (sesión B) pide `next`+`browser`
y su ticket es el más viejo: no arranca porque A tiene `next`. `ecos browser` (sesión A) queda detrás del
ticket de B porque comparten `browser`. A no suelta `next` hasta correr su navegador; su navegador no
corre porque le cede el turno a B; B no arranca porque espera el `next` de A. **Cuatro tareas paradas 30
minutos y después fallidas sin ejecutarse, con 4,2 GB libres y carga 0,3.**

**La regla que lo impide** (`ecos`, `mi_turno`): *no le cedo el turno a un pedido más viejo cuya espera
depende de un cupo que retiene mi propia sesión*. Cederle es cerrar el ciclo. Por qué alcanza: `tomar_slots`
es todo-o-nada, así que **un `ecos` que espera no retiene ningún cupo**; la única forma de que un retenedor
esté a su vez bloqueado es que sea un proceso de vida larga cuyo dueño espera otro cupo, y esa dependencia
pasa siempre por su propio dueño — que es exactamente el arco que esta regla corta. Los cupos no se
tocaron: siguen en 1 Next · 1 navegador · 1 validación.

**Límite conocido:** si alguien introdujera un retenedor *indefinido* de `browser` o `validacion` (un
`tsc --watch`, un navegador abierto a mano) podría armarse un ciclo entre dos sesiones distintas. Esa
regla no lo rompe sola; el diagnóstico lo nombra como `BLOQUEO MUTUO` en vez de decir «no hay recursos».

**El panel ya no miente.** `ecos estado` preguntaba por el sello `.quien`, y el sello se escribía apenas
se conseguía cada candado: un pedido de `e2e` que tomaba `browser` y devolvía el candado al no conseguir
`next` dejaba el sello, y el panel mostraba a la vez «cupo browser 1/1 · pid N» y a ese mismo pid en la
cola. Ahora **la evidencia es el candado** (`flock -n`); el sello sólo aporta el nombre, se escribe
recién cuando están todas las clases, y un sello sin candado se muestra como huérfano y lo borra
`ecos barrer`.

**Cobertura:** `recursos.test.mjs` reproduce la espera circular, el sello que mentía, el diagnóstico con
nombre propio, el cupo de un proceso muerto de golpe (SIGKILL), el ticket de un proceso muerto y cuatro
pedidos simultáneos de la misma clase, y fija como límite aceptado el falso positivo de grep (abajo).
Se corre con `ecos validacion -- node --test scripts/recursos/recursos.test.mjs`.

## Partidor por comillas: intentado y retirado (18/09/2026)

El hook frena `grep -n "eslintConfig\|eslint" package.json`: parte por el `|` de adentro de las comillas
y el segundo pedazo empieza con `eslint"`. **Es un límite conocido y aceptado**, fijado en un test.

Se intentó dos veces un partidor que respetara comillas, y la auditoría independiente lo retiró las dos,
porque interpretar bash a mano no tiene piso. Lo que encontró:

1. **Apóstrofo en un comentario.** `echo hola  # don't` ⏎ `npx tsc --noEmit`: el `'` abría una comilla que
   nunca cerraba, se tragaba el salto de línea, y el resto quedaba en un tramo que empieza con texto
   inofensivo. Bash corría tsc.
2. **Comillas balanceadas entre dos comentarios.** `# don't touch` ⏎ `npx tsc --noEmit` ⏎ `# it's ok`: los
   dos apóstrofos se emparejan y el comando del medio queda «adentro de una comilla». Bash no mira
   comillas dentro de un `#`: lo ejecuta.
3. **Un escalón de respaldo que partía menos, no más.** `tr -d '"' < a; npx tsc --noEmit; tr -d '"' < b  # don't`:
   tratar `'` como texto emparejó los `"` que estaban protegidos y dejó un solo tramo.

La cuenta que decide: **el falso positivo cuesta un reintento por `ecos`; un agujero puede costar la VM.**
Si alguien lo retoma, la dirección que propuso el auditor es quitar primero los comentarios `#` que abren
palabra fuera de comillas y recién después analizar comillas — y traer los tres casos de arriba como
tests antes de escribir una línea.

**Agujeros que ya estaban en `main` y siguen** (el hook es la primera barrera, no la única; lo que se le
escapa corre igual sin cupo, lo muestra `ecos estado` y lo limpia `barrer` si queda huérfano):
`eval "npx tsc"`, backticks, `xargs npx tsc`, `if npx tsc; then`, `for …; do …; done`, `{ …; }`,
`! npx tsc`, `command npx tsc`, `npm test`, `npx -y tsc`, `node node_modules/typescript/bin/tsc`.

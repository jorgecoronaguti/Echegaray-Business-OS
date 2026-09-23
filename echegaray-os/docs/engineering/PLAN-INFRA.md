# Separar producción de desarrollo — inventario medido, opciones y deploy verificable

Medido el **23/09/2026 entre 08:30 y 08:45 (-03)** sobre la VM `echegaray-os`. Todo lo marcado
**HECHO** salió de un comando de sólo lectura cuya salida está transcripta o resumida acá. Lo que no
pude medir está marcado **ESTIMACIÓN** o **DESCONOCIDO**. No se tocó ningún servicio, ningún timer y
ninguna unidad.

---

## 0. La máquina

**HECHO** (`free -m`, `nproc`, `uptime`, `df -h`, `/proc/loadavg`, metadata de Vultr en
`169.254.169.254/v1.json`):

| | |
|---|---|
| Proveedor | Vultr, instancia `101779538`, tipo `VC2` |
| CPU / RAM | 4 vCPU · 7.418 MB totales |
| Disco | 150 GB, 52 % usado (74 GB) |
| Uptime | 74 días |
| Load average al medir | 0,63 / 0,52 / 0,44 |
| Memoria en uso / disponible | 2.271 MB / 5.146 MB |
| **Swap en uso** | **1.508 MB de 8.191** |
| `user-1001.slice` (todo lo de `jorge`) | 3.568 MB |

Los 1,5 GB de swap ocupados con 5,1 GB disponibles ahora mismo son la huella de una saturación
pasada, no de una actual: algo llenó la RAM antes y el kernel nunca trajo esas páginas de vuelta.

**Un mismo host corre hoy, a la vez:** el checkout de producción
(`/home/jorge/echegaray-os/produccion/echegaray-os`), el de desarrollo
(`/home/jorge/echegaray-os/app/echegaray-os` + worktrees), Mattermost en Docker, dos Postgres
auxiliares en Docker, un Chromium, el `vscode-server` y los agentes de Claude Code.

---

## 1. Inventario medido

Comandos: `systemctl --user list-units --type=service --all`, `systemctl --user list-timers --all`,
`systemctl --user show <unidad> -p ActiveState,SubState,ExecMainStartTimestamp,ExecMainPID,MemoryCurrent,CPUUsageNSec,WorkingDirectory --value`.

### 1.1 Servicios permanentes (los que siempre están vivos)

**HECHO.** `MemoryCurrent` es el cgroup de la unidad al momento de medir; `CPU acum.` es
`CPUUsageNSec` desde el arranque de la unidad.

| Servicio | Qué hace | WorkingDirectory | Mem | CPU acum. | Arrancó |
|---|---|---|---|---|---|
| `echegaray-comunicacion-worker` | worker del bot: procesa lo que llega de Mattermost contra el Work Fabric | producción | **81,9 MB** | 2,2 s | 23/09 08:19 |
| `echegaray-orq-worker` | worker del orquestador, 24×7 | producción | **71,6 MB** | **29,2 s** | 22/09 18:01 |
| `echegaray-comunicacion-ws` | consumidor WebSocket del bot `@xsas` (Mattermost → Communication Service) | producción | **66,8 MB** | 0,96 s | 23/09 08:19 |
| `echegaray-os-tunnel` | dos túneles cloudflared salientes (`:8790` motor, `:8791` XSAS) + auto-registro en `os_runtime` | producción | **56,7 MB** | **2.883 s** (14 días) | 09/09 19:25 |
| `echegaray-orq-interactive` | motor interactivo, `127.0.0.1:8790` (directivas en segundos, `/ask`, `/health`, `/version`) | producción | **46,4 MB** | 1,8 s | 22/09 18:01 |
| `echegaray-asistencia-http` | slash command y acciones interactivas de Asistencia en Mattermost | producción | **21,7 MB** | 1,0 s | 22/09 18:01 |
| `echegaray-xsas-gateway` | puerta única de XSAS, `127.0.0.1:8791` + endpoint entrante de Mattermost | producción | **16,2 MB** | 1,3 s | 22/09 18:01 |
| `echegaray-claude-remote` | control remoto de Claude Code | **desarrollo** | — | 0,008 s | **roto, ver 1.4** |

**Suma de los 7 servicios de producción vivos: 361,3 MB.** No son ellos los que tumban la máquina.

### 1.2 Contenedores Docker

**HECHO** (`docker ps`, `docker stats --no-stream`):

| Contenedor | Imagen | Mem | CPU | Límite |
|---|---|---|---|---|
| `echegaray-mm-app` | `mattermost-team-edition:11.8.4` | 160,2 MB | 0,14 % | 1,5 GB |
| `echegaray-mm-db` | `postgres:16-alpine` | 81,8 MB | 0,10 % | 512 MB |
| `echegaray-mm-caddy` | `caddy:2-alpine` | 59,2 MB | 0,00 % | 256 MB |
| `echegaray-balanz` | `echegaray-balanz-browser:1` | 64,7 MB | 0,23 % | 2 GB |
| `pg-reprod` | `supabase/postgres:17.6.1.165` | 39,1 MB | 0,04 % | sin límite |
| `pg-obra-doc` | `postgres:16-alpine` | 7,0 MB | 0,00 % | sin límite |

Mattermost escucha en **`127.0.0.1:8065`** y corre en esta misma máquina (`/mattermost/bin/mattermost`,
PID 2482310, levantado el 29/07).

### 1.3 Timers

**HECHO: 28 timers de `echegaray-*` / `ecos-*`** (29 con `launchpadlib-cache-clean`, que es del
sistema). Agrupados por cadencia medida en `list-timers`:

| Cadencia | Timers |
|---|---|
| **cada 1 min** | `compras-obra-cola`, `sonda-flujo-caja`, `comprobantes-web` |
| **cada 5 min** | `caja-espejo`, `compras-sync`, `orq-health`, `pedidos-sync`, `ecos-barrido`, `os-schedules`, `xsas-sonda` |
| cada 10 min | `vigilar-echeqs` |
| cada 30 min | `impuestos-postgres`, `cobranzas-sync` |
| cada 1 h | `jornales-registros`, `orq-cleanup` |
| cada 2 h | `flujo-caja` |
| cada 4–6 h | `drive-index`, `xsas-ciclo`, `espejo-legajos`, `gmail-ordenes`, `asistencia-obra` |
| diario | `arca-sync` (03:00), `orq-vigilancia` (07:00), `gmail-transferencias` (07:15), `comprobantes-vigia` (07:30) |
| **sin próxima ejecución (apagados de hecho)** | `mantener-caliente` (último 13/09), `plan-ejecutar` (último 27/07), `sync` (último 31/07) |

**Todos** corren con `WorkingDirectory=/home/jorge/echegaray-os/produccion/echegaray-os`, salvo
`ecos-barrido` (`!/home/jorge`) y `claude-remote` (desarrollo).

Los que más CPU acumularon, que es donde está el peso real:
`flujo-caja` **112.032 s** · `gmail-transferencias` 13.470 s · `espejos` (unidad ya inexistente pero
con cgroup vivo) 3.515 s · `impuestos-postgres` 3.279 s · `drive-index` 3.227 s ·
`jornales-registros` 2.841 s · `espejo-legajos` 2.183 s.

`echegaray-flujo-caja` sólo corre cada 2 h y se comió 31 horas de CPU: **es, lejos, el trabajo más
caro de la máquina.**

### 1.4 Lo que está roto y nadie ve

**HECHO:**

- `echegaray-claude-remote`: `ActiveState=activating`, `SubState=auto-restart`, `Result=exit-code`,
  `ExecMainStatus=203`. En el journal: `Unable to locate executable
  /home/jorge/.nvm/versions/node/v24.18.0/bin/claude: No such file or directory`.
  **`NRestarts=58421`.** Con `RestartSec=15` y reintentos cada 5 min, lleva meses reiniciándose en
  vacío. `systemctl is-active` devuelve `activating`, no `failed`: un chequeo por estado de unidad
  no lo agarra.
- `echegaray-avance-sync`: `failed` desde el **24/08**.
- `echegaray-balanz-browser`: `failed` desde el **04/08**.
- `echegaray-espejos`: `not-found` pero con cgroup contabilizado — unidad borrada sin limpiar.

### 1.5 Desarrollo: quién consume de verdad

**HECHO** (`ps -eo rss,pcpu --sort=-rss`, top de la máquina al medir):

| Proceso | RSS | %CPU |
|---|---|---|
| extensión `anthropic.claude-code` del vscode-server | **407 MB** | 5,1 % |
| `vscode-server` (3 procesos) | 176 + 106 + 74 = **356 MB** | 0,8 % |
| `systemd-journald` | 145 MB | 0 % |
| `worker-comunicacion.mjs` (producción) | 133 MB | 0,2 % |
| `mattermost` | 130 MB | 0,2 % |
| `mattermost-ws-consumer.mjs` (producción) | 117 MB | 0,1 % |
| `orquestador/worker.mjs` (producción) | 109 MB | 0 % |
| `interactive-server.mjs` (producción) | 92 MB | 0 % |
| `chromium` | 67 MB | 0 % |

**En un momento tranquilo, el tooling de desarrollo (763 MB) ya pesa más que los siete servicios de
producción juntos (361 MB).** Y eso es sin `next dev`, sin Playwright y sin la suite corriendo.

---

## 2. Qué puede salir de la VM y qué no

### 2.1 No pueden salir (o salen sólo si se mueve algo más con ellos)

| Servicio / grupo | Por qué está atado |
|---|---|
| `comunicacion-ws`, `comunicacion-worker`, `asistencia-http`, `xsas-gateway` | Hablan con **Mattermost en `127.0.0.1:8065`**, que corre en esta misma máquina y **no está publicado** (Caddy y el bind son locales). Sacarlos exige exponer Mattermost o mover Mattermost también. |
| `os-tunnel` | Los túneles cloudflared entran **por loopback** a `:8790` y `:8791`. Sólo se mueve junto con el motor interactivo y el gateway. |
| `orq-interactive` | Escucha en `127.0.0.1:8790` y lo alcanza el túnel; además sirve el OAuth de Google y lee el repo del disco. |
| Los 5 timers que escriben el Sheet — `flujo-caja`, `asistencia-obra`, `espejo-legajos`, `impuestos-postgres`, `jornales-registros` | Usan `~/.config/echegaray-orq/google-sa.json` (`GOOGLE_SA_KEY_PATH`) y `ORQ_GOOGLE_IMPERSONATE`. **La credencial es un archivo local, no un secreto de plataforma.** Mover esto es mover una llave de escritura sobre el Sheet real. Nivel E. |
| `gmail-ordenes`, `gmail-transferencias` | `GOOGLE_OAUTH_*` + refresh tokens guardados localmente. Mismo problema. |
| `balanz-*` | Chromium con sesión persistida en la VM y CDP/VNC en loopback (`:9222`, `:5900`). Atado a esta máquina por diseño. |
| `orq-worker`, `orq-interactive` | Crean worktrees de git y corren Claude Code sobre el repo: **necesitan el repo en disco y la CLI instalada**, no sólo la red. |

### 2.2 Sí pueden salir, o directamente irse

| Qué | Adónde / qué hacer |
|---|---|
| **Todo el desarrollo** — vscode-server, extensión de Claude Code, worktrees, `next dev`, Playwright, la suite | A otra VM. **Es lo único que no necesita ni una credencial de escritura ni un puerto local de producción.** |
| `echegaray-claude-remote` | Está roto hace meses en loop. **Se apaga.** Si hace falta, se arregla la ruta al binario; hoy sólo gasta forks. |
| `avance-sync`, `balanz-browser`, `espejos`, `mantener-caliente`, `plan-ejecutar`, `sync` | Muertos o apagados de hecho. Se dan de baja o se arreglan; hoy son ruido en el inventario. |
| `pg-reprod`, `pg-obra-doc` | Bases auxiliares de reproducción/pruebas: **son desarrollo**, se van con el dev box. |
| `arca-sync`, `cobranzas-sync`, `compras-sync`, `pedidos-sync`, `drive-index`, `caja-espejo` | Técnicamente podrían correr en cualquier lado (hablan con APIs y con Supabase), pero **todos dependen de `google-sa.json` o de `SUPABASE_SERVICE_ROLE_KEY`**. Mover cada uno es mover la llave. No hay ganancia: son baratos. |
| Mattermost (3 contenedores, ~300 MB) | **Podría** ir a un host propio o a Mattermost Cloud, y eso desataría a los 4 servicios de comunicación. Es la única palanca que separa de verdad el bot de esta máquina. |

**Conclusión del inventario: no conviene mudar producción. Conviene mudar desarrollo.** Producción
son 361 MB de daemons y timers cortos, todos atados a credenciales locales y a puertos de loopback.
Desarrollo son cientos de MB variables, picos de CPU impredecibles y **cero** ataduras.

---

## 3. Opciones, con costo

Precios de Vultr **verificados el 23/09/2026** contra `https://api.vultr.com/v2/plans?per_page=500`
(endpoint público, sin autenticación). **HECHO.**

| Plan | vCPU | RAM | Disco | USD/mes |
|---|---|---|---|---|
| `vc2-1c-2gb` | 1 | 2 GB | 55 GB | 10 |
| `vc2-2c-4gb` | 2 | 4 GB | 80 GB | 20 |
| `vc2-4c-8gb` | 4 | 8 GB | 160 GB | **40** |
| `vhf-2c-4gb` | 2 | 4 GB | 128 GB | 24 |
| `vhf-3c-8gb` | 3 | 8 GB | 256 GB | 48 |

La VM actual (4 vCPU, 7.418 MB, 150 GB) coincide con `vc2-4c-8gb` = **USD 40/mes**. El importe
facturado real no lo verifiqué: **DESCONOCIDO**.

### Opción A — VM de desarrollo aparte, producción se queda

Nueva `vc2-4c-8gb` sólo para desarrollo: vscode-server, agentes, worktrees, `next dev`, Playwright,
`pg-reprod`, `pg-obra-doc`. La VM de hoy se queda con producción y se le puede bajar el plan.

- Costo: **+USD 40/mes** (HECHO, tarifa verificada).
- Si después producción baja a `vc2-2c-4gb` (le sobra: usa 361 MB + picos de `flujo-caja`), el
  delta neto es **+USD 20/mes**. Bajar de plan en Vultr no reduce el disco ya asignado sin recrear
  la instancia — **ESTIMACIÓN**, no lo verifiqué.
- Qué **no** resuelve: nada de producción cambia de sitio, así que el `flujo-caja` de 31 h de CPU
  sigue compitiendo con los otros timers entre sí.

### Opción B — VM de producción nueva, desarrollo se queda

Al revés que A. Mismo precio de lista, **pero** hay que mudar `google-sa.json`, los refresh tokens de
Google, `SUPABASE_SERVICE_ROLE_KEY`, los secretos de Mattermost, los túneles cloudflared y los tres
contenedores de Mattermost. Todo con efecto sobre el Sheet real.

- Costo: **+USD 40/mes** (HECHO).
- Costo real: el riesgo. Cada credencial movida es una oportunidad de que un timer escriba el Sheet
  desde un sitio nuevo con código no verificado. **No recomendada.**

### Opción C — cgroups en la misma máquina, sin VM nueva

Poner `MemoryMax`, `MemoryHigh` y `CPUWeight` a la parte de desarrollo (un `.slice` propio para el
vscode-server y los agentes) y dejar producción con `CPUWeight` alto.

- Costo: **USD 0** (HECHO: es configuración de systemd).
- Qué resuelve: que desarrollo no se lleve puesta la RAM. Es lo que los 1.508 MB de swap sugieren que
  ya pasó.
- Qué **no** resuelve: 4 vCPU siguen siendo 4. Una suite en paralelo satura la CPU igual, y ya hay
  precedente documentado (`orq:test` tumbando Supabase). **Es un paliativo, no una separación.**
- Es **lo primero que hay que hacer igual**, aunque se elija A: es gratis y aplica en minutos.

### Opción D — contenedores en la misma máquina

Empaquetar producción en contenedores.

- Costo: USD 0 de infraestructura; el costo es trabajo de migración.
- **No resuelve el problema planteado**: el mismo kernel, la misma RAM, la misma CPU. Es la Opción C
  con más pasos. Se descarta.

### Opción E — servicio administrado (Render / Fly / Railway)

- Precio: **ESTIMACIÓN**, no verificado (no consulté ninguna API de esos proveedores).
- **Bloqueante técnico, no económico:** `orq-worker` y `orq-interactive` crean worktrees de git y
  ejecutan la CLI de Claude Code contra el disco. Eso no es una app stateless. Y Mattermost en
  loopback no existe en un PaaS. Se descarta por arquitectura, antes que por precio.

### Recomendación

**Opción C ahora (USD 0), Opción A después (+USD 40/mes, o +USD 20 neto si se baja el plan de
producción).** Mudar desarrollo, no producción: es lo único que no tiene credenciales locales ni
puertos de loopback, y es lo que realmente consume.

---

## 4. Deploy automático, y cómo se verifica de verdad

### 4.1 Lo que ya existe

`orquestador/scripts/produccion-al-dia.mjs` (76 líneas, leído) hace `git fetch` + `merge --ff-only`
sobre el checkout de producción, con tres reglas: no toca si el árbol está sucio, no fuerza si
divergió, y nunca frena el pipeline si no hay red. Está bien hecho.

**HECHO: sólo lo invocan 5 unidades** — `asistencia-obra`, `espejo-legajos`, `impuestos-postgres`,
`jornales-registros`, `flujo-caja`. Es decir: **los cinco timers que escriben el Sheet**. Todo lo
demás corre con el código que haya.

### 4.2 El defecto medido hoy

**HECHO**, cruzando `git reflog` del checkout de producción contra `ExecMainStartTimestamp`:

```
reflog producción:   7eb016be  23/09 08:19:28   merge origin/main (ff)
                     bdc6e8b5  23/09 08:17:55
                     83f1283d  23/09 07:56:13
                     07b11e5b  22/09 19:24:00
                     cc75cdf2  22/09 18:20:35
```

```
echegaray-orq-worker        arrancó 22/09 18:01:05
echegaray-orq-interactive   arrancó 22/09 18:01:15
echegaray-xsas-gateway      arrancó 22/09 18:01:16
echegaray-asistencia-http   arrancó 22/09 18:01:05
echegaray-os-tunnel         arrancó 09/09 19:25:56
```

**Los cuatro primeros arrancaron a las 18:01 del 22/09 y el checkout avanzó cinco veces desde las
18:20. Están corriendo código anterior a `cc75cdf2`.** El de los túneles, código del 09/09.
`systemctl is-active` dice `active` para los cinco. Nadie se entera.

(`comunicacion-ws` y `comunicacion-worker` arrancaron 23/09 08:19:33 y 08:19:42, cinco y catorce
segundos después del merge de 08:19:28: ésos los reinició una persona a mano.)

El script resuelve el **checkout**. No resuelve el **proceso**. Un daemon de Node carga sus módulos
una vez, al arrancar: mover el HEAD debajo de sus pies no cambia nada de lo que ya está en memoria.

### 4.3 Cómo se dispara

Ya hay una URL HTTPS estable hacia la VM (`app.ecsas.com.ar` → Vercel → túnel cloudflared →
`127.0.0.1:8790`) y ya hay un lugar donde publicar estado (`public.os_runtime`). No hace falta
infraestructura nueva.

1. **Webhook de GitHub** sobre `push` a `main` → `https://app.ecsas.com.ar/api/os/deploy`, con el
   secreto HMAC de GitHub verificado. Vercel reenvía al motor interactivo por el túnel.
2. El motor interactivo **no despliega él mismo** — se reiniciaría a sí mismo a mitad del trabajo.
   Encola el trabajo en una unidad aparte, `echegaray-deploy.service` (oneshot,
   `Type=oneshot`, disparada por `systemctl --user start`), que:
   - corre `produccion-al-dia.mjs` (ya existe, ya tiene las tres reglas);
   - si el HEAD **no** cambió, termina sin tocar nada;
   - si cambió, corre `npm ci --omit=dev` sólo si `package-lock.json` cambió en el diff;
   - reinicia **en orden** los daemons de producción (ver 4.5);
   - verifica (4.4) y avisa al canal de Mattermost con el resultado.
3. **Cinturón de seguridad**, porque un webhook puede perderse: un timer cada 10 min que corre la
   misma unidad. Si el HEAD ya coincide, sale en menos de un segundo.

**Límite conocido:** no hay `.github/workflows` en el repo (HECHO: el directorio no existe). Este
deploy despliega lo que entró a `main`, sin ninguna prueba en el medio. La suite sigue siendo
responsabilidad de quien mergea. Declararlo no lo arregla, pero esconderlo sería peor.

### 4.4 La verificación — por dato del proceso, no por estado de unidad

**`systemctl is-active` no sirve, y está medido en esta máquina:** `echegaray-claude-remote` lleva
**58.421 reinicios** fallando con `status=203/EXEC` y `is-active` devuelve `activating`, no `failed`.
Un chequeo por estado de unidad lo daría por bueno durante meses. Lo dio.

Tampoco sirve preguntarle la versión a un endpoint que lee del disco. **HECHO:** el `/version` que
hoy expone `interactive-server.mjs` hace `readFile(REPO/extension/manifest.json)` **en cada pedido**.
Devuelve lo que hay en el disco, no lo que cargó el proceso. Después de un `git merge` responde el
commit nuevo aunque el proceso siga siendo el viejo. **Ese endpoint no puede usarse como
verificación de deploy** — es exactamente el control que se valida contra la información que él mismo
produce.

La verificación correcta compara **tres datos que sólo puede dar un proceso que arrancó de nuevo**:

1. **El commit, congelado al arrancar.** Cada daemon lee `git rev-parse HEAD` **una sola vez, en el
   módulo principal, al iniciar**, y lo guarda en una constante. Si lo lee por pedido, no prueba
   nada.
2. **El PID.** Tiene que ser **distinto** del que había antes del deploy.
3. **La hora de arranque.** Tiene que ser **posterior** al momento del merge.

Cada daemon expone `GET /salud` en loopback con:

```json
{ "commit": "7eb016be...", "pid": 4044736, "arrancado": "2026-09-23T11:19:33Z", "listo": true }
```

Y el verificador, que corre **después** del reinicio y **desde afuera del proceso**:

| Chequeo | Falla si |
|---|---|
| `commit` == el SHA que acaba de entrar a `main` | está corriendo código viejo |
| `pid` != el PID capturado antes del reinicio | la unidad nunca reinició |
| `pid` == `systemctl --user show -p ExecMainPID` | el que contesta no es el proceso de la unidad |
| `arrancado` > timestamp del merge | arrancó antes del código nuevo |
| **estabilidad**: los tres datos siguen iguales **30 s después** | está en loop de reinicio (el caso `claude-remote`) |
| `NRestarts` no subió entre las dos lecturas | ídem, por el otro lado |

Los cinco chequeos, o el deploy se declara fallado. La segunda lectura a los 30 s es la que separa
«arrancó» de «está arrancando una y otra vez», y es la que hoy falta.

**Qué pasa si falla:** no hay rollback automático. `produccion-al-dia.mjs` ya se niega a forzar nada,
y un rollback que mueve el HEAD debajo de los timers que escriben el Sheet es peor que el problema.
El deploy fallado **avisa al canal de Mattermost con el commit, la unidad y las últimas 20 líneas del
journal**, y espera a una persona. El código viejo sigue corriendo, que es el estado conocido.

### 4.5 Orden del reinicio

Los timers que escriben el Sheet no pueden estar corriendo durante el reinicio. Antes de reiniciar
nada: `systemctl --user list-units --state=running` filtrando los 5 timers de Sheet; si alguno está
activo, **esperar**, no matar. Un `flujo-caja-rehacer-todo.mjs` interrumpido a la mitad deja la
pestaña rota.

Después, de menos a más crítico: `xsas-gateway` → `asistencia-http` → `comunicacion-worker` →
`comunicacion-ws` → `orq-worker` → `orq-interactive`. El motor interactivo va último porque es el que
recibió el webhook. `os-tunnel` **no se reinicia salvo que cambie `os-tunnel.sh`**: al reiniciarlo
rotan las URLs de los túneles y hay que esperar el re-registro en `os_runtime`.

---

## 5. Orden recomendado y qué se rompe en cada paso

| # | Paso | Costo | Qué se rompe / riesgo |
|---|---|---|---|
| 1 | **Apagar `echegaray-claude-remote`** (58.421 reinicios en vacío) y dar de baja `avance-sync`, `balanz-browser`, `espejos`, `mantener-caliente`, `plan-ejecutar`, `sync` | USD 0, minutos | Nada: ya no funcionan. Riesgo: que alguno estuviera «apagado a propósito para después». Confirmar antes de borrar el unit file; con `disable` alcanza. |
| 2 | **Añadir `/salud` con commit-al-arranque + PID + hora** a los 6 daemons, sin cambiar nada más | USD 0, 1 día | Riesgo bajo: es una ruta nueva en loopback. Si se lee el commit por pedido en vez de al arrancar, el trabajo entero queda inútil y parece que funciona. |
| 3 | **Verificador de deploy** que consume 4.4, corrido a mano contra producción tal como está hoy | USD 0 | Debería **fallar** hoy: `orq-worker` corre código anterior a `cc75cdf2`. Si pasa en verde, el verificador está mal y hay que arreglarlo antes de seguir. Ésa es la prueba de que el control puede decir que no. |
| 4 | **`echegaray-deploy.service`**, primero con timer cada 10 min (sin webhook) | USD 0, 1 día | El primer reinicio ordenado de los 6 daemons después de meses. Se rompe lo que dependa de estado en memoria que nadie documentó. **Hacerlo con el dueño despierto, nunca durante una quincena ni con un timer de Sheet en curso.** |
| 5 | **Webhook de GitHub**, con el timer como red | USD 0 | Superficie nueva expuesta por Vercel. Si el HMAC no se verifica, cualquiera dispara un deploy. El timer ya hacía el trabajo: el webhook sólo baja la latencia de 10 min a segundos. |
| 6 | **Slice de desarrollo con `MemoryMax`/`CPUWeight`** (Opción C) | USD 0 | Un agente o un build que se pase del límite muere por OOM en vez de tumbar la máquina. Es el comportamiento deseado, pero hay que **medir primero** cuánto pide un build real: un tope demasiado bajo rompe la suite y parece un bug del código. |
| 7 | **VM de desarrollo aparte** (Opción A) | **+USD 40/mes** | Se rompe todo lo que asume que el repo de dev y el de producción están en el mismo disco (worktrees, `cp -al`, rutas absolutas en scripts). Hay que revisar `orq-worker` y `cleanup-worktrees.mjs` antes. Es el paso más caro en trabajo, y el único que separa de verdad. |
| 8 | **Bajar el plan de producción** a `vc2-2c-4gb` | **−USD 20/mes** | Sólo después de medir un mes con desarrollo afuera. `flujo-caja` acumuló 31 h de CPU: con 2 vCPU hay que confirmar que sigue entrando en su ventana de 2 h. **No hacerlo antes de esa medición.** |

Pasos 1 a 6: **USD 0** y arreglan el problema de verificación, que es el que hoy borra trabajo en
silencio. Paso 7: **+USD 40/mes** y arregla la contención. Paso 8 lo baja a **+USD 20/mes** netos.

---

## Límites conocidos de este documento

- **No verifiqué el importe facturado** de la VM actual, sólo la tarifa de lista del plan que le
  corresponde por specs. **DESCONOCIDO.**
- **No medí la VM bajo carga de desarrollo.** Todas las mediciones son de un momento tranquilo
  (load 0,63). Los 1.508 MB de swap son la única evidencia indirecta de la saturación; **no encontré
  el evento de OOM en el journal** dentro de la ventana consultada. **La magnitud de la contención
  está afirmada por inferencia, no medida.**
- **No hay precios verificados de PaaS** (Render, Fly, Railway). Esa opción se descartó por
  arquitectura, no por costo.
- **Nada de lo propuesto en la sección 4 está construido ni probado.** Es un plan. La única parte
  medida es el defecto que lo motiva.
- Este documento lo escribió quien no va a implementarlo, y **nadie más lo revisó todavía.**

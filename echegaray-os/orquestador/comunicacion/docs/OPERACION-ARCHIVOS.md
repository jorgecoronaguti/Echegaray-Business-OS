# Recepción de archivos por chat — operación

**El pedido, textual:** *"crea la capacidad de recibir cualquier tipo de archivo de cualquier formato
por acá porque es algo que ya hacías bien"*.

**Lo que lo destapó:** el dueño subió el CSV del extracto bancario al bot, el bot no lo procesó, y el
archivo terminó bajándose a mano desde la API de Mattermost.

---

## Qué hace, en una tabla

| Lo que soltás | Qué hace | ¿Escribe algo? |
|---|---|---|
| CSV / Excel del banco | Previsualiza: movimientos, líneas que no entendió, cuántos son nuevos, si la cadena de saldos cierra | **No**, hasta que apretás **Importar** |
| PDF | Extrae el texto localmente y dice qué encontró. Si está escaneado, lo dice | No |
| Foto de comprobante | La deriva a Compras IA (el camino que ya existía) | Lo que decida ese flujo |
| Planilla que no es del banco | Filas, columnas y "no sé qué hacer con esto" | No |
| Texto plano | Lo muestra | No |
| Cualquier otro formato | Qué es **de verdad** (por sus bytes) y cuánto pesa, y declara que no sabe qué hacer | No |
| Corrupto / vacío / enorme | Lo dice, con el motivo, y nunca inventa el contenido | No |

**El formato se detecta por el CONTENIDO.** El nombre y el `mime_type` los escribe quien sube: el CSV
del homebanking llega como `descargaUltimosMovimientos.xls`. Cuando el nombre y los bytes se
contradicen, mandan los bytes y la contradicción se muestra al lado.

---

## Dónde funciona

| Origen | ¿Entra sin mencionar a `@os`? |
|---|---|
| DM al bot | **Sí**, siempre |
| Canal de comprobantes (área `compras`) | Sí — y ahí manda Compras IA, no esto |
| Canal atado al área `administracion_finanzas` | **Sí** (`AREAS_DE_ADJUNTOS` en el consumidor WS) |
| Cualquier otro canal | Sólo mencionando a `@os` |

---

## Las dos puertas de la importación

Leer y previsualizar **no tiene efecto** y sólo exige identidad real de plataforma. Importar cambia
`public.banco_movimientos`, y de ahí cuelgan por fórmula CAJA, el impuesto al cheque, los costos
bancarios y el cruce de Cheques. Por eso:

1. **Canal**: tiene que ser el canal oficial del área `administracion_finanzas`, que sale de
   `comunicacion.canales_area` — nunca de un id escrito en el código.
2. **Permiso**: grant `finanzas.banco.import` en `comunicacion.permisos_skill`, **o** ser miembro de
   ese canal oficial.

Fail-closed: si la base no responde o Mattermost no contesta la membresía, se deniega. La puerta se
evalúa **antes** de mostrar el botón: si no se pasa, se muestra lo leído y se dice por qué no hay
botón — un botón que existe para contestar "no podés" manda a diagnosticar el lado equivocado.

---

## Antes que nada: correr el auditor

No hace falta leer la lista de abajo para saber qué falta. **Se pregunta:**

```bash
set -a; . ~/.config/echegaray-orq/comunicacion.env; set +a
node orquestador/scripts/auditar-cableado-chat.mjs            # mira base + entorno + API + URL pública
node orquestador/scripts/auditar-cableado-chat.mjs --reparar   # ata el canal y otorga el grant (idempotente)
```

Sale con código 1 si falta algo. Nunca imprime un secreto. `--reparar` toca **sólo** datos de
configuración en Postgres: no despliega, no reinicia servicios y no toca Caddy.

Y para probarlo de punta a punta sin depender de que el dueño mande una foto:

```bash
node orquestador/scripts/probar-archivo-en-vivo.mjs --archivo /ruta/al/extracto.csv --canal os-pruebas
```

Sube el archivo, crea un post REAL, inyecta en el borde de ingesta con la identidad de una persona
real, espera al worker de producción y **relee del servidor la respuesta publicada**. La evidencia es
el efecto, no lo que devolvió una función.

**Estado verificado el 05/08/2026** (con esos dos comandos, contra el sistema vivo):

| Pieza | Estado |
|---|---|
| Migración `comunicacion.archivos_recibidos` | ✓ aplicada |
| `corridas_estado_check` acepta `browser_error` | ✓ aplicada |
| Binding `administracion_finanzas` → `administracion` (Oficina) | ✓ (lo ató `--reparar`) |
| Grant `finanzas.banco.import` | ✓ sólo el dueño (los jefes de obra **no**: cargar un gasto y reescribir el saldo del banco no son el mismo permiso) |
| `ARCHIVOS_ACCION_SECRETO` | ✗ **falta** en `comunicacion.env` y en `asistencia-http.env` |
| Ruta pública `/archivos/accion` | ✗ **404** — el Caddyfile que Caddy montea (`worktrees/release-runtime`) no tiene el bloque, y el commit desplegado no monta la ruta |
| Código desplegado | ✗ **`deploy/comunicacion-protegido` no tiene la carpeta `archivos/`** |

La última fila explica todas las demás: los servicios se reiniciaron, pero sobre un commit que no
tiene la feature. Por eso `archivos_recibidos` tiene **0 filas**: el camino nunca se ejecutó.

---

## Qué hace falta para que ande en producción

### 1. La migración

```
supabase/migrations/20260804120000_archivos_por_chat.sql
```

Aditiva, aislada en el schema `comunicacion`. **El código anda antes y después**: sin la tabla, el
bot lee el archivo, lo previsualiza y dice que la carga todavía no está habilitada.

### 2. El binding del canal

```sql
insert into comunicacion.canales_area (plataforma, channel_id, canal_nombre, area_clave, activo)
values ('mattermost', '<channel_id>', '<slug-del-canal>', 'administracion_finanzas', true)
on conflict (plataforma, channel_id) do update set area_clave = excluded.area_clave, activo = true;
```

### 3. El permiso (o la membresía del canal)

```sql
insert into comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso, display, activo)
values ('mattermost', '<user_id>', 'finanzas.banco.import', '<nombre>', true)
on conflict (plataforma, plataforma_user_id, permiso) do update set activo = true;
```

### 4. Entorno (`~/.config/echegaray-orq/comunicacion.env`)

| Variable | Para qué | Default |
|---|---|---|
| `ARCHIVOS_ACCION_URL` | URL pública del callback de los botones | `https://chat.ecsas.com.ar/archivos/accion` |
| `ARCHIVOS_ACCION_SECRETO` | **Obligatorio.** Sin él los botones se deniegan | — |
| `ORQ_ARCHIVOS_MAX_BYTES` | Techo por archivo (se rechaza por metadata, sin bajarlo) | `26214400` (25 MB) |
| `ORQ_ARCHIVOS_MAX` | Techo de archivos por post | `10` |
| `ORQ_ARCHIVOS_MAX_FILAS` | Filas que se miran de una planilla | `5000` |

**Es un TERCER secreto**, distinto del de asistencia y del de comprobantes, a propósito: quien puede
confirmar un gasto no tiene por qué poder reescribir el saldo del banco. Un secreto compartido entre
dos puertas es una sola puerta.

### 5. Caddy

La ruta `/archivos/accion` ya está en `infra/mattermost/caddy/Caddyfile`, contra el **mismo socket**
que asistencia y comprobantes: `servidor-asistencia.mjs` monta las tres. Sin upstream nuevo, sin
servicio nuevo, sin puerto nuevo. Hay que **recargar Caddy** para que la tome.

### 6. Qué servicios reiniciar

| Servicio | ¿Hace falta? | Por qué |
|---|---|---|
| `echegaray-comunicacion-worker` | **Sí** | carga el registro de especialistas y el flujo |
| `echegaray-comunicacion-ws` | **Sí** | cambió `AREAS_DE_ADJUNTOS` en el prefiltro de ingesta |
| `echegaray-asistencia-http` | **Sí** | monta la ruta nueva `/archivos/accion` |

---

## Cero API

Todo este camino es determinístico: detectar el formato por sus bytes, parsear el extracto y extraer
el texto de un PDF no necesitan un modelo. El único que sí lo necesita —mirar una foto— vive en el
camino de comprobantes y se alcanza por **import dinámico**, para que el árbol estático no lo toque.
`archivos/cero-modelo.test.mjs` recorre los imports y se pone rojo si alguien lo rompe.

---

## De dónde sale cada cosa (no se reescribió ningún motor)

| Capacidad | Quién la hace |
|---|---|
| Entender un extracto (es-AR, paréntesis = débito, referencia, cadena de saldos) | `lib/banco-importar.mjs`, con sus 30 tests |
| Escribir en `banco_movimientos` y releerlo | `lib/banco-escribir.mjs` — **el mismo INSERT** que usa `scripts/importar-banco.mjs` |
| Leer un Excel | `xlsx` (ya era dependencia) |
| Leer un PDF | `pdf-parse` (ya era dependencia), local, sin mandar el PDF a ningún modelo |
| Cargar un comprobante | `comunicacion/comprobantes/*` — intacto |

---

## Cuando algo sale mal

| Síntoma | Dónde mirar |
|---|---|
| El bot contesta **"No supe a quién derivarlo"** y muestra el catálogo | el worker desplegado NO tiene el especialista. Si en ese catálogo no figura **Recepción de archivos**, es eso y no otra cosa |
| El bot no contesta al archivo | ¿es DM, mención, o canal de ingesta? journal de `-ws` (`ws: ignorado por guarda` dice el motivo) |
| `ws: HAY CANALES DE INGESTA QUE NO EXISTEN` | un nombre de `MM_CANALES_ADJUNTOS` no corresponde a ningún canal: esos mensajes se pierden en silencio. Corregir el `.env` o invitar al bot al canal |
| "todavía no está habilitada" | falta la migración |
| Previsualiza pero no hay botón | falta el binding del canal, o el grant/membresía; el mensaje dice cuál |
| Los botones no hacen nada | falta `ARCHIVOS_ACCION_SECRETO`, o Caddy no publica `/archivos/accion` |
| "la cadena de saldos NO cierra" | hay un typo, falta un movimiento, o el extracto arranca en otra ventana. **No se carga**: es el control correcto |
| "No cargué nada nuevo" | el extracto ya estaba entero en la base (las ventanas se superponen) |
| Se importó pero el Sheet no lo muestra | falta `node orquestador/scripts/banco-raw-pestana.mjs`; CAJA/Impuestos/Cheques se recalculan solos después |

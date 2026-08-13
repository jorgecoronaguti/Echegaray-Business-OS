# Comprobantes de gasto por Mattermost — cómo se enciende y cómo se opera

El dueño manda la foto (o el PDF) de un comprobante al canal `comprobantes-gastos` y el OS lo lee,
muestra lo que entendió y —**sólo con su confirmación**— lo escribe en la pestaña `Compras` del
*Flujo de Caja - Cash Flow*.

No hay pantalla. Todo pasa dentro de Mattermost.

---

## El camino

```
foto en #comprobantes-gastos
  └─ mattermost-ws-consumer   acepta el post por tener ADJUNTOS en un canal de ingesta
      └─ conector.recibir → comunicacion.inbox (dedup por post.id)
          └─ worker-comunicacion → handlers/comunicacion.mjs
              └─ director.resolver()     ← lo reclama `especialistas/comprobantes.mjs` (0 API)
                  └─ comprobantes/flujo.mjs
                      · puerta: canal oficial + grant de permiso   (fail-closed)
                      · baja los adjuntos de Mattermost
                      · lib/comprobantes/vision.mjs → 1 llamada al modelo POR ADJUNTO,
                        + una SEGUNDA con un modelo grande sólo si la primera dudó
                      · matchea proveedor contra el desplegable estricto (E), y la obra
                        escrita A MANO contra el desplegable de J + el vocabulario vivo de K
                      · concilia contra `public.comprobantes_arca`: CORRIGE el número mal
                        leído, completa el CUIT del emisor y, si los importes no cierran,
                        los reemplaza por los del libro fiscal
                      · ¿ya está cargado? → (CUIT, tipo, número) en el registro del chat
                        Y en la pestaña `Compras` VIVA (lo que entró por Claude Code o a mano)
                      · abre o amplía el FAJO y publica el mensaje con botones
                          └─ [Confirmar] → POST /comprobantes/accion  (secreto en la query)
                              └─ comprobantes/escritura.mjs
                                  └─ scripts/cargar-comprobantes-compras.mjs --json
                                      └─ pestaña "Compras"
```

## Lo que hace falta para que ande

### 1. Migración

```
supabase/migrations/20260803120000_comprobantes_por_chat.sql
```

Crea `comunicacion.comprobante_fajos` y `comunicacion.comprobantes_cargados`. **Antes de aplicarla el
bot contesta "todavía no está habilitada"** en vez de romper: el deploy y la migración no siempre
caen juntos. Rollback en `orquestador/db/rollback/20260803120000_comprobantes_por_chat_down.sql`.

Verificar en la base (no en `migrations/`):

```sql
select table_name from information_schema.tables
 where table_schema='comunicacion'
   and table_name in ('comprobante_fajos','comprobantes_cargados');
```

### 2. Atar el canal a su área

El canal oficial **no está en el código**: sale de `comunicacion.canales_area`.

> **El canal se llama distinto de lo que se ve.** En este Mattermost el canal que en pantalla dice
> `Comprobantes-gastos` tiene el slug **`compras`** y el id `ataehrdpmfyctqyjcfz5rs9jka`. Eso importa
> dos veces: el frame `posted` del WebSocket manda el **slug**, no el nombre visible, y configurar el
> nombre visible en `MM_CANALES_ADJUNTOS` hace que la guarda no matchee nunca y la foto no llegue a
> nadie. Verificado con un frame real del Mattermost vivo — los tests con canal de mentira pasaban
> igual porque traían el nombre que el código esperaba. Por eso la guarda ahora acepta también el
> **channel_id**, que es lo único que sobrevive a que alguien renombre el canal.

```sql
insert into comunicacion.canales_area (plataforma, channel_id, canal_nombre, area_clave)
values ('mattermost', 'ataehrdpmfyctqyjcfz5rs9jka', 'comprobantes-gastos', 'compras')
on conflict (plataforma, channel_id) do update set area_clave='compras', activo=true;
```

Desactivar esa fila apaga la carga en el acto, sin desplegar.

### 3. Dar el permiso (uno por persona)

Estar en el canal **no habilita**. Hace falta un grant activo, siempre estricto:

```sql
insert into comunicacion.permisos_skill (plataforma, plataforma_user_id, permiso, display, otorgado_por, activo)
values ('mattermost', '<user_id>', 'compras.comprobantes.write', 'Rodrigo', 'direccion', true)
on conflict (plataforma, plataforma_user_id, permiso) do update set activo=true;
```

### 4. Entorno (`~/.config/echegaray-orq/comunicacion.env`)

| Variable | Para qué | Default |
|---|---|---|
| `COMPROBANTES_ACCION_URL` | URL pública del callback de los botones | `https://chat.ecsas.com.ar/comprobantes/accion` |
| `COMPROBANTES_ACCION_SECRETO` | **Obligatorio.** Sin él los botones se deniegan | — |
| `MM_CANALES_ADJUNTOS` | Canales donde un post con adjuntos entra sin mencionar a `@os`. **Slug o channel_id** | `comprobantes-gastos,compras` |
| `ORQ_COMPROBANTES_MODELO` | Modelo de visión de la PRIMERA lectura | `claude-haiku-4-5-…` |
| `ORQ_COMPROBANTES_MODELO_REVISION` | Segunda lectura, sólo si la primera dudó. Vacío = apagada | `claude-sonnet-4-5-…` |
| `ORQ_CUIT_EMPRESA` | El CUIT del COMPRADOR, que nunca puede ser el del emisor | `30716304643` |
| `ORQ_COMPROBANTES_VENTANA_MIN` | Ventana de agrupación del fajo | `5` |
| `ORQ_COMPROBANTES_MAX_ADJUNTOS` | Techo de adjuntos por post | `12` |
| `ANTHROPIC_API_KEY` | La lectura de la foto | — |

El secreto de comprobantes es **distinto** del de asistencia a propósito: dos puertas, dos llaves.
Compartirlo haría que quien puede cargar asistencia pudiera confirmar un gasto.

### 5. Caddy

Publicar `/comprobantes/accion` contra el mismo socket que ya usa `/asistencia*`
(`infra/mattermost/caddy/Caddyfile`).

### 6. Reiniciar sólo lo que cambió

| Servicio | ¿Lo toca este cambio? |
|---|---|
| `echegaray-comunicacion-ws` | **sí** — `esRelevante` acepta adjuntos |
| `echegaray-comunicacion-worker` | **sí** — el especialista y el flujo |
| `echegaray-asistencia-http` | **sí** — la ruta nueva de los botones |

---

## Cómo se prueba en producción

El bot no es admin: no puede publicar en nombre de una persona. Se inyecta en el borde de ingesta.

1. Subir un archivo REAL con el token del bot (`POST /api/v4/files`) y crear un post REAL con él.
2. Llamar `conector.recibir({ user_id: <persona>, channel_id, post_id: <id real>, text: '',
   root_id: <id real>, channel_type: 'P', file_ids: [<file id real>] })`.
   Con un id inventado Mattermost rechaza la respuesta (`Invalid RootId parameter`) y el evento se va
   a dead-letter: eso es el arnés fallando, no el producto.
3. Esperar al worker de producción y **leer el mensaje publicado en Mattermost**, no el retorno.

Después, siempre: `comunicacion.outbox` (mirar `dead`), `orq.chat_result` y el journal del worker.

---

## Lo que se arregló el 03/08 (tarde), y contra qué se midió

El dueño mandó al canal la foto de una factura de Corralón Progreso (`IMG_7530.jpg`, un ticket
fotografiado **acostado 90°**). El bot contestó:

```
Corralon Progreso · F A 0004-00036542 · 30/07/2026
  obra: falta · ❓ no dice a qué obra va — ¿cuál es?
No hay nada que cargar todavía.
```

Dos defectos, y ninguno era del código de arriba:

1. **No leyó lo escrito a mano.** En la foto, con birome, decía **"Messinas BSA"**: la obra. En esta
   empresa la obra se anota A MANO sobre el comprobante — es el dato más importante para imputar el
   gasto y el único que nunca viene impreso, porque el proveedor no sabe a qué obra va.
2. **No detectó el duplicado.** Ese comprobante YA estaba en `Compras` **fila 802**
   (`MESSINA` / `Planta de BSA`), cargado por Claude Code. La visión había leído `0004-00036542`
   cuando el número real es `0004-00003642` —**un dígito de más**— y como la deduplicación se apoya
   en el número, no colapsó contra nada. Un dígito mal leído = una compra contada dos veces.

Corrido contra la foto REAL, el padrón REAL y la pestaña REAL, el mismo comprobante ahora produce:

```
Corralon Progreso · F A 0004-00003642 · 30/07/2026
  total $62.000,00 · IVA $10.760,33 · importe a Compras $51.239,67
  obra: MESSINA (escrito a mano) · …
  ✓ figura en ARCA (PEREZ GARCIA MARISOL BIBIANA) · CAE 86316017919602
  ✓ ya está cargado en la fila 802 de Compras — no lo vuelvo a cargar
```

Los tres importes coinciden al centavo con la fila 802. Lo que lo hace posible:

| Defensa | Dónde vive | Qué garantiza |
|---|---|---|
| Prompt de visión reescrito | `lib/comprobantes/vision.mjs` | busca lo manuscrito en los cuatro márgenes, avisa que la foto puede venir girada, distingue los DOS CUIT del papel, pide el CAE, y **permite dudar** (una versión que exigía no devolver null hizo que el modelo FABRICARA importes) |
| Escalera de lectura | `vision.mjs` · `necesitaRevision` | una segunda lectura con un modelo grande **sólo** cuando la primera dudó: total ausente, aritmética que no cierra, ilegible, o ninguna anotación manuscrita. Las dos lecturas se fusionan campo por campo |
| Matcheo tolerante | `lib/comprobantes/imputacion.mjs` | plural, abreviatura y un error de tipeo. **Si no es único, es null y se pregunta** |
| Vocabulario vivo de la columna K | `lib/comprobantes/compras-vivas.mjs` | K **no tiene desplegable**: su lista legítima es lo que el dueño ya usó en esa obra. "BSA" resuelve MESSINA porque los tres detalles con BSA son de MESSINA |
| Conciliación con ARCA | `lib/comprobantes/arca.mjs` | corrige el número, completa el CUIT del emisor y reemplaza los importes cuando no cierran. Ojo con el formato: ARCA guarda `punto_venta` y `numero` sueltos y sin ceros (`4`, `3642`) |
| Duplicado contra `Compras` VIVA | `compras-vivas.mjs` · `flujo.mjs` | por tipo+número es certeza; por proveedor+fecha+importe con otro número es un **probable** duplicado que se pregunta con botones |

**Que un comprobante esté en ARCA NO es un duplicado**: toda factura electrónica recibida está ahí.
El duplicado se busca en `Compras` y en el registro, nunca en el padrón.

**Corralón Progreso factura como `PEREZ GARCIA MARISOL BIBIANA`**: el nombre del desplegable no es la
razón social del padrón. Matchear proveedores por nombre contra ARCA no funciona y no se intenta.

## La prueba viva — el camino entero, sin tocar `Compras` (13/08)

```
node orquestador/comunicacion/comprobantes/prueba-viva.mjs
```

Levanta un Postgres **efímero** en Docker, clona al canal `OS Pruebas` los **HEIC reales** que el
dueño mandó desde su iPhone, los mete por el borde de ingesta —`parsearPosted` → `esRelevante` →
`mapearAPayload` → `conector.recibir`— y corre el **mismo tick que `worker-comunicacion.mjs`**
(incluidos los dos `recuperarLeases`, que son el reaper). Visión real, Sheet real, cargador real con
`--dry` (`ORQ_COMPROBANTES_ENSAYO=1`). Al terminar destruye la base y deja los mensajes publicados
en `OS Pruebas` para poder mirarlos.

Por qué una base efímera y no la de producción: **dos workers sobre la misma cola se roban las
tareas**. Con la base productiva, el worker real podría reclamar la tarea de la prueba y escribirla
en `Compras` de verdad. Y por qué se copia `public.comprobantes_arca` de producción: sin el libro
fiscal la conciliación no corrige el número ni los importes, y la prueba saldría peor que la
realidad — medido: con la tabla vacía, uno de los ocho quedó marcado como duplicado que no era.

Resultado medido el 13/08 (tres corridas):

| Qué | Resultado |
|---|---|
| 8 adjuntos (7 HEIC + 1 PDF) en 3 posts → cuántos mensajes publica el bot | **1**, editado, **0 tarjetas** |
| HEIC del iPhone → conversión | 4.384 KB `image/heic` → 462 KB `image/jpeg` |
| HEIC → fila | `Corralon Progreso · F A 0004-00003695 · 10/08/2026 · IVA $6.747,85 · Total $38.880,45 · CAE 86327713045308 · categoría **B** derivada · obra **LA ESTRELLA** desde lo manuscrito («Estrella galpón 9 · c/c») · condición Cuenta Corriente`. Coincide al centavo con la fila 843 que ya está en Compras |
| El mismo comprobante otra vez | «ya estaba cargado: no lo volví a cargar» · 0 claves duplicadas |
| Adjunto ilegible entre buenos | se lo NOMBRA (`ILEGIBLE-ruido.png`) y los demás siguen su camino |
| Lease: trabajo de 60 s con lease de **25 s** | 4 intentos duraron más que su propio lease · **0** tareas en `retrying`/`dead_letter` · todas en 1 intento |
| `comunicacion.outbox` con `dead` | 0 |

El lease se baja a 25 s **a propósito**: con los 180 s de producción una tarea de 40 s pasaría igual
aunque el latido no existiera, y la prueba no probaría nada.

Lo que esta prueba NO cubre, y hay que decirlo: el frame llega por función y no por socket (el bot no
es admin y no puede publicar en nombre de una persona), y la base no es la de producción.

### Lo que NO se lee solo, medido sobre los 7 HEIC reales

Cuatro de siete salieron incompletos y el bot los nombró en vez de inventar: dos con el total fuera
de escala, uno sin proveedor reconocible y uno con un IVA imposible (38% del neto — es un ticket de
combustible donde el renglón que el modelo tomó incluye el impuesto interno). **No es la conversión
HEIC**: leídos los mismos siete papeles en HEIC y en JPG, los importes, el IVA y la fecha salen
IDÉNTICOS en los dos formatos; lo que varía entre corridas es el nombre del proveedor y el número
sobre las fotos más borrosas. La guarda de plausibilidad hace lo que tiene que hacer.

## Estado de verificación al 03/08/2026

Probado contra el **Mattermost vivo** (subida real de un archivo al canal real, descarga real por el
cliente del bot), el **modelo de visión real**, los **desplegables reales del Sheet** y un Postgres
**desechable** con esta migración aplicada. El comprobante es real por sus datos (proveedor, CUIT,
número, fecha e importes de un comprobante de ARCA), renderizado a PDF.

| Tramo | Estado |
|---|---|
| Frame `posted` real del canal → `esRelevante` | ✔ verificado (y arreglado: entraba `false`) |
| Descarga del adjunto desde Mattermost | ✔ verificado |
| Lectura por visión → proveedor/CUIT/tipo/N°/fecha/IVA/total | ✔ verificado, exacto |
| Matcheo contra los desplegables estrictos | ✔ verificado (`Neumagom`, `ARCOR`) |
| Obra ausente → se pregunta, no se inventa | ✔ verificado |
| Botones: sin secreto / secreto inválido → denegado | ✔ verificado |
| Confirmar con freno de mano puesto → `encolado`, no escribe | ✔ verificado |
| Segundo click → no duplica | ✔ verificado |
| Payload final para `Compras` (fila 807) | ✔ verificado con `--dry --json` |
| **Escritura real en la pestaña `Compras`** | ✖ **NO verificado**: el freno de mano está puesto |
| **Migración aplicada en la base de producción** | ✔ aplicada — hay fajos reales en `comunicacion.comprobante_fajos` |
| **Fila en `canales_area` y grant de permiso en producción** | ✔ cargados (`Comprobantes-gastos`→`compras`; grant de `jorge`) |
| **Servicios reiniciados con este código** | ✖ **NO** — producción corre desde el worktree `deploy-comunicacion` (rama `deploy/comunicacion-protegido`), en detached HEAD sobre el commit desplegado. **Mergear a `main` no despliega.** |

### Verificación del arreglo del 03/08 (tarde)

| Tramo | Estado |
|---|---|
| Foto REAL del canal (`file_id` `3zr8mwq…`) leída con la visión real | ✔ verificado, antes y después |
| Obra manuscrita → `MESSINA` sin preguntar | ✔ verificado sobre la foto real |
| Número `0004-00036542` → `0004-00003642` contra ARCA | ✔ verificado contra `public.comprobantes_arca` |
| IVA mal leído (`$10,76`) → `$10.760,33` del libro fiscal | ✔ verificado; coincide al centavo con la fila 802 |
| Duplicado detectado en `Compras` fila 802 | ✔ verificado contra el Sheet vivo (803 filas leídas) |
| Otra factura del mismo proveedor el mismo día NO se marca duplicada | ✔ verificado (la 3366 de $31.533,90, que existe) |
| Anotación ambigua sigue preguntando | ✔ test, rojo al revertir |
| **Botones `duplicado_mismo` / `duplicado_otro` apretados en Mattermost real** | ✖ **NO verificado**: sólo por test |
| **Servicios reiniciados con este arreglo** | ✖ **NO** — hay que mergear `main` en `deploy-comunicacion` y reiniciar `-ws` y `-worker` |

Mientras esas filas sigan en ✖, **el arreglo no está en producción**: el camino está probado, pero el
bot que atiende el canal sigue corriendo el código viejo.

## Reglas que este módulo hace cumplir

- **M (Importe) = Total − IVA.** Lo aplica `valoresInput` del contrato de columnas; acá se garantiza
  que el TOTAL viaje. Sin total, la percepción de IIBB/SUSS queda afuera y el Total del Sheet no
  cierra con la plata que salió.
- **Una nota de crédito entra en NEGATIVO.** El signo se pone al normalizar la lectura.
- **Nunca se escribe en AC/AD/AE/AF/AJ** (ARRAYFORMULA). Lo garantiza el cargador, que no se
  reimplementó: se invoca.
- **Freno de mano.** Si `congelador-sheets.mjs` tiene la marca puesta, el fajo queda `encolado` y el
  bot lo dice. No se reservan claves de una carga que no va a ocurrir.
- **Idempotencia por (CUIT, tipo, número)**, como una columna `clave` TEXT NOT NULL — un unique sobre
  columnas anulables no restringe nada en Postgres, y este repo ya pagó ese defecto.
- **Fusionar, nunca `clearValues`.** El cargador agrega filas al final; no toca nada existente.

## Cuando algo sale mal

| Síntoma | Dónde mirar |
|---|---|
| El bot no contesta a la foto | ¿el canal está en `MM_CANALES_ADJUNTOS`? ¿el post tiene `file_ids`? journal de `-ws` |
| "todavía no está habilitada" | falta la migración |
| "canal de comprobantes del equipo" | falta la fila en `comunicacion.canales_area` |
| "No tenés habilitada la carga" | falta el grant en `comunicacion.permisos_skill` |
| Los botones no hacen nada | falta `COMPROBANTES_ACCION_SECRETO`, o Caddy no publica la ruta |
| "está congelada" | `rm ~/.config/echegaray-orq/SHEETS-CONGELADOS` — decisión del dueño |
| Una reserva sin `fila` en `comprobantes_cargados` | la escritura se cortó a mitad: **revisar Compras** antes de borrarla |

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
                      · lib/comprobantes/vision.mjs → 1 llamada al modelo POR ADJUNTO
                      · matchea proveedor y obra contra los desplegables ESTRICTOS
                      · ¿ya está cargado? → (CUIT, tipo, número)
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
| `ORQ_COMPROBANTES_MODELO` | Modelo de visión | `claude-haiku-4-5-…` |
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
| **Migración aplicada en la base de producción** | ✖ **NO aplicada** (la aplica el dueño, no un agente) |
| **Fila en `canales_area` y grant de permiso en producción** | ✖ **NO cargados** |
| **Ruta `/comprobantes/accion` publicada en Caddy** | ✖ en el repo, **NO recargada** en producción |
| **Servicios reiniciados con este código** | ✖ **NO** — producción sigue en el commit desplegado |

Mientras esas cinco últimas filas sigan en ✖, **la carga por chat no funciona en producción**: el
camino está probado, pero no está encendido.

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

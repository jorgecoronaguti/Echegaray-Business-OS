-- COMPROBANTES DE GASTO POR MATTERMOST — el estado que hace falta y ni una tabla más.
--
-- El dueño manda la foto de una factura al canal `comprobantes-gastos` y el OS la carga en la
-- pestaña "Compras" del Flujo de Fondos. Todo lo que decide QUÉ se escribe ya existe
-- (`lib/carga-comprobantes.mjs` y `scripts/cargar-comprobantes-compras.mjs`) y no se duplica acá.
-- Lo que faltaba es el estado de la CONVERSACIÓN y la garantía de que nada entre dos veces:
--
--   1. `comprobante_fajos`      — la tanda que está esperando Confirmar / Corregir / Descartar.
--   2. `comprobantes_cargados`  — qué comprobante entró, en qué fila, desde qué post. La clave.
--
-- ADITIVA y AISLADA en el schema `comunicacion`, que ya existe. NO toca public.*, NO toca orq.* y
-- no crea una segunda verdad de nada: la verdad del gasto sigue siendo la fila de "Compras" y el
-- comprobante fiscal sigue siendo ARCA. Acá vive únicamente lo que es del canal.
--
-- Sin RLS, igual que el resto del schema `comunicacion`: no está expuesto a PostgREST ni a
-- `anon`/`authenticated`; se accede sólo desde el worker por DATABASE_URL. La autorización la hace
-- el código (canal oficial + grant de permiso), porque del lado del chat no hay `auth.uid()`.
--
-- EL CÓDIGO TIENE QUE ANDAR ANTES Y DESPUÉS DE ESTA MIGRACIÓN. Antes de aplicarla, el especialista
-- de comprobantes detecta que las tablas no están y contesta que la carga por chat todavía no está
-- habilitada, en vez de reventar: el deploy y la migración no siempre caen juntos.

-- ── 1. EL FAJO ───────────────────────────────────────────────────────────────
-- Una tanda de comprobantes que la misma persona mandó al mismo canal en pocos minutos y que se
-- confirma de una sola vez. `items` es el detalle leído; se guarda como jsonb porque su forma es la
-- del comprobante leído, y esa forma la define el contrato de columnas, no esta tabla.
create table if not exists comunicacion.comprobante_fajos (
  id                  uuid primary key default gen_random_uuid(),
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text not null,
  plataforma_username text,
  channel_id          text not null,
  root_post_id        text,                     -- hilo donde vive la conversación del fajo
  aviso_post_id       text,                     -- el post del bot que se reescribe en cada cambio
  post_ids            text[] not null default '{}',   -- todos los posts que aportaron adjuntos
  items               jsonb not null default '[]'::jsonb,
  estado              text not null default 'abierto'
                      check (estado in ('abierto','confirmado','cargado','encolado','descartado','error')),
  filas               jsonb,                    -- qué fila de Compras quedó cada ítem
  error               text,
  creado_at           timestamptz not null default now(),
  ultimo_at           timestamptz not null default now(),
  cerrado_at          timestamptz
);

-- UN SOLO FAJO ABIERTO POR PERSONA Y CANAL. Es lo que hace que el segundo post de la tanda se sume
-- al primero en vez de abrir una confirmación nueva. El índice es PARCIAL sobre `estado='abierto'`:
-- los fajos ya cerrados quedan todos, que para eso es el historial.
create unique index if not exists comprobante_fajos_abierto_idx
  on comunicacion.comprobante_fajos (plataforma, plataforma_user_id, channel_id)
  where estado = 'abierto';

create index if not exists comprobante_fajos_estado_idx
  on comunicacion.comprobante_fajos (estado, ultimo_at desc);

comment on table comunicacion.comprobante_fajos is
  'Tanda de comprobantes fotografiados esperando confirmación en el chat. El unique parcial garantiza UN fajo abierto por persona y canal: por eso varios posts seguidos se agrupan en una sola confirmación en vez de multiplicar mensajes con botones.';

-- ── 2. QUÉ SE CARGÓ, Y LA CLAVE QUE IMPIDE QUE ENTRE DOS VECES ───────────────
--
-- LA CLAVE ES (CUIT emisor, tipo, número) — pero NO como tres columnas anulables.
--
-- En este repo ya vivió un índice único sobre 206 NULLs sin restringir absolutamente nada: en
-- Postgres dos filas con NULL en una columna del unique no colisionan, así que un comprobante sin
-- CUIT habría podido entrar infinitas veces por la puerta que se creía cerrada. Acá la columna
-- `clave` es TEXT NOT NULL, la arma una sola función (`claveComprobante` en lib/comprobantes/
-- lectura.mjs) y lleva prefijo: `c:` cuando salió del CUIT (fuerte) y `p:` cuando hubo que
-- degradar al nombre del proveedor porque el papel no imprime CUIT (débil, y declarado).
--
-- Las columnas sueltas quedan igual, para poder auditar y cruzar contra ARCA sin parsear la clave.
create table if not exists comunicacion.comprobantes_cargados (
  id                  bigint generated always as identity primary key,
  clave               text not null unique,
  cuit                text,
  tipo                text,
  numero              text,
  proveedor           text,
  fecha               date,
  total               numeric(18,2),
  -- TRAZABILIDAD: de qué post de Mattermost salió esta fila. Es lo que permite, meses después,
  -- volver de una fila de Compras a la foto original.
  plataforma          text not null default 'mattermost',
  channel_id          text,
  post_id             text,
  plataforma_user_id  text,
  fajo_id             uuid references comunicacion.comprobante_fajos(id) on delete set null,
  -- DÓNDE QUEDÓ. `fila` es el número de fila de la pestaña "Compras" que se le contestó al dueño.
  -- Es informativo y puede envejecer (si alguien inserta filas arriba), por eso NO es la clave.
  hoja                text default 'Compras',
  fila                int,
  creado_at           timestamptz not null default now()
);

create index if not exists comprobantes_cargados_post_idx
  on comunicacion.comprobantes_cargados (post_id);
create index if not exists comprobantes_cargados_cuit_idx
  on comunicacion.comprobantes_cargados (cuit, numero);

comment on table comunicacion.comprobantes_cargados is
  'Un comprobante entra a "Compras" UNA vez. `clave` es (CUIT|tipo|número) como TEXT NOT NULL a propósito: un unique sobre columnas anulables no restringe nada en Postgres, y este repo ya pagó ese defecto. Guarda además de qué post de Mattermost salió cada fila.';

comment on column comunicacion.comprobantes_cargados.clave is
  'Prefijo c: = armada con el CUIT del emisor (fuerte). Prefijo p: = degradada al nombre normalizado del proveedor porque el comprobante no imprime CUIT (débil, y declarado como tal).';

comment on column comunicacion.comprobantes_cargados.fila is
  'Fila de la pestaña "Compras" al momento de escribir. Informativa: si alguien inserta filas arriba envejece. La identidad del comprobante es `clave`, nunca la fila.';

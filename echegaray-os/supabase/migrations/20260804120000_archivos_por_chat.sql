-- CUALQUIER ARCHIVO POR MATTERMOST — el estado que hace falta y ni una tabla más.
--
-- EL PEDIDO, TEXTUAL: «crea la capacidad de recibir cualquier tipo de archivo de cualquier formato
-- por acá porque es algo que ya hacías bien». El caso que lo destapó: el dueño subió el CSV del
-- extracto bancario al bot, el bot no lo procesó, y el CSV terminó bajándose a mano desde la API.
--
-- QUÉ VIVE ACÁ Y QUÉ NO. Acá vive lo que es del CANAL: qué archivo llegó, de qué post, qué resultó
-- ser, qué se leyó de él y si el dueño autorizó aplicarlo. NO vive el dato: los movimientos
-- bancarios siguen siendo `public.banco_movimientos`, el gasto sigue siendo la fila de "Compras" y
-- el comprobante fiscal sigue siendo ARCA. Una propuesta no es una verdad: es una propuesta.
--
-- ADITIVA y aislada en el schema `comunicacion`, que ya existe. No toca public.*, no toca orq.*.
-- Sin RLS, igual que el resto del schema: no está expuesto a PostgREST; se accede sólo desde el
-- worker por DATABASE_URL, y la autorización la hace el código (canal + permiso).
--
-- EL CÓDIGO ANDA ANTES Y DESPUÉS. `repositorio.tablasListas()` contesta si esto está aplicado; si no
-- lo está, el especialista dice que la recepción de archivos todavía no está habilitada en vez de
-- reventar con un error de Postgres en la cara del dueño. El deploy y la migración no caen juntos.

create table if not exists comunicacion.archivos_recibidos (
  id                  uuid primary key default gen_random_uuid(),
  plataforma          text not null default 'mattermost',
  plataforma_user_id  text,
  plataforma_username text,
  channel_id          text,
  root_post_id        text,
  post_id             text,
  -- LA CLAVE DE IDEMPOTENCIA DEL EFECTO. Un lease vencido y reclamado por otro worker vuelve a
  -- procesar el mismo mensaje; sin esto, el segundo pasaje abriría una segunda propuesta sobre el
  -- mismo extracto y el dueño podría confirmar las dos.
  comm_event_id       text,
  file_id             text not null,
  nombre              text,
  -- QUÉ ES DE VERDAD, no cómo se llama. `formato` sale de los BYTES (ver lib/archivos/deteccion.mjs);
  -- `mime_declarado` es lo que dijo quien lo subió, y se guarda aparte justamente para poder auditar
  -- cuándo los dos no coinciden.
  familia             text,
  formato             text,
  mime_declarado      text,
  tamano              bigint,
  destino             text,
  -- LO QUE SE LEYÓ, sin aplicar. Para un extracto: los movimientos parseados, los rechazos y el
  -- veredicto de la cadena de saldos. Es jsonb porque su forma la define el lector, no esta tabla.
  propuesta           jsonb,
  estado              text not null default 'recibido'
                      check (estado in ('recibido','propuesto','importando','importado','descartado','error')),
  -- QUÉ QUEDÓ DE VERDAD EN EL DESTINO, releído después de escribir. No es el eco del importador.
  resultado           jsonb,
  error               text,
  creado_at           timestamptz not null default now(),
  ultimo_at           timestamptz not null default now(),
  cerrado_at          timestamptz
);

-- UN ARCHIVO DE UN MENSAJE SE PROCESA UNA VEZ. Parcial sobre `comm_event_id not null` porque en
-- Postgres dos filas con NULL en una columna del unique NO colisionan: un índice sobre una columna
-- anulable no restringe nada, y este repo ya pagó ese defecto con un unique viviendo sobre 206 NULLs.
create unique index if not exists archivos_recibidos_evento_idx
  on comunicacion.archivos_recibidos (plataforma, comm_event_id, file_id)
  where comm_event_id is not null;

create index if not exists archivos_recibidos_estado_idx
  on comunicacion.archivos_recibidos (estado, ultimo_at desc);

create index if not exists archivos_recibidos_post_idx
  on comunicacion.archivos_recibidos (post_id);

comment on table comunicacion.archivos_recibidos is
  'Archivos que llegaron por chat: qué eran DE VERDAD (por sus bytes), qué se leyó de ellos y si el dueño autorizó aplicarlos. Una propuesta no es una verdad — el dato sigue viviendo en su fuente (banco_movimientos, la pestaña Compras, ARCA).';

comment on column comunicacion.archivos_recibidos.formato is
  'Detectado por los BYTES, no por el nombre ni por el mime que declaró quien subió el archivo. Un .xls que en realidad es un CSV se guarda acá como csv.';

comment on column comunicacion.archivos_recibidos.resultado is
  'Lo RELEÍDO del destino después de escribir. La evidencia de una escritura es el dato leído en su destino, nunca la respuesta del que escribió.';

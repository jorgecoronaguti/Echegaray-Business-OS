-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL COMPROBANTE DE UNA TRANSFERENCIA — la categoría que faltaba y de dónde salió el archivo
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 09/09/2026, textual: «quiero que ingreses a mi mail de ecsas y descargues todos
-- los comprobantes de transferencias y los coloques en las carpetas correspondientes de cada
-- proveedor».
--
-- `proveedor_documento` (09/09, 12:00) ya es DÓNDE ESTÁ EL ARCHIVO que Administración guardó contra
-- una ficha. Lo que no tenía era: (a) una categoría para el papel que prueba que a ese proveedor se
-- le pagó, y (b) forma de decir que el archivo no lo subió una persona desde la pantalla sino un
-- proceso que leyó el mail. Sin (b), la segunda corrida del importador vuelve a subir todo.
--
-- ═══ POR QUÉ `transferencia` Y NO `otro` ═══
--
-- «Otro» existe y es honesto, pero un comprobante de pago no es un papel suelto: es la evidencia de
-- una salida de plata, se busca por proveedor y por fecha, y es lo que se muestra cuando el
-- proveedor dice que no le pagaron. Metido en «otro» quedaría mezclado con un remito.
--
-- ═══ LA IDEMPOTENCIA ES DE LA BASE, NO DEL SCRIPT ═══
--
-- El origen del archivo (mail + adjunto) es único por definición. Si la unicidad viviera sólo en el
-- código del importador, dos corridas simultáneas —o una corrida y un reintento del timer— dejarían
-- el mismo comprobante dos veces en la ficha. La base se niega.

-- ── 1. LA CATEGORÍA ─────────────────────────────────────────────────────────────────────────────
alter table public.proveedor_documento drop constraint if exists proveedor_documento_categoria_check;
alter table public.proveedor_documento add constraint proveedor_documento_categoria_check
  check (categoria in ('contrato', 'seguro', 'habilitacion', 'factura_modelo', 'transferencia', 'otro'));

-- ── 2. DE DÓNDE SALIÓ EL ARCHIVO ────────────────────────────────────────────────────────────────
-- `web` por defecto: todo lo que ya está lo subió una persona desde la ficha, y esa es la verdad.
alter table public.proveedor_documento
  add column if not exists origen text not null default 'web'
    check (origen in ('web', 'gmail')),
  -- El mail y el adjunto del que salió. Sólo para `origen = 'gmail'`.
  add column if not exists gmail_message_id text,
  add column if not exists gmail_attachment_id text,
  -- LOS TRES DATOS QUE HACEN BUSCABLE UN COMPROBANTE. Se leen del papel; si no se pudieron leer,
  -- quedan en null — un importe inventado sería peor que ninguno.
  add column if not exists comprobante_numero text,
  add column if not exists comprobante_fecha date,
  add column if not exists comprobante_importe numeric(14, 2)
    check (comprobante_importe is null or comprobante_importe > 0);

-- Un archivo de Gmail sin su mail no se puede volver a rastrear ni des-duplicar.
alter table public.proveedor_documento drop constraint if exists proveedor_documento_gmail_completo;
alter table public.proveedor_documento add constraint proveedor_documento_gmail_completo
  check (origen <> 'gmail' or (gmail_message_id is not null and gmail_attachment_id is not null));

-- LA LLAVE DE LA IDEMPOTENCIA. Incluye los dados de baja a propósito: si alguien sacó de la ficha
-- un comprobante que el importador había traído, la corrida siguiente NO se lo vuelve a poner.
create unique index if not exists proveedor_documento_origen_gmail_uidx
  on public.proveedor_documento (gmail_message_id, gmail_attachment_id)
  where origen = 'gmail';

create index if not exists proveedor_documento_transferencias_idx
  on public.proveedor_documento (proveedor_id, comprobante_fecha desc)
  where categoria = 'transferencia' and eliminado_en is null;

comment on column public.proveedor_documento.origen is
  'web = lo subió una persona desde la ficha. gmail = lo trajo orquestador/scripts/gmail-transferencias-proveedores.mjs del buzón del dueño.';
comment on column public.proveedor_documento.gmail_message_id is
  'El mail del que salió el archivo. Con gmail_attachment_id forma la llave única que impide que una segunda corrida duplique el comprobante.';

-- ── 3. PERMISOS ─────────────────────────────────────────────────────────────────────────────────
-- El `grant select` de la tabla ya alcanza a las columnas nuevas. El insert desde la web sigue
-- acotado a las mismas columnas de antes: una persona que sube un contrato no declara de qué mail
-- salió, y `origen` se queda en su default. El importador escribe con service_role, que no pasa por
-- RLS ni por estos grants.
-- Se agrega `categoria` a nada: ya estaba. Sólo cambió su CHECK.

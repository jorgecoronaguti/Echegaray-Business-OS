-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA PANTALLA 24 TAMBIÉN CARGA UN COMPROBANTE — la cola, no un segundo circuito
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Decisión del dueño, 25/08/2026, textual: «la carga de comprobantes se debe hacer de la misma
-- manera que se hace vía bot del OS: cargo archivo multimedia al canal carga de comprobantes y la
-- carga se debe hacer en app ecsas y en sheet flujo de fondos, todo respaldado en BD».
--
-- ═══ POR QUÉ ESTO ES UNA COLA Y NO UNA CARGA ═══
--
-- La app corre en Vercel y NO habla con Google. El circuito que lee un comprobante necesita el
-- modelo de visión, el padrón de ARCA, la pestaña Compras VIVA del Sheet, el extracto bancario y el
-- cargador `scripts/cargar-comprobantes-compras.mjs` corriendo como proceso hijo con el freno de
-- mano puesto. Nada de eso vive —ni puede vivir— en una server action con 10 s de techo.
--
-- Entonces la pantalla hace lo único que le corresponde: deja el archivo en Storage, escribe UNA
-- fila acá, y se queda mirando esa misma fila. El worker de la VM la toma y la procesa con
-- EXACTAMENTE el mismo código que el bot de Mattermost (`comunicacion/comprobantes/circuito.mjs`).
-- No hay dos formas de leer una factura ni dos formas de escribir en Compras: hay dos puertas al
-- mismo pasillo.
--
-- ═══ POR QUÉ VIVE EN `public` Y NO EN `comunicacion` ═══
--
-- El estado del chat (`comunicacion.comprobante_fajos`, `comprobantes_cargados`) no está expuesto a
-- PostgREST a propósito: del lado del chat no hay `auth.uid()` y la autorización la hace el código.
-- Acá sí la hay, y la pantalla tiene que poder LEER el estado de lo que subió. Una tabla en
-- `comunicacion` con un grant a `authenticated` sería exponer todo ese esquema por la ventana.
--
-- Esta tabla NO es una segunda verdad del gasto. La verdad del gasto sigue siendo la fila de la
-- pestaña Compras, el comprobante fiscal sigue siendo ARCA, y el registro de idempotencia sigue
-- siendo `comunicacion.comprobantes_cargados`. Acá vive el ESTADO DE UN ARCHIVO SUBIDO y nada más.

-- ── 1. EL BUCKET ────────────────────────────────────────────────────────────────────────────────
--
-- PRIVADO. Una factura trae CUIT, razón social, importes y a veces la obra del cliente: publicarla
-- a cualquiera que adivine la URL es publicar la cuenta corriente de la empresa.
--
-- Los tipos son EXACTAMENTE los que el circuito sabe mirar (`lib/comprobantes/lectura.mjs`,
-- MEDIA_ACEPTADOS): lo mirable más el HEIC del iPhone, que es el formato por defecto de esa cámara y
-- que el OS convierte antes de leerlo. Un tipo que el bucket acepta y el circuito no sabría leer
-- terminaría en una fila `rechazado` después de haber ocupado espacio y haber hecho esperar.
--
-- 5 MB es el techo del adjunto del circuito (MAX_BYTES_ADJUNTO). Ponerlo más alto acá dejaría subir
-- lo que después se rechaza — el error tiene que llegar cuando la persona todavía tiene el archivo
-- en la mano, no dos minutos después en una fila roja.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprobantes', 'comprobantes', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
              'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La carpeta es el USUARIO que subió: `<auth.uid()>/<uuid>.<ext>`. Así el alcance del archivo es el
-- mismo que el de la fila que lo apunta y no dos criterios que pueden divergir.
drop policy if exists comprobantes_lee_administracion on storage.objects;
create policy comprobantes_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (select public.es_administracion()));

drop policy if exists comprobantes_sube_administracion on storage.objects;
create policy comprobantes_sube_administracion on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (select public.es_administracion())
    -- Y en SU carpeta. Sin esto, cualquiera de Administración podría escribir encima del archivo de
    -- otro y la fila de la cola apuntaría a un comprobante distinto del que se subió.
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ── 2. LA COLA ──────────────────────────────────────────────────────────────────────────────────
create table if not exists public.comprobante_entrada (
  id                uuid primary key default gen_random_uuid(),
  -- De qué puerta entró. Hoy sólo la web; el chat NO pasa por acá (tiene su propio fajo). Existe
  -- para que el día que entre por mail o por WhatsApp no haya que adivinar mirando el path.
  origen            text not null default 'web' check (origen in ('web')),
  -- LA RUTA ES ÚNICA Y ES LA CLAVE DE IDEMPOTENCIA DE ESTA TABLA. Dos filas apuntando al mismo
  -- objeto serían el mismo archivo leído dos veces: no duplicaría el gasto (de eso se ocupa
  -- `comunicacion.comprobantes_cargados`) pero sí gastaría dos veces el modelo de visión y le
  -- mostraría al dueño dos renglones para un solo papel.
  storage_path      text not null unique,
  -- EL LOTE ES «UN GESTO DE CARGA» — el equivalente exacto de un post de Mattermost con cinco fotos.
  -- El circuito agrupa por tanda y escribe UNA vez: cinco facturas subidas juntas tienen que ser un
  -- fajo, no cinco. Sin esto, cada archivo abriría su propia conversación con el Sheet y se perdería
  -- el colapso de la misma factura fotografiada dos veces.
  lote              uuid not null default gen_random_uuid(),
  nombre_archivo    text not null,
  media_type        text not null,
  bytes             bigint not null check (bytes > 0),
  -- Sin `on delete cascade` ni `set default`: borrar una cuenta no puede borrar el rastro de quién
  -- cargó un gasto, ni dejar la columna en NULL contra su propio NOT NULL. Si alguna vez hay que
  -- borrar un usuario con cargas, que la base lo diga en vez de perder la trazabilidad en silencio.
  subido_por        uuid not null default auth.uid() references auth.users(id),
  subido_at         timestamptz not null default now(),

  estado            text not null default 'pendiente'
                    check (estado in ('pendiente','procesando','cargado','ya_estaba','en_espera','rechazado','error')),
  -- Por qué quedó así, en castellano y en la MISMA frase que el bot le diría por chat. Ver
  -- `lib/comprobantes/entrada-web.mjs`.
  motivo            text,
  intentos          smallint not null default 0,
  -- Lo que el circuito entendió y dónde quedó: proveedor, número, total, fila de Compras. Es jsonb
  -- porque su forma la define el contrato de columnas del Sheet, no esta tabla.
  resultado         jsonb,
  -- El fajo del que formó parte, en `comunicacion.comprobante_fajos`. SIN foreign key a propósito:
  -- es otro esquema, con otro dueño y otra política de retención; una FK acoplaría el borrado de la
  -- conversación del chat al historial de la pantalla.
  fajo_id           uuid,
  tomado_at         timestamptz,
  cerrado_at        timestamptz
);

-- El worker toma lo más viejo primero: un comprobante que espera hace diez minutos importa más que
-- el que se acaba de subir.
create index if not exists comprobante_entrada_cola_idx
  on public.comprobante_entrada (estado, subido_at)
  where estado in ('pendiente', 'procesando');

create index if not exists comprobante_entrada_reciente_idx
  on public.comprobante_entrada (subido_at desc);

create index if not exists comprobante_entrada_lote_idx
  on public.comprobante_entrada (lote);

comment on table public.comprobante_entrada is
  'Cola de comprobantes subidos desde la pantalla 24. La app encola; el worker de la VM los procesa con el MISMO circuito que el bot de Mattermost y escribe el estado acá. No es la verdad del gasto: la verdad es la fila de la pestaña Compras y el registro de idempotencia es comunicacion.comprobantes_cargados.';

comment on column public.comprobante_entrada.estado is
  'pendiente/procesando = el worker todavía no terminó · cargado = se escribió una fila en Compras · ya_estaba = el comprobante ya estaba cargado y NO se duplicó · en_espera = leído pero falta una persona (freno de mano, proveedor fuera del desplegable, dato ilegible) · rechazado = terminal, no se reintenta · error = falla técnica, se reintenta hasta 3 veces.';

comment on column public.comprobante_entrada.storage_path is
  'Ruta en el bucket privado `comprobantes`, con el usuario como primera carpeta. UNIQUE: es lo que impide leer dos veces el mismo archivo.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Quién puede subir un comprobante es la misma pregunta que quién ve la pantalla 24:
-- `es_administracion()` — Dirección, Administración y Jefe de Obra desde el 19/08. El jefe de obra
-- compra en la calle y es quien tiene la factura en la mano; dejarlo afuera obligaría a que le mande
-- la foto a alguien para que la suba, que es exactamente el proceso roto que esto reemplaza.
--
-- La puerta del chat es otra (canal oficial + permiso) y sigue siendo otra: son dos preguntas
-- distintas sobre dos medios distintos. Lo que NO cambia es que las dos se hacen y las dos fallan
-- cerradas.
alter table public.comprobante_entrada enable row level security;

-- Los porteros van en `(select …)` para que Postgres los evalúe UNA vez por consulta y no una vez
-- por fila: por fila costaron 64 s en este mismo repo.
drop policy if exists comprobante_entrada_select on public.comprobante_entrada;
create policy comprobante_entrada_select on public.comprobante_entrada
  for select to authenticated using ((select public.es_administracion()));

-- El alta es SÓLO a nombre propio y SÓLO naciendo pendiente. Que alguien pueda insertar una fila ya
-- `cargado` sería poder declarar que un gasto entró al libro sin que nada lo haya escrito.
drop policy if exists comprobante_entrada_insert on public.comprobante_entrada;
create policy comprobante_entrada_insert on public.comprobante_entrada
  for insert to authenticated
  with check (
    (select public.es_administracion())
    and subido_por = (select auth.uid())
    and estado = 'pendiente'
    and intentos = 0
    and origen = 'web'
  );

-- NO HAY POLICY DE UPDATE NI DE DELETE, y es la decisión que sostiene todo lo demás: el estado de
-- una carga lo escribe el worker por DATABASE_URL (que no pasa por RLS). Si `authenticated` pudiera
-- actualizar esta tabla, cualquiera podría marcar `cargado` un comprobante que nunca se escribió, y
-- la pantalla estaría leyendo una afirmación en vez de un hecho.

-- Una columna nueva NACE SIN PERMISO: el grant es por columna y no se hereda. Sin esto el insert
-- rebota con «permission denied for table comprobante_entrada» y Next lo muestra como un 404.
grant select on public.comprobante_entrada to authenticated;
grant insert (origen, storage_path, lote, nombre_archivo, media_type, bytes, subido_por, estado, intentos)
  on public.comprobante_entrada to authenticated;

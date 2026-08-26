-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS PAPELES DEL CLIENTE VIVEN EN EL OS — el espejo de Drive que el portal sí puede leer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ POR QUÉ EL PORTAL NO PUEDE LEER DRIVE EN VIVO ═══
--
-- `/portal/documentos` leía la carpeta de Drive en cada carga con la cuenta de servicio. Esa
-- credencial es un archivo en el disco de la VM (`scripts/google_workspace/credentials/`), y el
-- portal corre en Vercel, donde NO HAY DISCO. Resultado verificado en producción el 26/08/2026:
-- «No pudimos leer la carpeta ahora» para los cinco clientes, y cero enlaces de descarga.
--
-- Poner la credencial en una variable de entorno resuelve el síntoma pero deja el problema de fondo:
-- la pantalla del cliente dependería de que Google conteste en cada carga. Acá se invierte: un
-- proceso de la VM —donde la credencial SÍ existe— baja los papeles y los deja en Storage, y el
-- portal sirve desde ahí. El portal deja de necesitar Google para mostrar y para descargar.
--
-- ═══ ESTA TABLA NO ES LA VERDAD DEL DOCUMENTO ═══
--
-- La verdad sigue siendo el archivo en Drive: ahí lo edita administración y ahí lo versiona el
-- estudio. Acá vive la COPIA PUBLICADA con su procedencia (`drive_file_id`) para poder rehacerla, y
-- lo único genuinamente nuevo: `visible_portal`, que en Drive no existe porque Drive no tiene portal.

create table if not exists public.documento_cliente (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references public.clientes(id) on delete restrict,
  -- `obra_canonica` y no `public.obras`: es el registro que tiene las carpetas de Drive (11 de 16
  -- obras las tienen; en `public.obras` sólo 3 de 10) y es el que `cliente_acceso.obras` nombra —
  -- el alcance de un acceso se puede aplicar exacto, sin mapeos inventados entre dos registros.
  -- NULL = el papel cuelga de la carpeta del CLIENTE, no de una obra. Es un estado real.
  obra_id        text references public.obra_canonica(id) on delete set null,
  titulo         text not null,
  categoria      text not null check (categoria in (
                   'cotizacion', 'contrato', 'plano', 'certificado', 'factura', 'recibo', 'otro')),
  -- Sólo para planos, y sólo si el nombre la trae. Ver `revisionDe` en src/app/portal/documentos.ts:
  -- NUNCA se rellena con «rev 1», que sería inventar el estado de un documento técnico.
  disciplina     text check (disciplina in (
                   'arquitectura', 'estructura', 'sanitaria_electrica', 'terminaciones', 'otra')),
  revision       text,
  -- NULL = nadie las contó. No es 0: un plano de cero hojas no existe.
  hojas          integer check (hojas is null or hojas > 0),
  fecha          date,

  -- ── DE DÓNDE SALIÓ Y DÓNDE QUEDÓ ──────────────────────────────────────────────────────────────
  drive_file_id  text not null,
  storage_path   text not null,
  mime           text,
  bytes          bigint check (bytes is null or bytes >= 0),

  -- ── LO ÚNICO QUE DRIVE NO SABE ────────────────────────────────────────────────────────────────
  --
  -- El default es `true` porque una fila que llega acá ya pasó por el filtro del espejo. Pero el
  -- espejo escribe `false` en todo lo que NO reconoce como papel del cliente: la carpeta de la obra
  -- tiene «COMPUTO.xlsx», «Gastos - <cliente>.pdf» y «POSIBLES ADICIONALES.xlsm», y publicarle a un
  -- cliente el cómputo con el que se le cotizó es un daño económico que no se deshace.
  visible_portal boolean not null default true,

  origen         text not null default 'espejo_drive' check (origen in ('espejo_drive', 'os')),
  sincronizado_en timestamptz,
  creado_at      timestamptz not null default now(),
  actualizado_at timestamptz not null default now()
);

-- IDEMPOTENCIA. Un archivo de Drive produce como máximo UNA fila POR ÁMBITO: la segunda corrida del
-- espejo actualiza, no duplica. Sin esto, el timer multiplicaría los papeles del cliente por la
-- cantidad de veces que corrió.
--
-- La obra entra en la clave porque DOS OBRAS COMPARTEN CARPETA en el Drive real: «BSA - Planta» y
-- «BSA - Adicional» apuntan las dos a 1Xj0FBTek5Zy…. Con la clave sólo en `drive_file_id`, la
-- segunda obra se quedaría sin ni un papel y nadie sabría por qué.
--
-- Va `coalesce` y no la columna pelada porque `obra_id` acepta NULL, y un índice único sobre
-- columnas que aceptan NULL NO RESTRINGE NADA: en esta base ya convivió con 206 NULLs sin quejarse.
create unique index if not exists documento_cliente_ambito_drive_file_idx
  on public.documento_cliente (coalesce(obra_id, '_cliente'), drive_file_id);

create index if not exists documento_cliente_por_cliente_idx
  on public.documento_cliente (cliente_id, obra_id, categoria);

comment on table public.documento_cliente is
  'Espejo en el OS de los papeles del cliente que viven en Drive. NO es la verdad del documento '
  '(esa es el archivo en Drive): es la copia publicada, con drive_file_id como procedencia y '
  'visible_portal como lo único que Drive no sabe. La llena orquestador/scripts/documentos-espejo.mjs.';
comment on column public.documento_cliente.visible_portal is
  'false = espejado pero NO se le muestra al cliente. Es el estado por defecto de todo lo que el '
  'espejo no reconoce como papel del cliente (cómputos, gastos internos, presupuestos .xlsm).';
comment on column public.documento_cliente.obra_id is
  'NULL = el papel cuelga de la carpeta del cliente, no de una obra. Estado real, no dato faltante.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CUÁNDO CORRIÓ EL ESPEJO — para que «no hay papeles» y «todavía no miramos» no se vean igual
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Sin esta tabla, una obra sin filas en `documento_cliente` es indistinguible de una obra cuya
-- carpeta el espejo nunca abrió. La pantalla escribiría «sin documentos» sobre una carpeta llena.
create table if not exists public.documento_espejo_corrida (
  -- 'obra:<obra_canonica.id>' o 'cliente:<clientes.id>'. Texto y no dos FK porque la corrida es del
  -- ÁMBITO recorrido —una carpeta de Drive—, y las dos clases de carpeta se consultan igual.
  ambito         text primary key,
  carpeta_drive  text,
  corrida_at     timestamptz not null default now(),
  documentos     integer not null default 0,
  publicados     integer not null default 0,
  -- NULL = la corrida terminó bien. Con texto, la pantalla dice que lo último que intentó falló en
  -- vez de mostrar el espejo viejo como si fuera de hoy.
  error          text
);

comment on table public.documento_espejo_corrida is
  'Constancia de la última pasada del espejo por cada carpeta. Existe para que la pantalla pueda '
  'distinguir «la carpeta no tiene papeles» de «todavía no la miramos»: sin esto las dos se ven igual.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table public.documento_cliente        enable row level security;
alter table public.documento_espejo_corrida enable row level security;

-- El cliente ve los papeles de SU cliente_id, sólo si su acceso habilita la obra, y sólo los
-- visibles. Las tres condiciones viven acá adentro —no en el service— porque son restricciones de
-- FILA: un acceso con `obras = {quattropani}` no lee el contrato de otra obra ni pegándole a
-- PostgREST directo. Es el mismo molde que `certificado_cliente`.
drop policy if exists documento_cliente_select on public.documento_cliente;
create policy documento_cliente_select on public.documento_cliente
  for select to authenticated
  using (
    (select public.es_administracion())
    or (
      (select public.es_cliente())
      and visible_portal
      and cliente_id = (select public.cliente_de_sesion())
      and exists (
        select 1 from public.cliente_acceso a
         where a.auth_user_id = (select auth.uid())
           and a.revocado_at is null
           and a.puede_ver_obra
           -- obras NULL = todas. Un papel del cliente sin obra (obra_id null) sólo lo alcanza quien
           -- alcanza TODAS: con el acceso acotado no hay forma de afirmar que le corresponda.
           and (a.obras is null or (obra_id is not null and obra_id = any (a.obras)))
      )
    )
  );

drop policy if exists documento_cliente_escribe on public.documento_cliente;
create policy documento_cliente_escribe on public.documento_cliente
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- La constancia de corrida no dice nada de nadie: es operación. Sólo administración.
drop policy if exists documento_espejo_corrida_admin on public.documento_espejo_corrida;
create policy documento_espejo_corrida_admin on public.documento_espejo_corrida
  for all to authenticated
  using ((select public.es_administracion()))
  with check ((select public.es_administracion()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA COLUMNA NUEVA NACE SIN PERMISO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Una policy NO es un GRANT. Sin GRANT, PostgREST devuelve «permission denied» y Next lo muestra
-- como un 404 o —peor— como una lista vacía sin error, sin log y sin nada. Se otorga POR COLUMNA
-- para que el día que alguien agregue una columna a esta tabla quede fuera de la lista y se note.
grant select (
  id, cliente_id, obra_id, titulo, categoria, disciplina, revision, hojas, fecha,
  drive_file_id, storage_path, mime, bytes, visible_portal, origen,
  sincronizado_en, creado_at, actualizado_at
) on public.documento_cliente to authenticated;

grant insert (
  cliente_id, obra_id, titulo, categoria, disciplina, revision, hojas, fecha,
  drive_file_id, storage_path, mime, bytes, visible_portal, origen, sincronizado_en
) on public.documento_cliente to authenticated;

-- Administración corrige el título y esconde/publica un papel desde la ficha. No toca la
-- procedencia (`drive_file_id`, `storage_path`): eso lo escribe el espejo y sólo el espejo.
grant update (
  titulo, categoria, disciplina, revision, hojas, fecha, visible_portal
) on public.documento_cliente to authenticated;

grant delete on public.documento_cliente to authenticated;

grant select (ambito, carpeta_drive, corrida_at, documentos, publicados, error)
  on public.documento_espejo_corrida to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL BUCKET — PRIVADO. Son papeles de clientes.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Público sería publicar el contrato de obra de Quattropani en una URL que adivina cualquiera. El
-- portal sirve por URL firmada de vida corta, generada en el servidor DESPUÉS de comprobar la cookie
-- del portal y el alcance del acceso.
insert into storage.buckets (id, name, public)
values ('documentos-cliente', 'documentos-cliente', false)
on conflict (id) do nothing;

-- Nadie lee este bucket con una sesión de Supabase. El cliente del portal no tiene usuario de Auth
-- —entra con cookie firmada— y el servidor firma con la clave de servicio, que saltea RLS. La única
-- policy es para administración, que sí tiene sesión y necesita poder abrir el papel desde la ficha.
drop policy if exists documentos_cliente_lee_administracion on storage.objects;
create policy documentos_cliente_lee_administracion on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-cliente' and (select public.es_administracion()));

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE SUBE EL CLIENTE TAMBIÉN HABLA DE `obra_canonica`
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_adjunto_cliente.obra_id` apunta a `public.obras`, que es el registro que la pantalla de
-- Documentos dejó de usar: sus obras casi no tienen carpeta de Drive y sus ids no son los que
-- `cliente_acceso.obras` nombra. Si la pantalla pasa a `obra_canonica` y el adjunto no, el botón
-- «Adjuntar» sólo aparecería en 3 de 16 obras.
--
-- Se agrega la columna canónica y se afloja el NOT NULL de la vieja. Es seguro: la tabla tiene CERO
-- filas y un único escritor (la server action de la pantalla), que se actualiza en este mismo
-- commit. El CHECK impide el estado que no significa nada: un adjunto sin obra.
alter table public.obra_adjunto_cliente
  add column if not exists obra_canonica_id text references public.obra_canonica(id) on delete cascade;

alter table public.obra_adjunto_cliente alter column obra_id drop not null;

alter table public.obra_adjunto_cliente drop constraint if exists obra_adjunto_cliente_tiene_obra;
alter table public.obra_adjunto_cliente add constraint obra_adjunto_cliente_tiene_obra
  check (obra_id is not null or obra_canonica_id is not null);

create index if not exists obra_adjunto_cliente_por_obra_canonica
  on public.obra_adjunto_cliente (obra_canonica_id, created_at desc);

comment on column public.obra_adjunto_cliente.obra_canonica_id is
  'La obra en el registro canónico — el que la pantalla de Documentos usa y el que cliente_acceso.obras '
  'nombra. obra_id (public.obras) queda para las filas viejas; no existe mapeo entre los dos registros.';

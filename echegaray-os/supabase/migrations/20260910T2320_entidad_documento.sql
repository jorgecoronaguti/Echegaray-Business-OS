-- ============================================================================
-- LA APP RECIBE DOCUMENTOS EN LAS CUATRO FICHAS, Y LO QUE RECIBE VIAJA A DRIVE.
--
-- El dueño, 10/09/2026: «te había pedido formas de subir documentos a las distintas secciones que
-- permitan acopio de datos en la plataforma app.ecsas.com.ar y no está hecho».
--
-- El proveedor ya podía desde el 09/09 (`proveedor_documento` + bucket `proveedores-documentos`).
-- La obra, el cliente y la persona no tenían dónde poner la fila: `obra_documento` guarda un VÍNCULO
-- a un archivo que ya está en Drive, `documento_cliente` lo escribe el espejo que BAJA de Drive, y
-- `documento_presentacion` es un circuito de aprobación de otra cosa. Ninguna de las tres es «un
-- papel que alguien subió desde la ficha».
--
-- ═══ UNA TABLA PARA LAS CUATRO, Y NO CUATRO TABLAS ═══
--
-- Tres tablas nuevas con las mismas nueve columnas serían tres lugares donde arreglar el mismo
-- defecto, tres RLS que se desincronizan y tres consumidores que el puente a Drive tendría que
-- barrer por separado. El eje que cambia es UN dato (`entidad_tipo`), no la forma de la fila.
--
-- `proveedor_documento` NO se migra acá: tiene 7 filas vivas, su ficha, su bucket y sus acciones
-- funcionando desde ayer. Unificarla es trabajo del H6 del puente, con su propio movimiento de
-- datos. Que convivan un tiempo está declarado; que nadie sepa cuál mira, no.
--
-- ═══ NINGÚN BUCKET NUEVO ═══
--
-- El PRP del puente lo prohíbe. Cada entidad guarda en el bucket privado que ya existía:
-- obra → `obras-documentos` · cliente → `documentos-cliente` · persona → `documentos-legajo` ·
-- proveedor → `proveedores-documentos`. Lo único que se toca de ellos es el techo de tamaño y la
-- lista de tipos del de legajo, que estaban por debajo de lo que el dueño pidió.
--
-- ═══ LA COLA A DRIVE ES UNA COLUMNA, NO UNA TABLA ═══
--
-- `drive_estado='pendiente'` ES la cola. Una tabla de cola aparte obligaría a mantener dos filas por
-- documento en dos tablas y a resolver qué pasa cuando una existe y la otra no. El consumidor (H3
-- del puente) barre `pendiente`, sube a Drive, compara el md5 en el destino y recién ahí escribe
-- `copiado`. Hasta que ese consumidor exista, las filas se acumulan en `pendiente` — que es una cola
-- sin consumidor, no un dato perdido: el archivo está en el bucket y la ficha lo lista.
-- ============================================================================

create table if not exists public.entidad_documento (
  id                uuid primary key default gen_random_uuid(),

  -- DE QUIÉN ES EL PAPEL. `entidad_id` es TEXT y no uuid porque `obra_canonica.id` es un slug
  -- (`messina-bsa`) y las otras tres son uuid. Una columna uuid dejaría afuera justamente a la
  -- ficha que más papeles recibe.
  entidad_tipo      text not null check (entidad_tipo in ('obra','cliente','proveedor','persona')),
  entidad_id        text not null check (length(btrim(entidad_id)) > 0),

  -- DÓNDE ESTÁ EL ARCHIVO. El bucket se guarda en la fila y no se deduce del tipo: el día que una
  -- entidad cambie de bucket, las filas viejas tienen que seguir sabiendo dónde está su archivo.
  bucket            text not null check (bucket in ('obras-documentos','documentos-cliente','documentos-legajo','proveedores-documentos')),
  storage_path      text not null unique,

  nombre_archivo    text not null check (length(btrim(nombre_archivo)) between 1 and 255),
  tipo_mime         text not null,
  tamano_bytes      bigint not null check (tamano_bytes > 0 and tamano_bytes <= 26214400),

  -- LA HUELLA DE CONTENIDO. Nace NULL a propósito: el archivo va del navegador al bucket sin pasar
  -- por el servidor (25 MB no entran en una Server Action) y el navegador no sabe calcular md5 —
  -- SubtleCrypto no lo implementa—. Lo escribe el consumidor cuando baja el objeto para subirlo a
  -- Drive, que es el único momento en que los bytes pasan por Node. Por eso el índice de abajo es
  -- PARCIAL: un único sobre una columna que acepta NULL no restringe nada, y eso ya vivió sobre 206
  -- NULLs en este repo sin quejarse una vez.
  md5               text,

  -- PARA QUÉ SIRVE, y NO es una lista libre: las cuatro listas las dictó el dueño y no se mezclan.
  -- El CHECK compuesto es la única forma de que un «plano» no termine colgado de un proveedor: la
  -- validación de la app puede caerse en un refactor, la de la base no.
  categoria         text not null,
  descripcion       text check (descripcion is null or length(descripcion) <= 400),

  subido_por        uuid not null references auth.users(id),
  creado_en         timestamptz not null default now(),
  eliminado_en      timestamptz,
  eliminado_por     uuid references auth.users(id),

  -- ── LA COLA A DRIVE ──
  drive_estado      text not null default 'pendiente'
                      check (drive_estado in ('pendiente','copiado','error','sin_carpeta')),
  drive_file_id     text,
  drive_error       text,
  drive_intentos    integer not null default 0,
  drive_visto_en    timestamptz,

  constraint entidad_documento_categoria_del_tipo check (
    (entidad_tipo = 'obra'      and categoria in ('plano','certificado','acta','foto','otro')) or
    (entidad_tipo = 'cliente'   and categoria in ('factura','orden_compra','orden_pago','contrato','otro')) or
    (entidad_tipo = 'proveedor' and categoria in ('factura','remito','presupuesto','otro')) or
    (entidad_tipo = 'persona'   and categoria in ('dni','alta_arca','libreta_ieric','constancia','otro'))
  )
);

-- La ficha pide «los papeles de ESTA entidad, los no borrados, del más nuevo al más viejo».
create index if not exists entidad_documento_entidad_idx
  on public.entidad_documento (entidad_tipo, entidad_id, creado_en desc)
  where eliminado_en is null;

-- El consumidor pide «lo que falta copiar». Parcial: la cola son unas pocas filas contra una tabla
-- que va a crecer con cada papel de cada obra.
create index if not exists entidad_documento_cola_drive_idx
  on public.entidad_documento (creado_en)
  where drive_estado = 'pendiente' and eliminado_en is null;

-- IDEMPOTENCIA POR CONTENIDO. El mismo archivo subido dos veces a la misma entidad es una sola cosa.
-- Parcial por el NULL de arriba, y por `entidad` y no global: el mismo plano puede pertenecer de
-- verdad a dos obras.
create unique index if not exists entidad_documento_md5_por_entidad_idx
  on public.entidad_documento (entidad_tipo, entidad_id, md5)
  where md5 is not null and eliminado_en is null;

comment on table public.entidad_documento is
  'Los documentos que alguien SUBE desde la ficha de una obra, un cliente, un proveedor o una persona. El archivo vive en un bucket privado; esta fila dice de quién es y en qué estado está su copia a Drive. Distinta de obra_documento/cliente_documento, que son VÍNCULOS a un archivo que ya estaba en Drive.';
comment on column public.entidad_documento.drive_estado is
  'La cola del puente app→Drive. `pendiente` = falta copiar. El consumidor compara el md5 en el destino ANTES de marcar `copiado`: sin esa comparación, «copiado» sería la pantalla que respondió que sí, no el efecto.';
comment on column public.entidad_documento.md5 is
  'Huella de contenido. Nace NULL: el archivo no pasa por el servidor (25 MB no entran en una Server Action). La escribe el consumidor cuando baja el objeto.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.entidad_documento enable row level security;

-- QUIÉN LEE. El eje es el mismo que ya gobierna cada ficha, para que nadie tenga que aprender un
-- segundo modelo de permisos: la obra por `ve_obra()` —que incluye al jefe de obra y a quien está
-- asignado—, el resto por `es_administracion()`, y la persona además ve LO SUYO.
create policy entidad_documento_select on public.entidad_documento
  for select to authenticated
  using (
    eliminado_en is null and (
      (entidad_tipo = 'obra' and public.ve_obra(entidad_id))
      or ((select public.es_administracion()) and entidad_tipo in ('cliente','proveedor','persona'))
      or (entidad_tipo = 'persona' and public.mi_persona_id() is not null
          and entidad_id = (public.mi_persona_id())::text)
    )
  );

-- QUIÉN SUBE. Administración y jefe de obra —`es_administracion()` los incluye a los dos desde la
-- decisión del 19/08— y, para una obra, sólo las suyas.
--
-- EL PORTAL DEL CLIENTE NO SUBE, y no hace falta nombrarlo: su rol no es administración y ninguna de
-- las dos ramas lo alcanza. Nombrarlo sería inventar una excepción que el día que cambie el modelo
-- de roles nadie va a acordarse de revisar.
--
-- `subido_por = auth.uid()` y la ruta que empieza con el uid: las dos mitades de la misma cerradura
-- que ya usa `proveedor_documento`. Sin la segunda, esta tabla sería un ariete para colgar el papel
-- de una obra dentro de otra ficha.
create policy entidad_documento_insert on public.entidad_documento
  for insert to authenticated
  with check (
    subido_por = (select auth.uid())
    and storage_path like ((select auth.uid())::text || '/' || entidad_tipo || '/' || entidad_id || '/%')
    and (select public.es_administracion())
    and (entidad_tipo <> 'obra' or public.ve_obra(entidad_id))
  );

-- El consumidor del puente y los scripts del orquestador. La app NO actualiza ni borra: el borrado
-- lógico no está pedido y una policy de update abierta sería la puerta para pisar `drive_estado`
-- desde el navegador y dar por copiado lo que nunca se copió.
create policy entidad_documento_srv on public.entidad_documento
  for all to service_role using (true) with check (true);

-- ── GRANTS ──────────────────────────────────────────────────────────────────
-- POLICY SIN GRANT ES «PERMISSION DENIED». Ya se pagó en este repo.
grant select, insert on public.entidad_documento to authenticated;
grant select, insert, update, delete on public.entidad_documento to service_role;

-- ── STORAGE ─────────────────────────────────────────────────────────────────
-- Los tres buckets que faltaban poder RECIBIR. `proveedores-documentos` ya tiene las suyas del
-- 09/09 y no se tocan.
--
-- La primera carpeta del objeto es el uid de quien sube: es lo que ata el objeto a su fila, porque
-- la policy de la tabla exige el mismo prefijo. Storage no sabe de obras ni de personas.

create policy obras_documentos_sube_administracion on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'obras-documentos'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy documentos_cliente_sube_administracion on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-cliente'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- El legajo YA tenía una policy de subida, pero exige que la primera carpeta sea `mi_persona_id()`:
-- sirve para que alguien suba SU documento, no para que Administración cargue el DNI de otro. Se
-- agrega la segunda, sin tocar la primera.
create policy documentos_legajo_sube_administracion on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos-legajo'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Y poder LEER lo que se subió. `obras-documentos` y `documentos-cliente` sólo abrían a
-- administración; para la obra se agrega el jefe de obra por el mismo predicado de la ficha.
create policy obras_documentos_lee_quien_ve_la_obra on storage.objects
  for select to authenticated
  using (
    bucket_id = 'obras-documentos'
    and exists (
      select 1 from public.entidad_documento d
       where d.bucket = 'obras-documentos' and d.storage_path = storage.objects.name
         and d.entidad_tipo = 'obra' and public.ve_obra(d.entidad_id)
    )
  );

-- ── LOS TECHOS DEL BUCKET DE LEGAJO ─────────────────────────────────────────
-- Estaba en 10 MB y con cinco tipos de imagen: un PDF de 12 MB de una libreta escaneada rebotaba en
-- Storage y una planilla no entraba nunca. Se sube al techo que la app anuncia (25 MB) y se agregan
-- los tipos que el dueño nombró. Es un aumento de capacidad, no un permiso nuevo: quién puede subir
-- lo siguen decidiendo las policies de arriba.
update storage.buckets
   set file_size_limit = 26214400,
       allowed_mime_types = array[
         'image/jpeg','image/png','image/webp','image/heic','image/gif','application/pdf',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword',
         'text/csv','text/plain','application/octet-stream'
       ]
 where id = 'documentos-legajo';

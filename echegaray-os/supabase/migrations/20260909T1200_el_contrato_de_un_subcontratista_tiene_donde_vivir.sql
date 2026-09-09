-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LOS DOCUMENTOS DE UN PROVEEDOR — el contrato del subcontratista deja de vivir en un chat
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 09/09/2026, textual: «permitime cargarle documentos a los proveedores como los
-- contratos de subcontratistas o demás contenido audiovisual o PDF o Word o lo que sea que necesite
-- cargar en app.ecsas.com.ar».
--
-- ═══ QUÉ ES ESTO Y QUÉ NO ES ═══
--
-- `proveedor_papel` (vista, 06/09) publica los COMPROBANTES que ya cuelgan de una compra: se
-- DERIVAN del gasto y nadie los sube desde la ficha. Esto es lo otro: el papel que define la
-- relación con el proveedor —contrato, póliza, habilitación, un video de una entrega— que hoy no
-- tiene ningún lugar en el OS y vive en un chat o en Drive sin vínculo. Son dos conceptos y por eso
-- son dos objetos: fusionarlos haría que dar de baja un contrato pareciera borrar una factura.
--
-- Esta tabla NO es la verdad del gasto ni el comprobante fiscal. Es DÓNDE ESTÁ EL ARCHIVO que
-- alguien de Administración decidió guardar contra esta ficha, y quién lo puso.
--
-- ═══ EL BUCKET NO FILTRA POR TIPO, A PROPÓSITO ═══
--
-- `comprobantes` sí lo hace, porque ahí un tipo que el circuito no sabe leer termina en una fila
-- rechazada después de haber hecho esperar. Acá no hay circuito que lea: el archivo se guarda y se
-- baja. Una lista blanca dejaría afuera justo lo que el dueño nombró («lo que sea que necesite
-- cargar»), y el modo de falla sería el peor: el contrato firmado rebotando en la puerta sin que
-- nadie sepa por qué. El precio se paga del otro lado —la bajada se firma con `download`, así que
-- el objeto nunca se renderiza en el origen de Storage— y el bucket sigue siendo PRIVADO.
--
-- 50 MB es el techo por archivo. Alcanza para un contrato escaneado o un video corto de obra; una
-- filmación larga necesita otra decisión (Drive), no un número más grande acá.

-- ── 1. EL BUCKET ────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proveedores-documentos', 'proveedores-documentos', false, 52428800, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- LA RUTA ES `<uid>/<proveedor_id>/<uuid>.<ext>` y las dos primeras carpetas son parte de la
-- cerradura, no una convención de orden:
--   · la 1ª (uid) impide escribir encima del archivo de otra persona,
--   · la 2ª (proveedor) es lo que la policy de la TABLA cruza contra `proveedor_id`, así que una
--     fila no puede declarar el contrato de un proveedor apuntando al archivo de otro.
drop policy if exists proveedores_documentos_lee_administracion on storage.objects;
create policy proveedores_documentos_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'proveedores-documentos' and (select public.es_administracion()));

drop policy if exists proveedores_documentos_sube_administracion on storage.objects;
create policy proveedores_documentos_sube_administracion on storage.objects for insert to authenticated
  with check (
    bucket_id = 'proveedores-documentos'
    and (select public.es_administracion())
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- NO HAY POLICY DE UPDATE NI DE DELETE. El objeto es inmutable: la baja es LÓGICA (`eliminado_en`)
-- y los bytes quedan. Es la misma elección que ya hizo `comprobantes` —basura antes que mentira—:
-- un delete abierto a `authenticated` convertiría un error de clic en la desaparición de la única
-- copia de un contrato firmado, sin rastro de quién lo hizo.

-- ── 2. LA TABLA ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.proveedor_documento (
  id                uuid primary key default gen_random_uuid(),

  -- SIN `on delete cascade` a propósito: si alguna vez se borra un proveedor con contratos, la base
  -- tiene que negarse en vez de llevarse la evidencia. La baja de un proveedor en este OS es
  -- `activo = false`, no un delete.
  proveedor_id      uuid not null references public.proveedores(id),

  -- LA RUTA ES LA IDENTIDAD DEL OBJETO Y ES ÚNICA: dos filas sobre el mismo archivo serían el mismo
  -- contrato listado dos veces, y dar de baja una dejaría la otra viva.
  storage_path      text not null unique,
  nombre_archivo    text not null check (length(btrim(nombre_archivo)) between 1 and 255),
  tipo_mime         text not null check (length(tipo_mime) between 3 and 255),
  -- El techo es el del bucket. Una fila no puede declarar un tamaño que el bucket no habría dejado
  -- entrar: sería un dato que contradice al objeto que dice describir.
  tamano_bytes      bigint not null check (tamano_bytes > 0 and tamano_bytes <= 52428800),

  -- PARA QUÉ SIRVE EL PAPEL. `otro` existe y es honesto: obligar a encasillar un remito en
  -- «contrato» haría que la categoría dejara de significar algo. Sin default: quien sube elige.
  categoria         text not null
                    check (categoria in ('contrato', 'seguro', 'habilitacion', 'factura_modelo', 'otro')),
  descripcion       text check (descripcion is null or length(descripcion) <= 400),

  -- Sin `on delete cascade`: borrar una cuenta no puede borrar el rastro de quién guardó un papel.
  subido_por        uuid not null default auth.uid() references auth.users(id),
  creado_en         timestamptz not null default now(),

  -- BAJA LÓGICA. `eliminado_en` null = vigente. El archivo sigue en el bucket y la fila sigue
  -- diciendo quién lo dio de baja y cuándo: un contrato que desaparece sin dejar quién lo sacó es
  -- exactamente el agujero que este registro existe para tapar.
  eliminado_en      timestamptz,
  eliminado_por     uuid references auth.users(id),
  check ((eliminado_en is null) = (eliminado_por is null))
);

-- La ficha pide exactamente esto: los vigentes de un proveedor, el último arriba.
create index if not exists proveedor_documento_vigentes_idx
  on public.proveedor_documento (proveedor_id, creado_en desc)
  where eliminado_en is null;

comment on table public.proveedor_documento is
  'Los papeles que se guardan CONTRA la ficha de un proveedor: contrato de subcontrato, póliza, habilitación, audiovisual. No confundir con la vista proveedor_papel, que DERIVA los comprobantes de sus compras.';
comment on column public.proveedor_documento.storage_path is
  'Ruta en el bucket privado `proveedores-documentos`: <uid>/<proveedor_id>/<uuid>.<ext>. Las dos primeras carpetas son parte de la cerradura, no orden.';
comment on column public.proveedor_documento.eliminado_en is
  'Baja LÓGICA. El objeto del bucket no se borra: la fila deja quién lo dio de baja y cuándo.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Quién puede ver y guardar el contrato de un subcontratista es la misma pregunta que quién ve la
-- ficha del proveedor: `es_administracion()` — Dirección, Administración y jefe de obra (decisión
-- del dueño del 19/08: el jefe de obra ES Administración, y es quien tiene al subcontratista
-- adelante en la obra). Los porteros van en `(select …)` para que Postgres los evalúe una vez por
-- consulta y no una por fila.
alter table public.proveedor_documento enable row level security;

drop policy if exists proveedor_documento_select on public.proveedor_documento;
create policy proveedor_documento_select on public.proveedor_documento
  for select to authenticated using ((select public.es_administracion()));

-- EL ALTA ES A NOMBRE PROPIO, VIVA, Y SOBRE UN OBJETO PROPIO DE ESE PROVEEDOR. El `like` no es
-- cosmética: sin él, alguien podría registrar como contrato de un proveedor cualquier objeto del
-- bucket —incluido el de otro proveedor— y la ficha lo mostraría como suyo.
drop policy if exists proveedor_documento_insert on public.proveedor_documento;
create policy proveedor_documento_insert on public.proveedor_documento
  for insert to authenticated
  with check (
    (select public.es_administracion())
    and subido_por = (select auth.uid())
    and eliminado_en is null
    and storage_path like ((select auth.uid()::text) || '/' || proveedor_id::text || '/%')
  );

-- EL ÚNICO UPDATE POSIBLE ES DAR DE BAJA, Y QUEDA FIRMADO. El `using` exige que la fila esté viva:
-- una baja no se revierte desde la web (resucitar un papel que alguien dio de baja es una decisión,
-- no un clic) ni se vuelve a firmar a nombre de otro.
drop policy if exists proveedor_documento_baja on public.proveedor_documento;
create policy proveedor_documento_baja on public.proveedor_documento
  for update to authenticated
  using ((select public.es_administracion()) and eliminado_en is null)
  with check (
    (select public.es_administracion())
    and eliminado_en is not null
    and eliminado_por = (select auth.uid())
  );

-- NO HAY DELETE: la baja es lógica y el objeto queda.

-- UNA TABLA NUEVA NACE SIN PERMISO Y EL GRANT ES POR COLUMNA. Sin esto el insert rebota con
-- «permission denied for table proveedor_documento» y Next lo muestra como un 404 mudo.
-- El update se acota a las dos columnas de la baja: con el grant abierto, un update legítimo podría
-- reescribir `storage_path` y apuntar la fila al archivo de otro.
grant select on public.proveedor_documento to authenticated;
grant insert (proveedor_id, storage_path, nombre_archivo, tipo_mime, tamano_bytes, categoria,
              descripcion, subido_por)
  on public.proveedor_documento to authenticated;
grant update (eliminado_en, eliminado_por) on public.proveedor_documento to authenticated;

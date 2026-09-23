-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL PARTE DIARIO RECIBE FOTOS, VIDEOS Y PDF — el registro multimedia de la obra deja el chat
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 23/09/2026, textual: «necesito que los partes diarios permitan la carga de
-- muchas imágenes, fotos, registro multimedia de todo; actualmente se hace así: foto y descripción».
-- Hoy el jefe manda las fotos con una descripción por otro canal; el OS las recibe en el parte del día.
--
-- ═══ QUÉ ES ESTO Y QUÉ NO ES ═══
--
-- Un adjunto es UN archivo atado a UNA obra y UN día, con su propia descripción. Opcionalmente se ata
-- a un frente (`obra_actividad`) o a un renglón concreto del parte (`obra_ejecucion`); si no, es «del
-- día». NO es un parte: un día puede tener fotos sin producción cargada (la foto del andamio armado
-- vale aunque nadie haya medido nada) y por eso no cuelga de `obra_ejecucion` con `not null`.
--
-- NO reemplaza a `obra_restriccion.foto_path` (la foto de un impedimento) ni a los papeles de la
-- solapa Documentos (`entidad_documento`, Drive): eso son documentos de la obra; esto es el registro
-- de lo que pasó cada día. Son dos conceptos y por eso son dos objetos.
--
-- ═══ EL BUCKET ES PRIVADO Y FILTRA POR TIPO ═══
--
-- Lo que entra es lo que un navegador puede MOSTRAR: imágenes (jpeg/png/webp/heic), video (mp4/mov)
-- y PDF. Un `.html` o un `.svg` colado se renderizaría en el origen de Storage al abrir la firma;
-- la lista blanca lo deja afuera en la puerta. HEIC entra porque el iPhone lo manda cuando la foto
-- viene de la galería: se guarda tal cual y la pantalla dice que no lo puede previsualizar (Chrome
-- no lo decodifica), pero la evidencia no se pierde.
--
-- 100 MB es el techo del bucket y es el del VIDEO: un clip de un minuto de celular pesa 60–120 MB;
-- lo que no entra ahí es una filmación, y para eso está Drive. Las imágenes se comprimen en el
-- navegador antes de subir (lado mayor 2000 px, jpeg 0,85 → 300–900 KB) y el PDF tiene su propio
-- tope de 25 MB en la lógica de la app. El bucket sólo pone el techo absoluto.
--
-- ═══ LA RUTA ES PARTE DE LA CERRADURA ═══
--
-- `obra/<obra_id>/<fecha>/<uuid>.<ext>`. La 2ª carpeta es lo que la policy de Storage le pregunta a
-- `ve_obra()`, y lo que la policy de la TABLA cruza contra `obra_id`: una fila no puede declarar la
-- foto de una obra apuntando al archivo de otra. La 3ª (fecha) se cruza con `fecha` por la misma
-- razón: el registro del lunes no puede aparecer como del martes cambiando un campo.

-- ── 1. EL BUCKET ────────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partes-adjuntos', 'partes-adjuntos', false, 104857600,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'video/mp4', 'video/quicktime', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lee quien opera la obra (Dirección, Administración, jefe de obra; otro rol sólo si está vinculado
-- en `usuario_obra`). El cliente del portal NO: `ve_obra()` no lo incluye salvo vínculo explícito, y
-- aun con vínculo no sube (abajo).
drop policy if exists partes_adjuntos_lee_su_obra on storage.objects;
create policy partes_adjuntos_lee_su_obra on storage.objects for select to authenticated
  using (
    bucket_id = 'partes-adjuntos'
    and (storage.foldername(name))[1] = 'obra'
    and public.ve_obra((storage.foldername(name))[2])
  );

drop policy if exists partes_adjuntos_sube_su_obra on storage.objects;
create policy partes_adjuntos_sube_su_obra on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partes-adjuntos'
    and not (select public.es_cliente())
    and (storage.foldername(name))[1] = 'obra'
    and public.ve_obra((storage.foldername(name))[2])
  );

-- NO HAY POLICY DE UPDATE NI DE DELETE SOBRE EL OBJETO. La baja es LÓGICA (`borrado_en`) y los bytes
-- quedan: la foto que prueba cómo estaba la obra el día que se discute no puede desaparecer con un
-- clic. Es la misma elección que `comprobantes` y `proveedores-documentos`.

-- ── 2. LA TABLA ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.obra_parte_adjunto (
  id              uuid primary key default gen_random_uuid(),

  -- `on delete cascade` como `obra_ejecucion`: la obra es el eje; sin obra no hay parte.
  obra_id         text not null references public.obra_canonica (id) on delete cascade,
  fecha           date not null,

  -- El frente al que se ata la foto. NULL = «del día». Si el frente se borra, la foto queda del día:
  -- la evidencia vale más que el vínculo.
  actividad_id    uuid references public.obra_actividad (id) on delete set null,
  -- El renglón concreto del parte, cuando se conoce. NULL casi siempre: la 06 guarda el parte entero
  -- después de las fotos, y el renglón nace después. Existe para el bot y para atar a posteriori.
  ejecucion_id    uuid references public.obra_ejecucion (id) on delete set null,

  -- LA RUTA ES LA IDENTIDAD DEL OBJETO Y ES ÚNICA: dos filas sobre el mismo archivo serían la misma
  -- foto listada dos veces, y borrar una dejaría la otra viva.
  storage_path    text not null unique,
  nombre_archivo  text not null check (length(btrim(nombre_archivo)) between 1 and 255),
  tipo_mime       text not null check (tipo_mime in (
                    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                    'video/mp4', 'video/quicktime', 'application/pdf')),
  -- El techo es el del bucket. Una fila no puede declarar un tamaño que el bucket no habría dejado
  -- entrar: sería un dato que contradice al objeto que dice describir.
  tamano_bytes    bigint not null check (tamano_bytes > 0 and tamano_bytes <= 104857600),

  -- «Foto y descripción»: cada archivo tiene su texto, editable después. NULL = sin descripción, y
  -- se dibuja «sin descripción», nunca una cadena vacía.
  descripcion     text check (descripcion is null or length(descripcion) <= 1000),
  -- Cuándo se SACÓ la foto (EXIF DateTimeOriginal leído en el navegador). NULL = no se pudo leer:
  -- no es «la hora de subida», que es `creado_en`. Las dos existen porque no son lo mismo: la foto
  -- de la mañana subida a las 18:30 se ordena por cuándo se sacó.
  tomada_en       timestamptz,

  -- Quién la subió. `perfiles.id` = `auth.uid()`, como `obra_ejecucion.creado_por`. Sin cascade:
  -- borrar una cuenta no borra el rastro de quién dejó la evidencia.
  subido_por      uuid not null default auth.uid() references public.perfiles (id),
  creado_en       timestamptz not null default now(),

  -- BAJA LÓGICA. `borrado_en` null = vigente. El objeto del bucket queda; la fila dice quién y cuándo.
  borrado_en      timestamptz,
  borrado_por     uuid references public.perfiles (id),
  check ((borrado_en is null) = (borrado_por is null)),

  -- La fila y el objeto cuentan la misma historia: `obra/<obra_id>/<fecha>/…`.
  constraint obra_parte_adjunto_ruta_coherente
    check (storage_path like ('obra/' || obra_id || '/' || to_char(fecha, 'YYYY-MM-DD') || '/%'))
);

-- La 06 pide «las fotos de esta obra en este día, vigentes»; Documentos pide un rango de días.
create index if not exists obra_parte_adjunto_vigentes_idx
  on public.obra_parte_adjunto (obra_id, fecha desc, creado_en)
  where borrado_en is null;
create index if not exists obra_parte_adjunto_por_actividad_idx
  on public.obra_parte_adjunto (actividad_id)
  where actividad_id is not null and borrado_en is null;

comment on table public.obra_parte_adjunto is
  'Fotos, videos y PDF del parte diario de una obra: un archivo, un día, una descripción. Opcionalmente atado a un frente (actividad) o a un renglón del parte (ejecución). NO es un documento de la obra (eso es entidad_documento/Drive) ni la foto de un impedimento (obra_restriccion.foto_path).';
comment on column public.obra_parte_adjunto.storage_path is
  'Ruta en el bucket privado `partes-adjuntos`: obra/<obra_id>/<fecha>/<uuid>.<ext>. Las carpetas 2 y 3 son parte de la cerradura (CHECK y policies), no orden.';
comment on column public.obra_parte_adjunto.tomada_en is
  'Cuándo se sacó (EXIF DateTimeOriginal, leído en el navegador antes de comprimir). NULL = no se pudo leer; NO es la hora de subida (creado_en).';
comment on column public.obra_parte_adjunto.borrado_en is
  'Baja LÓGICA por quien subió o por Administración. El objeto del bucket no se borra.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────────────────────
alter table public.obra_parte_adjunto enable row level security;

-- LEE quien opera la obra. Las borradas también se leen (la app las filtra): quien administra tiene
-- que poder ver que hubo una foto y quién la sacó de en medio.
drop policy if exists obra_parte_adjunto_select on public.obra_parte_adjunto;
create policy obra_parte_adjunto_select on public.obra_parte_adjunto
  for select to authenticated
  using (public.ve_obra(obra_id));

-- ESCRIBE quien opera la obra y no es cliente, a nombre propio, viva, y sobre un objeto de ESA obra
-- y ESE día (el `like` repite el CHECK a propósito: el CHECK cuida la coherencia de la fila, la
-- policy cuida que nadie registre como suyo un objeto que no subió a esa carpeta).
drop policy if exists obra_parte_adjunto_insert on public.obra_parte_adjunto;
create policy obra_parte_adjunto_insert on public.obra_parte_adjunto
  for insert to authenticated
  with check (
    public.ve_obra(obra_id)
    and not (select public.es_cliente())
    and subido_por = (select auth.uid())
    and borrado_en is null
    and storage_path like ('obra/' || obra_id || '/' || to_char(fecha, 'YYYY-MM-DD') || '/%')
  );

-- EDITA (descripción, frente) y BORRA (lógico) quien la subió o Administración, sobre una fila viva.
-- El grant de abajo acota las columnas: `storage_path`, `obra_id` y `fecha` no se pueden reescribir
-- por la web, así que la fila no puede apuntar después a otro archivo ni cambiarse de día.
drop policy if exists obra_parte_adjunto_update on public.obra_parte_adjunto;
create policy obra_parte_adjunto_update on public.obra_parte_adjunto
  for update to authenticated
  using (
    public.ve_obra(obra_id)
    and borrado_en is null
    and (subido_por = (select auth.uid()) or (select public.es_administracion()))
  )
  with check (
    public.ve_obra(obra_id)
    and (subido_por = (select auth.uid()) or (select public.es_administracion()))
    and (borrado_en is null or borrado_por = (select auth.uid()))
  );

-- NO HAY DELETE: la baja es lógica y el objeto queda.

-- ── 4. GRANT ────────────────────────────────────────────────────────────────────────────────────
-- UNA TABLA NUEVA NACE SIN PERMISO. El insert y el update son POR COLUMNA: lo que la policy no puede
-- distinguir (el valor viejo del nuevo) lo cierra el grant.
grant select on public.obra_parte_adjunto to authenticated;
grant insert (obra_id, fecha, actividad_id, ejecucion_id, storage_path, nombre_archivo, tipo_mime,
              tamano_bytes, descripcion, tomada_en, subido_por)
  on public.obra_parte_adjunto to authenticated;
grant update (descripcion, actividad_id, ejecucion_id, borrado_en, borrado_por)
  on public.obra_parte_adjunto to authenticated;
grant select, insert, update, delete on public.obra_parte_adjunto to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS ÓRDENES DEL CLIENTE — la OC que compromete el trabajo deja de vivir en una casilla de mail
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Pedido del dueño, 09/09/2026, textual: «necesito que ingreses a mi mail, descargues todas las
-- órdenes de compra y órdenes de pago de Messina y cualquier otro que haya. Quiero que agregues
-- esta información en la carpeta de cada uno de los clientes en app.ecsas.com.ar visible en esa
-- pantalla al lado del nombre de la obra».
--
-- ═══ POR QUÉ NO ES `public.obra_documento`, QUE YA EXISTE ═══
--
-- El pedido de la tarea nombraba `obra_documento`. Esa tabla YA EXISTE desde el 17/08 y es OTRA
-- COSA: su clave primaria es `(obra_id, drive_file_id)`, el archivo NO se copia —guarda el id de
-- un archivo de Drive y su rótulo— y su propia migración (`20260819T0100`) deja escrito, como
-- decisión y no como olvido, que NO lleva `cliente_id` porque el cliente sale de la obra.
--
-- Nada de eso sirve acá y forzarlo rompería las tres cosas a la vez:
--   · estos archivos NO están en Drive: son bytes que bajan de Gmail a un bucket privado, así que
--     `drive_file_id` —parte de la PK, `not null`— no existiría;
--   · una orden que no se pudo atribuir a una obra tiene que quedar VIVA a nivel cliente, y ahí
--     `obra_id` es null: imposible en una PK;
--   · una orden tiene número, fecha e importe. `obra_documento` es un vínculo, no un comprobante.
--
-- Meterlas ahí habría dado dos significados a la misma tabla, que es justo lo que REALIDAD ÚNICA
-- prohíbe. Son dos conceptos y por eso son dos objetos. `cliente_orden` es LA ORDEN; `obra_documento`
-- sigue siendo el vínculo a un archivo de Drive.
--
-- ═══ QUÉ AFIRMA ESTA TABLA Y QUÉ NO ═══
--
-- Afirma: este PDF llegó por mail, de este cliente, y el OS lo guardó. Los campos leídos del PDF
-- (`numero`, `fecha`, `importe`) son NULLABLES a propósito: cuando el PDF no los dice, la fila los
-- deja en null. Un importe inventado en una orden de compra es peor que una orden sin importe.
--
-- NO afirma que la obra sea la correcta cuando `obra_id` es null: eso significa que el OS no pudo
-- decidir entre dos obras del mismo cliente y prefirió dejarlo a nivel cliente. `atribucion` guarda
-- CÓMO se resolvió el cliente, para que la pantalla pueda distinguir el hecho de la deducción.

-- ── 1. EL BUCKET ────────────────────────────────────────────────────────────────────────────────
--
-- Privado. Se sirve por URL firmada desde el servidor, nunca por link directo: una orden de compra
-- dice qué le cobramos a quién.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('obras-documentos', 'obras-documentos', false, 52428800, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- LA RUTA ES `<cliente_id>/<obra_id|sin-obra>/<uuid>.<ext>`. La primera carpeta es parte de la
-- cerradura: la policy de la TABLA la cruza contra `cliente_id`, así que una fila no puede declarar
-- la orden de un cliente apuntando al archivo de otro.
--
-- LA LECTURA NO ES `es_administracion()` A SECAS. Un jefe de obra ve las órdenes de SU obra y no
-- las del resto de la cartera; el bucket no sabe de obras, así que lo que se hace acá es lo único
-- que el bucket puede saber: sólo Dirección/Administración leen el objeto directo, y el jefe de
-- obra baja por el route handler del servidor, que consulta la fila (con RLS) antes de firmar.
drop policy if exists obras_documentos_lee_administracion on storage.objects;
create policy obras_documentos_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'obras-documentos' and (select public.es_administracion()));

-- NO HAY POLICY DE INSERT PARA `authenticated`: hoy el único escritor es el script del OS, que usa
-- `service_role` y no pasa por RLS. Cuando exista un botón «subir orden» en la web se agrega, y no
-- antes: una puerta abierta sin nadie que la use es una puerta abierta.
--
-- NO HAY UPDATE NI DELETE. El objeto es inmutable y la baja es LÓGICA: un clic no puede hacer
-- desaparecer la única copia de una orden de compra.

-- ── 2. LA TABLA ─────────────────────────────────────────────────────────────────────────────────
create table if not exists public.cliente_orden (
  id                uuid primary key default gen_random_uuid(),

  -- Sin `on delete cascade`: si alguna vez se borra un cliente con órdenes, la base tiene que
  -- negarse en vez de llevarse la evidencia de lo que nos encargaron.
  cliente_id        uuid not null references public.clientes(id),
  -- NULLABLE Y ES EL PUNTO: la orden que no se pudo atribuir a una obra queda del CLIENTE, visible,
  -- y una persona la asigna. Dejarla afuera por no saber la obra sería perderla.
  --
  -- `text` y no `uuid`: `obra_canonica.id` es TEXT en esta base (son claves legibles, no uuid). Una
  -- columna uuid acá deja la foreign key sin poder crearse y la migración aborta.
  obra_id           text references public.obra_canonica(id),

  tipo              text not null check (tipo in ('orden_compra', 'orden_pago', 'otro')),

  -- LEÍDOS DEL PDF. Null = el documento no lo dice. Nunca estimados.
  numero            text check (numero is null or length(btrim(numero)) between 1 and 60),
  fecha             date,
  importe           numeric(16, 2) check (importe is null or importe >= 0),
  moneda            text check (moneda is null or moneda in ('ARS', 'USD')),
  -- El importe y la moneda viajan juntos o no viajan: un número sin moneda no se puede sumar.
  check ((importe is null) = (moneda is null)),

  emisor            text,

  -- IDENTIDAD DEL DOCUMENTO EN GMAIL. La unicidad NO usa `attachment_id`: Gmail lo regenera entre
  -- lecturas del mismo mensaje, así que una segunda corrida vería ids nuevos y duplicaría todo sin
  -- violar ninguna restricción. Lo estable es (mensaje, nombre, tamaño).
  message_id        text,
  attachment_id     text,
  nombre_archivo    text not null check (length(btrim(nombre_archivo)) between 1 and 255),
  tamano_bytes      bigint not null check (tamano_bytes > 0 and tamano_bytes <= 52428800),
  tipo_mime         text,

  archivo_path      text not null unique,

  origen            text not null default 'gmail' check (origen in ('gmail', 'manual')),
  -- CÓMO se supo de qué cliente es: 'remitente' lo prueba el dominio del mail, 'texto' lo dedujo el
  -- OS del asunto de un reenvío interno, 'manual' lo afirmó una persona. HECHO vs INFERENCIA, en la
  -- fila, para que la pantalla no las muestre iguales.
  atribucion        text not null default 'remitente' check (atribucion in ('remitente', 'texto', 'manual')),

  asunto            text,
  recibido_en       timestamptz,
  creado_en         timestamptz not null default now(),
  creado_por        uuid references auth.users(id) default auth.uid(),

  eliminado_en      timestamptz,
  eliminado_por     uuid references auth.users(id),
  check ((eliminado_en is null) = (eliminado_por is null))
);

-- LA IDEMPOTENCIA, COMO RESTRICCIÓN Y NO COMO UN `select` PREVIO. Un índice único parcial sobre
-- columnas anulables no sirve de nada cuando son null (en este repo un índice así convivió con 206
-- NULLs sin quejarse), así que se aplica sólo a las filas que SÍ tienen `message_id` — las de
-- Gmail, que son las que el script puede repetir. Una carga manual futura no queda atrapada.
create unique index if not exists cliente_orden_gmail_unica_idx
  on public.cliente_orden (message_id, nombre_archivo, tamano_bytes)
  where message_id is not null;

-- Las dos preguntas de la pantalla: las órdenes vigentes de una obra, y las del cliente sin obra.
create index if not exists cliente_orden_obra_idx
  on public.cliente_orden (obra_id, fecha desc nulls last) where eliminado_en is null;
create index if not exists cliente_orden_cliente_idx
  on public.cliente_orden (cliente_id, fecha desc nulls last) where eliminado_en is null;

comment on table public.cliente_orden is
  'Órdenes de compra y de pago que MANDA EL CLIENTE, bajadas de Gmail al bucket privado obras-documentos. No confundir con obra_documento (vínculo a un archivo de Drive) ni con proveedor_documento (papeles del proveedor).';
comment on column public.cliente_orden.obra_id is
  'NULL = el OS no pudo atribuirla a una obra sin adivinar. La orden queda del cliente y se asigna a mano.';
comment on column public.cliente_orden.atribucion is
  'remitente = lo prueba el dominio del mail · texto = deducido del asunto de un reenvío interno · manual = lo afirmó una persona.';
comment on column public.cliente_orden.importe is
  'Leído del PDF. NULL cuando el documento no lo dice: nunca estimado.';

-- ── 3. RLS ──────────────────────────────────────────────────────────────────────────────────────
--
-- Quién ve una orden es la misma pregunta que quién ve la obra: Dirección y Administración ven toda
-- la cartera; el jefe de obra ve SÓLO la de su obra —`ve_obra()`, la misma función que gobierna
-- `obra_documento`—. Y una orden a nivel cliente (`obra_id` null) es de la cartera: el jefe de obra
-- no la ve, porque no se puede probar que sea de la suya.
--
-- OJO CON `es_administracion()`: INCLUYE al jefe de obra (decisión del dueño del 19/08, «el jefe de
-- obra ES Administración»). Acá no sirve, porque el recorte por obra es justamente lo que hay que
-- hacerle a ese rol. Por eso se mira `current_rol()` directo y el jefe entra por la otra rama.
--
-- Los porteros van dentro de `(select …)` para que Postgres los evalúe una vez por consulta y no
-- una por fila (InitPlan).
alter table public.cliente_orden enable row level security;

drop policy if exists cliente_orden_select on public.cliente_orden;
create policy cliente_orden_select on public.cliente_orden for select to authenticated
  using (
    (select public.current_rol()) = any (array['direccion', 'administracion'])
    or (
      -- EL ROL VA JUNTO A `ve_obra()`, NO SOLO. MEDIDO sobre la base viva: con `ve_obra()` a secas,
      -- un usuario de nivel CAMPO veía una orden de compra —con el precio que le cobramos al
      -- cliente— porque está asignado a esa obra. `ve_obra()` contesta «¿esta obra es suya?», no
      -- «¿puede ver la plata de esta obra?». La segunda pregunta la contesta el rol.
      (select public.current_rol()) = 'jefe_obra'
      and obra_id is not null and public.ve_obra(obra_id)
    )
  );

-- LA BAJA ES EL ÚNICO CAMBIO POSIBLE DESDE LA WEB, y queda firmada. El `using` exige la fila viva:
-- resucitar una orden que alguien dio de baja es una decisión, no un clic.
drop policy if exists cliente_orden_baja on public.cliente_orden;
create policy cliente_orden_baja on public.cliente_orden for update to authenticated
  using ((select public.current_rol()) = any (array['direccion', 'administracion']) and eliminado_en is null)
  with check (
    (select public.current_rol()) = any (array['direccion', 'administracion'])
    and eliminado_en is not null
    and eliminado_por = (select auth.uid())
  );

-- NO HAY INSERT NI DELETE PARA `authenticated`: el escritor es el script (service_role).

-- ── 4. RLS NO ES GRANT, Y EL GRANT ES POR COLUMNA ───────────────────────────────────────────────
--
-- Una policy sin su grant da `permission denied` y Next lo muestra como un 404 mudo. El update se
-- acota a las dos columnas de la baja: con el grant abierto, un update legítimo podría reescribir
-- `archivo_path` y apuntar la fila al archivo de otro cliente.
grant select on public.cliente_orden to authenticated;
grant update (eliminado_en, eliminado_por) on public.cliente_orden to authenticated;
grant select, insert, update, delete on public.cliente_orden to service_role;

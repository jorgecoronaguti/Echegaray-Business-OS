-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DÓNDE ESTÁ EL PDF DE LA ORDEN, EN UNA COLUMNA Y NO EN UN COMENTARIO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MEDIDO el 10/09/2026: las 40 órdenes de compra de ARCOR se subieron a
-- `administracion/PRESUPUESTOS - CLIENTES/ARCOR - SAN JUAN` y las 4 de Messina se encontraron en su
-- carpeta, y el vínculo con ese archivo quedó escrito DENTRO de `notas`, en prosa:
--
--   «Drive: COCHERAS / OC 53077545 - 12-02-2025.pdf (id 1wpt1Z6-…) — archivada por el OS»
--
-- `notas` es texto libre para auditar una fila; un identificador de sistema adentro de una frase no
-- lo puede leer una pantalla sin adivinar, no lo puede validar la base, y la primera persona que
-- edite esa nota lo borra sin enterarse. El vínculo con Drive es un DATO, no un comentario.
--
-- ═══ POR QUÉ ADEMÁS LA CARPETA ═══
--
-- El archivo responde «abrí este PDF»; la carpeta responde «mostrame todo lo de esta obra», que es
-- la pregunta que el dueño hace primero. Son dos destinos distintos y ninguno se deduce del otro:
-- un archivo puede moverse de carpeta sin cambiar de id.
--
-- ═══ LO QUE ESTA MIGRACIÓN NO HACE ═══
--
-- No copia nada: llenar las columnas es trabajo de
-- `orquestador/scripts/backfill-drive-ordenes-cliente.mjs`, que es idempotente y se puede volver a
-- correr. Y no toca `archivo_path`: el bucket privado sigue siendo de dónde la pantalla SIRVE el
-- PDF. Drive es dónde vive el archivo para las personas; el bucket, para el sistema.

alter table public.cliente_orden add column if not exists drive_file_id text
  check (drive_file_id is null or drive_file_id ~ '^[A-Za-z0-9_-]{10,}$');
alter table public.cliente_orden add column if not exists drive_carpeta_id text
  check (drive_carpeta_id is null or drive_carpeta_id ~ '^[A-Za-z0-9_-]{10,}$');

comment on column public.cliente_orden.drive_file_id is
  'Id del PDF de esta orden en Google Drive, para enlazarlo desde la ficha del cliente '
  '(https://drive.google.com/file/d/<id>/view). NULL = de esta orden no hay copia en Drive, y la '
  'pantalla NO debe ofrecer el enlace. Se cruza con public.drive_index.drive_file_id.';
comment on column public.cliente_orden.drive_carpeta_id is
  'Id de la carpeta de Drive donde está ese PDF — la carpeta de la obra dentro de la carpeta del '
  'cliente. NULL cuando el archivo todavía no fue indexado y su carpeta no se pudo verificar: '
  'nunca se completa por parecido de nombre.';

-- RLS NO ES GRANT, Y UNA COLUMNA NUEVA NACE SIN PERMISO. El grant de lectura de `cliente_orden` es
-- de tabla entera —así lo dejó `20260909T1810`— y por eso alcanza a las dos columnas nuevas; se
-- repite acá para que el día que se acote por columna esta migración siga siendo verdad. El único
-- que escribe la tabla sigue siendo el service_role: la pantalla no publica órdenes.
grant select on public.cliente_orden to authenticated;
grant select, insert, update, delete on public.cliente_orden to service_role;

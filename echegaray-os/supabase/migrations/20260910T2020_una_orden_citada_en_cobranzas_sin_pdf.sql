-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA ORDEN QUE EL SHEET NOMBRA Y DE LA QUE NO EXISTE EL PDF
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MEDIDO el 10/09/2026: la pestaña Cobranzas cita las OC 1923, 1985 y 2135 de Messina, y de esas
-- tres NO hay adjunto en ninguna casilla. Hoy no se pueden registrar: `cliente_orden` exige
-- `archivo_path`, `nombre_archivo` y `tamano_bytes > 0`, y `origen` sólo admite 'gmail' o 'manual'.
-- El resultado es una cartera que dice tener menos órdenes de las que el propio Sheet declara — y
-- nadie puede distinguir «esa OC no existe» de «esa OC existe y no tenemos el papel».
--
-- ═══ POR QUÉ NO ALCANZABA CON `origen = 'manual'` ═══
--
-- 'manual' significa «una persona afirmó esto mirando el documento». Acá no hay documento: lo que
-- hay es una CITA en otra fuente del OS. Son dos niveles de evidencia distintos y la pantalla tiene
-- que poder mostrarlos distinto — una orden sin papel no se puede abrir, y prometer un PDF que no
-- existe es peor que decir que falta.
--
-- ═══ QUÉ SE AFLOJA, Y QUÉ NO ═══
--
-- El archivo pasa a ser opcional, pero SÓLO cuando no hay archivo: las tres columnas viajan juntas
-- o no viaja ninguna. Una fila con `nombre_archivo` y sin `archivo_path` sería un documento roto en
-- la pantalla, que es justo lo que la tabla venía impidiendo.
--
-- APLICAR DESPUÉS DE `20260910T2010`: esa migración agrega `numero_canonico`, y una orden citada
-- sin papel se identifica exactamente por su número.

alter table public.cliente_orden alter column archivo_path   drop not null;
alter table public.cliente_orden alter column nombre_archivo drop not null;
alter table public.cliente_orden alter column tamano_bytes   drop not null;

-- LAS TRES JUNTAS O NINGUNA. Sin esto, «archivo opcional» se convierte en «fila a medio llenar».
alter table public.cliente_orden drop constraint if exists cliente_orden_archivo_completo_chk;
alter table public.cliente_orden add constraint cliente_orden_archivo_completo_chk
  check (num_nulls(archivo_path, nombre_archivo, tamano_bytes) in (0, 3));

alter table public.cliente_orden drop constraint if exists cliente_orden_origen_check;
alter table public.cliente_orden add constraint cliente_orden_origen_check
  check (origen in ('gmail', 'manual', 'cobranzas'));

-- UNA ORDEN SIN PAPEL TIENE QUE TENER NÚMERO. Es lo único que la identifica: sin archivo y sin
-- número, la fila no afirma nada verificable y no habría forma de saber si ya está cargada.
alter table public.cliente_orden drop constraint if exists cliente_orden_sin_papel_con_numero_chk;
alter table public.cliente_orden add constraint cliente_orden_sin_papel_con_numero_chk
  check (archivo_path is not null or numero is not null);

-- DE DÓNDE SALIÓ LA CITA, EN TEXTO. «Cobranzas!F41 — factura A 165» dice más que cualquier código:
-- quien audite la fila tiene que poder volver a la celda. No es un campo libre para comentarios.
alter table public.cliente_orden add column if not exists notas text
  check (notas is null or length(btrim(notas)) between 1 and 500);

comment on column public.cliente_orden.origen is
  'gmail = bajada de una casilla · manual = la cargó una persona con el documento a la vista · '
  'cobranzas = la orden está CITADA en el Sheet y el PDF no existe en ninguna casilla. El origen es '
  'el nivel de evidencia, no el canal.';
comment on column public.cliente_orden.notas is
  'De dónde salió una orden sin papel: la celda del Sheet que la cita. Se lee para auditar la fila.';
comment on column public.cliente_orden.archivo_path is
  'NULL sólo con origen = cobranzas: la orden existe según el Sheet y de su PDF no hay copia. '
  'La pantalla NO debe ofrecer descarga cuando esto es NULL.';

-- RLS NO ES GRANT, Y UNA COLUMNA NUEVA NACE SIN PERMISO. El grant de lectura es de tabla entera y
-- ya cubre `notas`; se repite para que el día que se acote por columna esta migración siga siendo
-- verdad. El escritor sigue siendo sólo el service_role.
grant select on public.cliente_orden to authenticated;

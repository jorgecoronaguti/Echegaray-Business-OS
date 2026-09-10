-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA FACTURA QUE EMITIMOS NO ES UNA ORDEN DE COMPRA DEL CLIENTE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- MEDIDO el 10/09/2026 contra el bucket: seis de las dieciséis filas de `cliente_orden` estaban
-- guardadas con tipo `orden_compra` y son FACTURAS A EMITIDAS POR NOSOTROS. Se clasificaron así
-- porque el nombre del archivo es «OC 02-00002162.pdf» y el detalle de la factura cita la OC que
-- está facturando. La pantalla, en consecuencia, le atribuía a Messina el doble de órdenes de las
-- que Messina emitió — una afirmación falsa sobre un compromiso contractual.
--
-- El papel no se descarta: sigue siendo la evidencia que ata la OC a la obra (describe el trabajo y
-- nombra la orden). Cambia de CLASE, no de valor.
--
-- `cita` guarda, en canónico, la OC que el documento nombra. Es lo que permite dibujar
-- «Factura 225 · cita OC 2162» sin volver a abrir el PDF, y lo que deja escrito POR QUÉ esa factura
-- cuelga de esa obra. NULL = el PDF no cita ninguna, o cita más de una y ninguna manda.
alter table public.cliente_orden drop constraint if exists cliente_orden_tipo_check;
alter table public.cliente_orden add constraint cliente_orden_tipo_check
  check (tipo in ('orden_compra', 'orden_pago', 'factura', 'otro'));

alter table public.cliente_orden add column if not exists cita text
  check (cita is null or length(btrim(cita)) between 1 and 60);

comment on column public.cliente_orden.tipo is
  'orden_compra / orden_pago = lo emitió el CLIENTE. factura = comprobante nuestro que cita la orden: es evidencia de la obra, no una orden. otro = el adjunto que vino en el mismo mail.';
comment on column public.cliente_orden.cita is
  'La OC que este documento NOMBRA, en canónico (2-2162). Leída del PDF, nunca deducida del nombre del archivo.';

-- RLS NO ES GRANT, Y UNA COLUMNA NUEVA NACE SIN PERMISO cuando el grant fue por columna. El de
-- lectura de esta tabla es de tabla entera y ya cubre `cita`; se repite igual para que el día que
-- alguien lo acote por columna, esta migración siga diciendo la verdad sobre quién lee qué.
grant select on public.cliente_orden to authenticated;

-- La «Fecha de Factura» de cada cobranza (col. Q del Sheet) llega a la ficha del cliente.
-- Dueño, 01/10/2026: filtro por fecha de factura y de cobro en Clientes › Cobranzas. La vista publicaba
-- `fecha_emision` (col. C «Fecha de Venta») y `fecha_cobro` (col. R), pero NO la Q: el sync la guarda en
-- `cobranzas.fecha_venta` (cruce de nombres viejo, no se corrige acá). Se agrega AL FINAL —`create or
-- replace view` sólo admite columnas nuevas al final— con las mismas opciones y permisos. SIN APLICAR:
-- la pantalla funciona sin ella (el filtro «Factura» no se dibuja hasta que la vista traiga la columna).
create or replace view public.cliente_cobranza with (security_invoker = false) as
SELECT cb.id AS cobranza_id,
    cb.cliente_id,
    i.obra_id,
    i.imputacion,
    cb.sheet_id AS fila,
    cb.categoria,
    cb.fecha_emision,
    cb.factura,
    cb.numero_comprobante,
    cb.concepto,
    cb.orden_compra,
    cb.monto_neto,
    cb.iva,
    cb.retenciones,
    cb.total_bruto,
    cb.estado,
    cb.moneda,
    es_cobrada(cb.estado, cb.fecha_cobro) AS esta_cobrada,
    cb.estado = 'CANCELAR'::text AS esta_cancelada,
    estado_de_cobro(cb.estado, cb.fecha_cobro, h.hoy) = 'vencido'::text AS esta_vencida,
    cb.fecha_cobro,
    cb.forma_cobro,
    r.drive_file_id AS respaldo_drive_id,
    r.titulo AS respaldo_titulo,
    r.nota AS respaldo_nota,
    estado_de_cobro(cb.estado, cb.fecha_cobro, h.hoy) AS estado_cobro,
    dias_para_cobro(cb.fecha_cobro, h.hoy) AS dias_cobro,
    cb.total_bruto_origen,
    cb.fecha_venta
   FROM cobranzas cb
     CROSS JOIN ( SELECT hoy_san_juan() AS hoy) h
     LEFT JOIN cobranza_imputacion i ON i.cobranza_id = cb.id
     LEFT JOIN LATERAL ( SELECT c.drive_file_id,
            c.titulo,
            c.nota
           FROM cobranza_comprobante c
          WHERE c.cliente_id = cb.cliente_id AND c.sheet_id = cb.sheet_id
          ORDER BY c.cargado_en DESC
         LIMIT 1) r ON true
  WHERE cb.cliente_id IS NOT NULL AND ve_economia();

grant select on public.cliente_cobranza to authenticated;

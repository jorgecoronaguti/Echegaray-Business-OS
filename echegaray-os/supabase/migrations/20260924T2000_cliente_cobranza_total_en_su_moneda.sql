-- El importe EN SU MONEDA de cada cobranza (dueño, 24/09/2026: «necesito saber cuánto cobré en negro, cuánto en
-- blanco, cuánto se contrató y cuánto falta cobrar»; Quattropani pagó U$S 10.500 en efectivo). La ficha del
-- cliente muestra «U$S» donde la plata es en dólares; hasta hoy la vista sólo traía el valor en pesos.
-- Se agrega al FINAL (create or replace view sólo admite columnas nuevas al final). Mismas opciones y permisos.
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
    cb.total_bruto_origen
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

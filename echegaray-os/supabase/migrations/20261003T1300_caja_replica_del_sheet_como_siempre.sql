-- LA RÉPLICA DEL SHEET SIGUE LEYENDO LO DE SIEMPRE; EL SALDO DE LA APP LEE LA VISTA COMPLETA.
--
-- 20261002T2345 agregó a `efectivo_movimiento_caja` las ramas «Compra en efectivo», «Cobro en efectivo», «Extracción»,
-- «Depósito» y «Sueldo de oficina». Esa vista tiene OTRO consumidor: `orquestador/scripts/efectivo-raw-pestana.mjs` la
-- vuelca en `_EFECTIVO_RAW` del Flujo de Caja (todo menos «Pago de jornales»). Las fórmulas de CAJA filtran por
-- movimiento, así que no contaban doble, pero la pestaña iba a recibir ~500 filas de Compras que el Sheet ya tiene
-- en su propia pestaña. Una vista con dos consumidores y dos significados: se separa.
--
--   · `efectivo_movimiento_caja`          → vuelve a ser las cuatro ramas de 20261002T1800 (contrato de la réplica).
--   · `efectivo_movimiento_caja_completa` → las ramas de 20261002T2345, tal cual.
--   · `efectivo_caja_saldo`               → lee la completa. Mismas columnas, mismo alcance.

-- 1 · La completa (antes de tocar la de siempre: el saldo pasa a depender de ésta).
create or replace view public.efectivo_movimiento_caja_completa with (security_invoker = true) as
 SELECT e.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Entrega'::text AS movimiento,
    - e.monto AS importe,
    e.creada_en AS registrado_en
   FROM efectivo_entrega e
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT d.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Devolución'::text AS movimiento,
    d.monto AS importe,
    d.registrada_en AS registrado_en
   FROM efectivo_devolucion d
     JOIN efectivo_entrega e ON e.id = d.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT r.adelanto_fecha,
    e.codigo,
    p.nombre_completo AS persona,
    'Sueldo de ' || COALESCE(emp.nombre_completo, 'empleado') AS destino,
    'Adelanto de sueldo'::text AS movimiento,
    r.monto AS importe,
    r.imputada_en AS registrado_en
   FROM efectivo_rendicion r
     JOIN efectivo_entrega e ON e.id = r.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN personas emp ON emp.id = r.adelanto_persona_id
  WHERE r.adelanto_persona_id IS NOT NULL
    AND e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 -- Liquidación, obreros: sólo `caja` (lo pagado desde una entrega ya bajó con la entrega).
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Jornales ' || x.grupo AS destino,
    'Pago de jornales'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND x.grupo <> 'oficina' AND NOT COALESCE(emp.es_prueba, false)
UNION ALL
 -- Liquidación, oficina: el renglón «sueldos de OFICINA en efectivo» del Sheet (su parte web).
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Sueldos oficina'::text AS destino,
    'Sueldo de oficina'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND x.grupo = 'oficina' AND NOT COALESCE(emp.es_prueba, false)
UNION ALL
 -- Compras: el MONTO PAGADO (parcial o total). «Pagado» por fecha de caja, «Pendiente» con parcial por fecha de carga.
 SELECT CASE WHEN c.estado = 'Pagado' THEN c.fecha_caja ELSE c.fecha END AS fecha,
    'Compras f' || c.fila AS codigo,
    COALESCE(NULLIF(btrim(c.proveedor), ''), '—') AS persona,
    COALESCE(NULLIF(btrim(c.obra_texto), ''), NULLIF(btrim(c.unidad_negocio), ''), 'Estructura') AS destino,
    'Compra en efectivo'::text AS movimiento,
    - c.monto_pagado AS importe,
    NULL::timestamptz AS registrado_en
   FROM compra_sheet c
  WHERE c.tipo_pago = 'Efectivo' AND c.estado IN ('Pagado', 'Pendiente') AND COALESCE(c.monto_pagado, 0) <> 0
    AND public.rubro_caja(c.proveedor, c.unidad_negocio, c.obra_texto, c.concepto)
        NOT IN ('Nómina · Jornales de obra', 'Nómina · Sueldos administración')
    AND NOT EXISTS (
      SELECT 1 FROM efectivo_rendicion r JOIN efectivo_entrega e ON e.id = r.entrega_id
       WHERE e.anulada_en IS NULL AND (r.compra_clave = c.clave OR r.compra_clave = 'f:' || c.fila OR r.fila = c.fila))
UNION ALL
 SELECT m.fecha, m.codigo, m.persona, m.destino, m.movimiento, m.importe, m.registrado_en
   FROM public.efectivo_caja_movimientos_de_espejos() m;

revoke all on public.efectivo_movimiento_caja_completa from anon, public;
grant select on public.efectivo_movimiento_caja_completa to authenticated;
comment on view public.efectivo_movimiento_caja_completa is
  'Todos los movimientos del cajón de pesos que conoce Postgres (a rendir, jornales, oficina, compras, cobros, extracto). La lee efectivo_caja_saldo. La réplica del Sheet lee efectivo_movimiento_caja.';

-- 2 · El saldo, sobre la completa.
create or replace view public.efectivo_caja_saldo with (security_invoker = true) as
 with s as (
   select c.valor, c.sellado_en,
          (c.sellado_en at time zone 'America/Argentina/San_Juan')::date as dia,
          (now() at time zone 'America/Argentina/San_Juan')::date as hoy
     from public.efectivo_ultimo_conteo() c
 ),
 m as (
   select
     coalesce(sum(v.importe) filter (where v.movimiento in ('Entrega', 'Devolución') and v.registrado_en > s.sellado_en), 0)
       as a_rendir,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Pago de jornales' and v.fecha <= s.hoy
       and (v.fecha > s.dia or (v.fecha = s.dia and v.registrado_en > s.sellado_en))), 0) as jornales,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Sueldo de oficina' and v.fecha <= s.hoy
       and (v.fecha > s.dia or (v.fecha = s.dia and v.registrado_en > s.sellado_en))), 0) as oficina,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Compra en efectivo' and v.fecha >= s.dia and v.fecha <= s.hoy), 0)
       as compras,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Cobro en efectivo' and v.fecha > s.dia), 0) as cobros,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Extracción' and v.fecha > s.dia and v.fecha <= s.hoy), 0)
       as extracciones,
     coalesce(sum(v.importe) filter (where v.movimiento = 'Depósito' and v.fecha >= s.dia and v.fecha <= s.hoy), 0)
       as depositos
   from s left join public.efectivo_movimiento_caja_completa v on true
 )
 select s.valor as conteo_sellado,
        s.sellado_en,
        m.a_rendir as entregas_y_devoluciones,
        m.jornales as pagos_de_jornales,
        s.valor + m.a_rendir + m.jornales + m.oficina + m.compras + m.cobros + m.extracciones + m.depositos as saldo,
        ('Conteo sellado + desde el sello: entregas y devoluciones a rendir (por instante); jornales y sueldos de oficina '
         || 'pagados en efectivo en Liquidación (por fecha; los del día del conteo, si se anotaron después del sello); '
         || 'compras pagadas en efectivo (Compras: monto pagado, sin «A rendir», sin lo rendido de una entrega ni la '
         || 'nómina de la planilla; desde el día del conteo); cobros en efectivo en pesos (Cobranzas «Cobrado», desde el '
         || 'día siguiente); extracciones (desde el día siguiente) y depósitos de efectivo (desde el día del conteo) del '
         || 'extracto. NO incluye: los pagos de la planilla de Jornales y Oficina anteriores a la quincena del 16/09 (no '
         || 'están en la base), los pagos cargados tarde sobre filas anteriores al conteo, ni lo que los espejos de '
         || 'Compras, Cobranzas y el extracto todavía no trajeron.')::text as alcance,
        m.compras as compras_en_efectivo,
        m.cobros as cobros_en_efectivo,
        m.extracciones,
        m.depositos,
        m.oficina as sueldos_de_oficina
   from s cross join m
  where public.liquida_sueldos();

-- 3 · La de siempre, como en 20261002T1800.
create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
 SELECT e.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Entrega'::text AS movimiento,
    - e.monto AS importe,
    e.creada_en AS registrado_en
   FROM efectivo_entrega e
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT d.fecha,
    e.codigo,
    p.nombre_completo AS persona,
    COALESCE(o.nombre, 'Estructura'::text) AS destino,
    'Devolución'::text AS movimiento,
    d.monto AS importe,
    d.registrada_en AS registrado_en
   FROM efectivo_devolucion d
     JOIN efectivo_entrega e ON e.id = d.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN obra_canonica o ON o.id = e.obra_id
  WHERE e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT r.adelanto_fecha,
    e.codigo,
    p.nombre_completo AS persona,
    'Sueldo de ' || COALESCE(emp.nombre_completo, 'empleado') AS destino,
    'Adelanto de sueldo'::text AS movimiento,
    r.monto AS importe,
    r.imputada_en AS registrado_en
   FROM efectivo_rendicion r
     JOIN efectivo_entrega e ON e.id = r.entrega_id
     JOIN personas p ON p.id = e.persona_id
     LEFT JOIN personas emp ON emp.id = r.adelanto_persona_id
  WHERE r.adelanto_persona_id IS NOT NULL
    AND e.anulada_en IS NULL AND NOT COALESCE(p.es_prueba, false) AND NOT e.es_prueba
UNION ALL
 SELECT x.fecha,
    'Q ' || to_char(x.quincena_desde, 'DD/MM') AS codigo,
    emp.nombre_completo AS persona,
    'Jornales ' || x.grupo AS destino,
    'Pago de jornales'::text AS movimiento,
    - x.importe AS importe,
    x.registrado_en
   FROM liquidacion_pago_efectivo x
     JOIN personas emp ON emp.id = x.persona_id
  WHERE x.origen = 'caja' AND NOT COALESCE(emp.es_prueba, false);

revoke all on public.efectivo_movimiento_caja from anon, public;
grant select on public.efectivo_movimiento_caja to authenticated;

notify pgrst, 'reload schema';

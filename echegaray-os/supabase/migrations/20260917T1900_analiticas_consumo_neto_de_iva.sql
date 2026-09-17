-- ANALÍTICAS MIDE EL CONSUMO NETO DE IVA — Y LOS PRESUPUESTOS SÓLO LOS VE QUIEN VE ECONOMÍA (17/09/2026).
--
-- ═══ POR QUÉ ═══
--
-- La auditoría del módulo encontró que lo consumido en materiales y subcontratos sumaba `costos_obra.total`
-- (CON IVA) contra un presupuesto que es SIN IVA: el % y el «excedido» que veía el dueño estaban
-- inflados (Alumetal, fila 761: importe 13.829.411,29 + IVA 2.819.588,71). ECSAS es responsable
-- inscripto: el IVA discriminado es crédito fiscal, no costo.
--
-- ═══ LA REGLA (dueño, 17/09/2026) ═══
--
--   · Comprobante con IVA discriminado (factura A, o nota de crédito/débito que lo discrimina, con IVA
--     distinto de cero e importe cargado) → se toma el IMPORTE.
--   · Sin IVA discriminado (F B, F C, N/A, PRESU, tique, tipo vacío) → el TOTAL: ese IVA no se recupera.
--   El importe de una F A también deja afuera percepciones e impuestos internos cuando Compras los cargó
--   aparte (17 filas de le-comedor: combustibles, Alumetal, Trielec, pinturería): es la regla textual
--   del dueño, «se toma el importe».
--   La regla a la fecha (pagado → total; por vencer → sólo lo pagado) se aplica igual y después se
--   escala por neto ÷ total: lo pagado de un comprobante por vencer también es neto en esa proporción.
--
-- ═══ POR QUÉ UN PARÁMETRO Y NO CAMBIAR LA FUNCIÓN ═══
--
-- `costo_de_obra_filas` y `costo_de_obras_a_la_fecha(text[])` alimentan la ficha del cliente, Obras y la
-- deuda con proveedores, que muestran lo que se PAGA (con IVA). No se tocan. `costo_de_obra_filas_iva`
-- envuelve a la definición única y, con `p_neto`, devuelve las mismas filas netas; las versiones con rango
-- ganan un cuarto argumento y la de tres DELEGA con `false` (respuesta idéntica a la de antes).
-- Analíticas (`analiticas_costos`, `analiticas_consumo_mensual`) pide `true`.
--
-- ═══ RLS ═══
--
-- `presupuestos_select` usaba `es_administracion()`: el jefe de obra leía costos cotizados.
-- Pasa a `ve_economia()`, como `partidas_presupuesto_select`. Es un endurecimiento.

set local lock_timeout = '5s';

-- ─── 1 · La regla neta, en un solo lugar ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_neto_de_iva(p_total numeric, p_importe numeric, p_iva numeric, p_tipo text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_importe is not null and coalesce(p_iva, 0) <> 0
     and upper(regexp_replace(coalesce(p_tipo, ''), '[^A-Za-z]', '', 'g')) in ('FA', 'NC', 'ND', 'NCA', 'NDA')
      then p_importe
    else p_total
  end
$function$;

comment on function public.costo_neto_de_iva(numeric, numeric, numeric, text) is
  'Costo de un comprobante de Compras sin el IVA que es crédito fiscal: importe si discrimina IVA (F A, NC/ND), total si no (20260917T1900).';

-- ─── 2 · Las filas de costo, con o sin IVA ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_de_obra_filas_iva(p_obras text[], p_clientes uuid[], p_neto boolean)
 RETURNS TABLE(obra_id text, cliente_id uuid, referencia text, sheet_id integer, fila integer,
   fecha date, fecha_prevista date, estado text, proveedor text, comprobante text, concepto text,
   detalle_obra text, total numeric, monto_pagado numeric, a_la_fecha numeric, por_vencer numeric,
   es_subcontrato boolean, motivo_subcontrato text, tomado_al_total boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select f.obra_id, f.cliente_id, f.referencia, f.sheet_id, f.fila, f.fecha, f.fecha_prevista, f.estado,
         f.proveedor, f.comprobante, f.concepto, f.detalle_obra,
         case when p_neto then n.neto else f.total end,
         f.monto_pagado,
         case when p_neto then f.a_la_fecha * n.factor else f.a_la_fecha end,
         case when p_neto then n.neto - f.a_la_fecha * n.factor else f.por_vencer end,
         f.es_subcontrato, f.motivo_subcontrato,
         p_neto and n.neto = f.total and f.total <> 0
    from public.costo_de_obra_filas(p_obras, p_clientes) f
    left join public.costos_obra c on c.origen = 'compras_sheet' and c.referencia_externa = f.referencia
    cross join lateral (select public.costo_neto_de_iva(f.total, c.importe, c.iva, c.tipo) as neto) n0
    cross join lateral (select n0.neto, case when coalesce(f.total, 0) = 0 then 1 else n0.neto / f.total end as factor) n
$function$;

-- ─── 3 · El costo a la fecha y lo sin obra, con el cuarto argumento ──────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.* from public.costo_de_obra_filas_iva(p_obras, null, p_neto) f
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where not f.es_subcontrato)              as materiales,
           sum(f.a_la_fecha) filter (where f.es_subcontrato)                  as subcontratos,
           count(*)          filter (where not f.es_subcontrato)::int         as n_comprobantes,
           count(*)          filter (where f.es_subcontrato)::int             as n_subcontratos,
           max(f.fecha)      filter (where not f.es_subcontrato)              as ultimo_comprobante,
           count(*)          filter (where f.tomado_al_total)::int            as n_sin_iva_discriminado,
           nullif(sum(f.por_vencer) filter (where not f.es_subcontrato), 0)   as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.es_subcontrato), 0)       as subcontratos_por_vencer,
           nullif(sum(f.por_vencer), 0)                                       as comprometido_futuro,
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', f.motivo_subcontrato)
                     order by f.a_la_fecha desc)
             filter (where f.es_subcontrato)                                  as subcontratos_detalle
      from filas f
     group by f.obra_id
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'real')        as mano_obra_real,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada,
           sum(m.horas)       filter (where m.estado <> 'falta_dato') as horas_valorizadas,
           sum(m.horas)       filter (where m.estado = 'falta_dato')  as horas_sin_tarifa,
           count(distinct m.persona_id) filter (where m.estado = 'falta_dato')::int as personas_sin_tarifa,
           jsonb_agg(jsonb_build_object('persona_id', m.persona_id, 'nombre', pe.nombre_completo,
                                        'quincena', m.quincena_desde, 'horas', m.horas, 'origen', m.origen)
                     order by m.quincena_desde, pe.nombre_completo)
             filter (where m.estado = 'falta_dato') as falta_dato,
           max(m.quincena_hasta) filter (where m.sellado_en is not null) as sellado_hasta
      from public.costo_mo_de_obras(p_obras, p_desde, p_hasta) m
      left join public.personas pe on pe.id = m.persona_id
     group by m.obra_canonica_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'obra_id', o.obra_id,
           'materiales', k.materiales, 'subcontratos', k.subcontratos,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'mano_obra', h.mano_obra, 'mano_obra_real', h.mano_obra_real,
           'mano_obra_estimada', h.mano_obra_estimada, 'horas_valorizadas', h.horas_valorizadas,
           'horas_sin_tarifa', h.horas_sin_tarifa, 'personas_sin_tarifa', coalesce(h.personas_sin_tarifa, 0),
           'falta_dato', coalesce(h.falta_dato, '[]'::jsonb), 'sellado_hasta', h.sellado_hasta,
           'puede_ver_tarifas', public.liquida_sueldos(),
           'corte', current_date)
           -- EL RANGO SÓLO VIAJA CUANDO LO HAY: sin él, la respuesta es idéntica a la de la firma vieja.
           || case when p_desde is null and p_hasta is null then '{}'::jsonb
                   else jsonb_build_object('desde', p_desde, 'hasta', p_hasta) end
           -- NETO SÓLO VIAJA CUANDO SE PIDE: sin él la respuesta es byte a byte la de antes.
           || case when p_neto then jsonb_build_object('neto_de_iva', true, 'n_sin_iva_discriminado', coalesce(k.n_sin_iva_discriminado, 0))
                   else '{}'::jsonb end), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.costo_de_obras_a_la_fecha(p_obras, p_desde, p_hasta, false)
$function$;

CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with filas as (
    select f.* from public.costo_de_obra_filas_iva(null, p_clientes, p_neto) f
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'cliente_id', t.cliente_id,
           'materiales', t.materiales, 'subcontratos', t.subcontratos,
           'n_comprobantes', t.n_comprobantes, 'n_subcontratos', t.n_subcontratos,
           'comprometido_futuro', t.comprometido_futuro,
           'materiales_por_vencer', t.materiales_por_vencer, 'subcontratos_por_vencer', t.subcontratos_por_vencer,
           'detalles', (
             select coalesce(jsonb_agg(jsonb_build_object('detalle', d.detalle, 'total', d.total)
                                       order by d.total desc), '[]'::jsonb)
               from (select coalesce(nullif(trim(f.detalle_obra), ''), '(columna K vacía)') as detalle,
                            sum(f.a_la_fecha) as total
                       from filas f
                      where f.cliente_id = t.cliente_id
                      group by 1 order by 2 desc limit 5) d),
           'subcontratos_detalle', (
             select coalesce(jsonb_agg(jsonb_build_object('proveedor', f.proveedor, 'comprobante', f.comprobante,
                                                          'fecha', f.fecha, 'total', f.total, 'a_la_fecha', f.a_la_fecha,
                                                          'por_vencer', f.por_vencer, 'motivo', f.motivo_subcontrato)
                                       order by f.a_la_fecha desc), '[]'::jsonb)
               from filas f
              where f.cliente_id = t.cliente_id and f.es_subcontrato),
           'corte', current_date)), '[]'::jsonb)
    from (
      select f.cliente_id,
             sum(f.a_la_fecha) filter (where not f.es_subcontrato)              as materiales,
             sum(f.a_la_fecha) filter (where f.es_subcontrato)                  as subcontratos,
             count(*)::int                                                      as n_comprobantes,
             count(*)          filter (where f.es_subcontrato)::int             as n_subcontratos,
             nullif(sum(f.por_vencer), 0)                                       as comprometido_futuro,
             nullif(sum(f.por_vencer) filter (where not f.es_subcontrato), 0)   as materiales_por_vencer,
             nullif(sum(f.por_vencer) filter (where f.es_subcontrato), 0)       as subcontratos_por_vencer
        from filas f
       group by f.cliente_id) t
$function$;

CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[], p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.compras_sin_obra_de_clientes(p_clientes, p_desde, p_hasta, false)
$function$;

-- ─── 4 · Analíticas pide neto ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.analiticas_costos(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_obras text[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when not coalesce((select public.ve_economia()), false) then null::jsonb
    else jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'corte', current_date,
      'obras', public.costo_de_obras_a_la_fecha(
                 coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)), p_desde, p_hasta, true),
      'sin_obra', public.compras_sin_obra_de_clientes(
                 (select array_agg(c.cliente_id) from public.cliente_panel c), p_desde, p_hasta, true),
      'cuenta_corriente', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                             from public.cuenta_corriente_de_clientes(p_desde, p_hasta) k)
    )
  end
$function$;

CREATE OR REPLACE FUNCTION public.analiticas_consumo_mensual(p_obras text[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  compras as (
    select f.obra_id, date_trunc('month', f.fecha)::date as mes,
           sum(f.a_la_fecha) filter (where not f.es_subcontrato) as materiales,
           sum(f.a_la_fecha) filter (where f.es_subcontrato)     as subcontratos
      from ids cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, true) f
     group by 1, 2
  ),
  mano_obra as (
    select m.obra_canonica_id as obra_id, date_trunc('month', m.quincena_desde)::date as mes,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as mano_obra,
           sum(m.costo_total) filter (where m.estado = 'estimado')    as mano_obra_estimada
      from ids cross join lateral public.costo_mo_de_obras(ids.obras, null::date, null::date) m
     group by 1, 2
  )
  select case
    when not coalesce((select public.ve_economia()), false) then null::jsonb
    else (select coalesce(jsonb_agg(jsonb_build_object(
                   'obra_id', coalesce(c.obra_id, h.obra_id), 'mes', coalesce(c.mes, h.mes),
                   'materiales', c.materiales, 'subcontratos', c.subcontratos,
                   'mano_obra', h.mano_obra, 'mano_obra_estimada', h.mano_obra_estimada)
                 order by coalesce(c.obra_id, h.obra_id), coalesce(c.mes, h.mes)), '[]'::jsonb)
            from compras c
            full join mano_obra h on h.obra_id = c.obra_id and h.mes = c.mes)
  end
$function$;


-- ─── 5 · RLS: el costo cotizado es economía ──────────────────────────────────────────────────────
alter policy presupuestos_select on public.presupuestos using ((select public.ve_economia()));

revoke all on function public.costo_neto_de_iva(numeric, numeric, numeric, text) from public, anon;
revoke all on function public.costo_de_obra_filas_iva(text[], uuid[], boolean) from public, anon;
revoke all on function public.costo_de_obras_a_la_fecha(text[], date, date, boolean) from public, anon;
revoke all on function public.compras_sin_obra_de_clientes(uuid[], date, date, boolean) from public, anon;
grant execute on function public.costo_neto_de_iva(numeric, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.costo_de_obra_filas_iva(text[], uuid[], boolean) to authenticated, service_role;
grant execute on function public.costo_de_obras_a_la_fecha(text[], date, date, boolean) to authenticated, service_role;
grant execute on function public.compras_sin_obra_de_clientes(uuid[], date, date, boolean) to authenticated, service_role;

-- ANALÍTICAS: EL COSTO, LO SIN OBRA Y LA CUENTA CORRIENTE, RECORTADOS POR PERÍODO Y POR OBRAS (17/09/2026).
--
-- El módulo Analíticas (pedido del dueño, 17/09/2026) filtra todo por un período sobre la FECHA DE
-- IMPUTACIÓN y por una lista de obras. Las tres definiciones que publica hoy la base no aceptan
-- ninguna de las dos cosas: `costo_de_obras_a_la_fecha(text[])` suma desde siempre,
-- `compras_sin_obra_de_clientes(uuid[])` también, y la vista `cliente_cuenta_corriente` no tiene
-- parámetros.
--
-- ═══ POR QUÉ NO SE COPIAN LAS CONSULTAS EN FUNCIONES NUEVAS ═══
--
-- Una copia con un `where fecha between` sería una SEGUNDA definición del costo de una obra, y la
-- primera vez que alguien arregle la regla a la fecha o la de subcontratos en una sola, la cartera y
-- Analíticas publicarían dos gastos distintos para la misma obra. Por eso la definición pasa a la
-- versión con rango, y la firma vieja DELEGA con el rango vacío: devuelve exactamente lo mismo que
-- antes (verificado en el ensayo comparando el jsonb de las 28 obras, byte por byte), y la app de
-- hoy no se entera.
--
-- ═══ CÓMO ENTRA CADA COSA AL RANGO ═══
--
--   · compras (materiales y subcontratos): por la fecha del comprobante, inclusive en los dos bordes.
--   · mano de obra: por QUINCENA. Entra la quincena que EMPIEZA dentro del rango. No se prorratea
--     una quincena por días —su costo es del recibo, no del día—, y con «empieza dentro» dos rangos
--     contiguos nunca cuentan la misma quincena dos veces.
--   · cuenta corriente: por la fecha de emisión del documento. La antigüedad sigue midiéndose a hoy.
--
-- ═══ EL PERMISO VIVE ACÁ, NO EN LA PANTALLA ═══
--
-- `analiticas_costos` es la única puerta de la pantalla y devuelve `null` a quien no ve economía
-- (`ve_economia()`), además de la RLS que ya filtran `costos_obra`, `compra_obra_asignada` y
-- `cobranzas`. Ocultar el destino del header no protege nada: la puerta sí.

-- ─── 1 · Mano de obra por quincena, con rango ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_mo_de_obras(p_obras text[], p_desde date, p_hasta date)
 RETURNS TABLE(quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid, horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric, estado text, origen text, destino text, sellado_en timestamp with time zone, reabierta boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with quincenas as (
    select g::date as desde
      from (select min(r.fecha) as primera from public.hh_que_cuentan_en_obra r
             where r.obra_canonica_id = any (p_obras) and r.fecha <= current_date) m
      cross join lateral generate_series(date_trunc('month', m.primera), current_date::timestamp, interval '1 day') g
     where m.primera is not null and extract(day from g) in (1, 16)
       -- LA QUINCENA ENTRA SI EMPIEZA DENTRO DEL RANGO: nunca se cuenta en dos rangos contiguos.
       and (p_desde is null or g::date >= p_desde)
       and (p_hasta is null or g::date <= p_hasta)
  )
  select x.quincena_desde, x.quincena_hasta, x.obra_canonica_id, x.persona_id, x.horas, x.costo_blanco,
         x.costo_negro, x.costo_total, x.estado, x.origen, x.destino, x.sellado_en, x.reabierta
    from quincenas qq
    cross join lateral public.costo_mo_quincena(qq.desde, p_obras) x
   where x.obra_canonica_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.costo_mo_de_obras(p_obras text[])
 RETURNS TABLE(quincena_desde date, quincena_hasta date, obra_canonica_id text, persona_id uuid, horas numeric, costo_blanco numeric, costo_negro numeric, costo_total numeric, estado text, origen text, destino text, sellado_en timestamp with time zone, reabierta boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select * from public.costo_mo_de_obras(p_obras, null::date, null::date)
$function$;

-- ─── 2 · El costo a la fecha por obra, con rango ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.* from public.costo_de_obra_filas(p_obras) f
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
                   else jsonb_build_object('desde', p_desde, 'hasta', p_hasta) end), '[]'::jsonb)
    from (select distinct unnest(p_obras) as obra_id) o
    left join materiales k on k.obra_id = o.obra_id
    left join mano_obra h on h.obra_id = o.obra_id
   where k.obra_id is not null or h.obra_id is not null
$function$;

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha(p_obras text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.costo_de_obras_a_la_fecha(p_obras, null::date, null::date)
$function$;

-- ─── 3 · Lo sin obra del cliente, con rango (nunca por obra: no tiene) ───────────────────────────
CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[], p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with filas as (
    select f.* from public.costo_de_obra_filas(null, p_clientes) f
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

CREATE OR REPLACE FUNCTION public.compras_sin_obra_de_clientes(p_clientes uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.compras_sin_obra_de_clientes(p_clientes, null::date, null::date)
$function$;

-- ─── 4 · La cuenta corriente, con rango de emisión ────────────────────────────────────────────────
-- La vista pasa a leer la función con el rango vacío: misma definición, mismas columnas, mismo
-- `security_invoker` (la RLS de `cobranzas` y `certificado_cliente` sigue mandando).
CREATE OR REPLACE FUNCTION public.cuenta_corriente_de_clientes(p_desde date, p_hasta date)
 RETURNS TABLE(cliente_id uuid, nombre_comercial text, saldo numeric, vencido numeric, por_vencer numeric,
               comprobantes_pendientes bigint, aging_por_vencer numeric, aging_1_30 numeric, aging_31_60 numeric,
               aging_61_90 numeric, aging_mas_90 numeric, facturado_90d numeric, cobrado_90d numeric,
               cobrado_total numeric, cobrado_neto_total numeric, dso numeric, efectividad_pct numeric,
               dias_cobro_promedio numeric, fondo_reparo numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 WITH base AS (
         SELECT c.cliente_id,
            c.total_bruto AS total,
            c.monto_neto,
            c.estado,
            c.fecha_cobro,
            c.fecha_emision,
            c.estado = ANY (ARRAY['Pendiente'::text, 'Facturado'::text]) AS es_deuda,
            es_cobrada(c.estado, c.fecha_cobro) AS es_cobrado,
            estado_de_cobro(c.estado, c.fecha_cobro, h.hoy) = 'vencido'::text AS es_vencido,
            - dias_para_cobro(c.fecha_cobro, h.hoy) AS dias_atraso
           FROM cobranzas c
             CROSS JOIN ( SELECT hoy_san_juan() AS hoy) h
          WHERE c.cliente_id IS NOT NULL AND c.total_bruto IS NOT NULL AND c.estado <> 'CANCELAR'::text
            AND (p_desde IS NULL OR c.fecha_emision >= p_desde)
            AND (p_hasta IS NULL OR c.fecha_emision <= p_hasta)
        )
 SELECT b.cliente_id,
    cl.nombre_comercial,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda), 0::numeric) AS saldo,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric) AS vencido,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda AND NOT b.es_vencido), 0::numeric) AS por_vencer,
    count(*) FILTER (WHERE b.es_deuda) AS comprobantes_pendientes,
    COALESCE(sum(b.total) FILTER (WHERE b.es_deuda AND NOT b.es_vencido), 0::numeric) AS aging_por_vencer,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 1 AND b.dias_atraso <= 30), 0::numeric) AS aging_1_30,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 31 AND b.dias_atraso <= 60), 0::numeric) AS aging_31_60,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso >= 61 AND b.dias_atraso <= 90), 0::numeric) AS aging_61_90,
    COALESCE(sum(b.total) FILTER (WHERE b.es_vencido AND b.dias_atraso > 90), 0::numeric) AS aging_mas_90,
    COALESCE(sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)), 0::numeric) AS facturado_90d,
    COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) AS cobrado_90d,
    sum(b.total) FILTER (WHERE b.es_cobrado) AS cobrado_total,
    sum(b.monto_neto) FILTER (WHERE b.es_cobrado) AS cobrado_neto_total,
        CASE
            WHEN COALESCE(sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)), 0::numeric) > 0::numeric THEN round(COALESCE(sum(b.total) FILTER (WHERE b.es_deuda), 0::numeric) / sum(b.total) FILTER (WHERE b.fecha_emision >= (CURRENT_DATE - 90)) * 90::numeric, 1)
            ELSE NULL::numeric
        END AS dso,
        CASE
            WHEN (COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) + COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric)) > 0::numeric THEN round(100.0 * COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) / (COALESCE(sum(b.total) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90)), 0::numeric) + COALESCE(sum(b.total) FILTER (WHERE b.es_vencido), 0::numeric)), 1)
            ELSE NULL::numeric
        END AS efectividad_pct,
    round(avg(b.fecha_cobro - b.fecha_emision) FILTER (WHERE b.es_cobrado AND b.fecha_cobro >= (CURRENT_DATE - 90) AND b.fecha_emision IS NOT NULL), 1) AS dias_cobro_promedio,
    COALESCE(( SELECT sum(cc.reparo) AS sum
           FROM certificado_cliente cc
          WHERE cc.cliente_id = b.cliente_id AND cc.estado <> 'cobrado'::text), 0::numeric) AS fondo_reparo
   FROM base b
     JOIN clientes cl ON cl.id = b.cliente_id
  GROUP BY b.cliente_id, cl.nombre_comercial
$function$;

CREATE OR REPLACE VIEW public.cliente_cuenta_corriente WITH (security_invoker = true) AS
  SELECT * FROM public.cuenta_corriente_de_clientes(NULL::date, NULL::date);

-- ─── 5 · La puerta de la pantalla ────────────────────────────────────────────────────────────────
-- `p_obras` NULL = todas las obras que el rol ve. Lo sin obra se recorta por período y NUNCA por obra.
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
                 coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)), p_desde, p_hasta),
      'sin_obra', public.compras_sin_obra_de_clientes(
                 (select array_agg(c.cliente_id) from public.cliente_panel c), p_desde, p_hasta),
      'cuenta_corriente', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                             from public.cuenta_corriente_de_clientes(p_desde, p_hasta) k)
    )
  end
$function$;

revoke all on function public.costo_mo_de_obras(text[], date, date) from public, anon;
revoke all on function public.costo_de_obras_a_la_fecha(text[], date, date) from public, anon;
revoke all on function public.compras_sin_obra_de_clientes(uuid[], date, date) from public, anon;
revoke all on function public.cuenta_corriente_de_clientes(date, date) from public, anon;
revoke all on function public.analiticas_costos(date, date, text[]) from public, anon;
grant execute on function public.costo_mo_de_obras(text[], date, date) to authenticated, service_role;
grant execute on function public.costo_de_obras_a_la_fecha(text[], date, date) to authenticated, service_role;
grant execute on function public.compras_sin_obra_de_clientes(uuid[], date, date) to authenticated, service_role;
grant execute on function public.cuenta_corriente_de_clientes(date, date) to authenticated, service_role;
grant execute on function public.analiticas_costos(date, date, text[]) to authenticated, service_role;
grant select on public.cliente_cuenta_corriente to authenticated;

-- LO QUE LEE LA APP PUBLICADA VUELVE A RESPONDER COMO AYER (18/09/2026, auditoría).
--
-- ═══ EL DAÑO ═══
--
-- 20260918T0900 (hoy renombrada T1201) cambió la respuesta de `costo_de_obras_a_la_fecha` y
-- `analiticas_consumo_mensual`: materiales dejó de incluir alquileres, servicios, combustible y
-- fletes, que pasaron a una clave `otros`. 20260918T0925 (hoy T1206) cambió
-- `obra_economia.costo_objetivo`. Las tres las lee el código PUBLICADO (origin/main c7db71df), que no
-- conoce `otros`: en producción desaparecieron $ 22,6 M de costo de la ficha del cliente y de
-- Analíticas, y la ficha de la obra pasó a comparar otro número. La base se adelantó al código.
--
-- LA REGLA DESDE HOY: una migración que cambia lo que responde un objeto que la app publicada ya lee
-- no se aplica antes de que el código que la sabe leer esté publicado. Los objetos NUEVOS, sí.
--
-- ═══ QUÉ HACE ═══
--
--   1. Devuelve las tres a su cuerpo EXACTO de antes (copiado de 20260917T1900 y 20260917T1700).
--   2. Pone la lectura en cuatro rubros en objetos NUEVOS, que sólo lee el código de la rama
--      `analiticas-contratado-vs-gastado`: `costo_de_obras_a_la_fecha_rubros`,
--      `analiticas_costos_rubros`, `analiticas_consumo_mensual_rubros` (los cuerpos que T0900 había
--      puesto en las viejas). Cuando la rama se publique, una migración posterior retira el duplicado.
set local lock_timeout = '5s';

-- ── 1 · lo publicado, como estaba ────────────────────────────────────────────────────────────────
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

create or replace view public.obra_economia with (security_invoker = true) as
 WITH adic AS (
         SELECT adicionales.obra_canonica_id AS obra_id,
            sum(adicionales.monto_aprobado) AS adicionales_aprobados,
            (count(*))::integer AS n_adicionales_aprobados
           FROM adicionales
          WHERE ((adicionales.obra_canonica_id IS NOT NULL) AND (adicionales.fecha_aprobacion IS NOT NULL) AND (adicionales.monto_aprobado IS NOT NULL))
          GROUP BY adicionales.obra_canonica_id
        ), pres AS (
         -- SÓLO EL APROBADO. 'reemplazado' y 'cotizado' no son la línea de base de nadie.
         SELECT DISTINCT ON (p.obra_canonica_id) p.obra_canonica_id AS obra_id,
            p.costo_directo_presupuestado,
            p.costo_indirecto_presupuestado,
            p.costo_pendiente_motivo,
            p.version,
            p.estado
           FROM presupuestos p
          WHERE ((p.obra_canonica_id IS NOT NULL) AND (p.estado = 'aprobado'::text))
          ORDER BY p.obra_canonica_id, p.version DESC
        ), venta AS (
         SELECT oc_1.id AS obra_id,
            contratado_de_obra(oc_1.id) AS venta_contratada
           FROM obra_canonica oc_1
        )
 SELECT oc.id AS obra_id,
    oc.nombre AS obra,
    v.venta_contratada,
    a.adicionales_aprobados,
    COALESCE(a.n_adicionales_aprobados, 0) AS n_adicionales_aprobados,
        CASE
            WHEN (v.venta_contratada IS NOT NULL) THEN (v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric))
            ELSE NULL::numeric
        END AS venta_total,
    COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado) AS costo_objetivo,
        CASE
            WHEN (fe.costo_cotizado IS NOT NULL) THEN (('partidas congeladas convertidas a esta obra ('::text || fe.n_partidas_congeladas) || ')'::text)
            WHEN (pr.costo_directo_presupuestado IS NOT NULL) THEN (((('costo directo del presupuesto v'::text || pr.version) || ' ('::text) || pr.estado) || ')'::text)
            WHEN (pr.costo_pendiente_motivo IS NOT NULL) THEN (((('presupuesto v'::text || pr.version) || ' aprobado sin costo cotizado: '::text) || pr.costo_pendiente_motivo))
            ELSE 'sin presupuesto congelado convertido y sin presupuesto cargado para esta obra'::text
        END AS costo_objetivo_origen,
    ocr.costo_real,
    ocr.n_comprobantes AS costo_real_n_comprobantes,
    ocr.costo_mano_de_obra AS costo_real_mano_de_obra,
    NULL::numeric AS costo_comprometido,
    'no hay fuente: obligaciones.obra_id apunta a la tabla legacy `obras` y está en NULL en las filas que existen, y cheques.obra guarda la unidad de negocio, no la obra'::text AS costo_comprometido_estado,
        CASE
            WHEN (fe.costo_proyectado_inferido IS NOT NULL) THEN round((fe.costo_proyectado_inferido - COALESCE(ocr.costo_real, (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS costo_restante_proyectado,
    fe.costo_proyectado_inferido AS costo_final_proyectado,
    fe.base_de_la_proyeccion AS base_del_forecast,
        CASE
            -- Venta − costo directo − GASTOS GENERALES. Por la vía de partidas congeladas no hay GG
            -- declarados: ahí se resta sólo el costo cotizado (límite documentado, no un cero inventado).
            WHEN ((v.venta_contratada IS NOT NULL) AND (COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado) IS NOT NULL)) THEN (((v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric)) - COALESCE(fe.costo_cotizado, pr.costo_directo_presupuestado)) -
            CASE
                WHEN (fe.costo_cotizado IS NULL) THEN COALESCE(pr.costo_indirecto_presupuestado, (0)::numeric)
                ELSE (0)::numeric
            END)
            ELSE NULL::numeric
        END AS margen_cotizado,
        CASE
            WHEN ((v.venta_contratada IS NOT NULL) AND (fe.costo_proyectado_inferido IS NOT NULL)) THEN ((v.venta_contratada + COALESCE(a.adicionales_aprobados, (0)::numeric)) - fe.costo_proyectado_inferido)
            ELSE NULL::numeric
        END AS margen_final_proyectado,
    ce.certificado,
    ce.facturado,
    cob.cobrado,
    cob.cobrado_neto,
    cob.por_cobrar_proyectado,
    COALESCE(cob.n_cobranzas, 0) AS n_cobranzas,
        CASE
            WHEN ((fe.costo_cotizado IS NULL) AND (pr.costo_directo_presupuestado IS NOT NULL)) THEN pr.costo_indirecto_presupuestado
            ELSE NULL::numeric
        END AS costo_indirecto_objetivo
   FROM (((((((obra_canonica oc
     JOIN venta v ON ((v.obra_id = oc.id)))
     LEFT JOIN adic a ON ((a.obra_id = oc.id)))
     LEFT JOIN pres pr ON ((pr.obra_id = oc.id)))
     LEFT JOIN obra_costo_real ocr ON ((ocr.obra_id = oc.id)))
     LEFT JOIN obra_forecast_economico fe ON ((fe.obra_id = oc.id)))
     LEFT JOIN obra_cobranza cob ON ((cob.obra_id = oc.id)))
     LEFT JOIN ( SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado
           FROM certificados
          WHERE (certificados.obra_canonica_id IS NOT NULL)
          GROUP BY certificados.obra_canonica_id) ce ON ((ce.obra_id = oc.id)));

-- ── 2 · los cuatro rubros, en objetos nuevos ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha_rubros(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.*, public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro
      from public.costo_de_obra_filas_iva(p_obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  materiales as (
    select f.obra_id,
           sum(f.a_la_fecha) filter (where f.rubro = 'materiales')                   as materiales,
           sum(f.a_la_fecha) filter (where f.rubro = 'subcontratistas')              as subcontratos,
           sum(f.a_la_fecha) filter (where f.rubro = 'otros')                        as otros,
           count(*)          filter (where f.rubro = 'materiales')::int              as n_comprobantes,
           count(*)          filter (where f.rubro = 'subcontratistas')::int         as n_subcontratos,
           count(*)          filter (where f.rubro = 'otros')::int                   as n_otros,
           max(f.fecha)      filter (where f.rubro <> 'subcontratistas')             as ultimo_comprobante,
           count(*)          filter (where f.tomado_al_total)::int                   as n_sin_iva_discriminado,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'materiales'), 0)        as materiales_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'subcontratistas'), 0)   as subcontratos_por_vencer,
           nullif(sum(f.por_vencer) filter (where f.rubro = 'otros'), 0)             as otros_por_vencer,
           nullif(sum(f.por_vencer), 0)                                              as comprometido_futuro,
           jsonb_agg(jsonb_build_object(
                       'proveedor', f.proveedor, 'comprobante', f.comprobante, 'fecha', f.fecha,
                       'total', f.total, 'a_la_fecha', f.a_la_fecha, 'por_vencer', f.por_vencer,
                       'motivo', coalesce(f.motivo_subcontrato, 'familia'))
                     order by f.a_la_fecha desc)
             filter (where f.rubro = 'subcontratistas')                              as subcontratos_detalle
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
           'materiales', k.materiales, 'subcontratos', k.subcontratos, 'otros', k.otros,
           'n_comprobantes', k.n_comprobantes, 'n_subcontratos', coalesce(k.n_subcontratos, 0), 'n_otros', coalesce(k.n_otros, 0),
           'subcontratos_detalle', coalesce(k.subcontratos_detalle, '[]'::jsonb),
           'ultimo_comprobante', k.ultimo_comprobante,
           'comprometido_futuro', k.comprometido_futuro,
           'materiales_por_vencer', k.materiales_por_vencer, 'subcontratos_por_vencer', k.subcontratos_por_vencer,
           'otros_por_vencer', k.otros_por_vencer,
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

CREATE OR REPLACE FUNCTION public.analiticas_consumo_mensual_rubros(p_obras text[] DEFAULT NULL::text[])
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
           sum(f.a_la_fecha) filter (where r.rubro = 'materiales')      as materiales,
           sum(f.a_la_fecha) filter (where r.rubro = 'subcontratistas') as subcontratos,
           sum(f.a_la_fecha) filter (where r.rubro = 'otros')           as otros
      from ids cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, true) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
      cross join lateral (select public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro) r
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
                   'materiales', c.materiales, 'subcontratos', c.subcontratos, 'otros', c.otros,
                   'mano_obra', h.mano_obra, 'mano_obra_estimada', h.mano_obra_estimada)
                 order by coalesce(c.obra_id, h.obra_id), coalesce(c.mes, h.mes)), '[]'::jsonb)
            from compras c
            full join mano_obra h on h.obra_id = c.obra_id and h.mes = c.mes)
  end
$function$;

CREATE OR REPLACE FUNCTION public.analiticas_costos_rubros(p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_obras text[] DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when not coalesce((select public.ve_economia()), false) then null::jsonb
    else jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'corte', current_date,
      'obras', public.costo_de_obras_a_la_fecha_rubros(
                 coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)), p_desde, p_hasta, true),
      'sin_obra', public.compras_sin_obra_de_clientes(
                 (select array_agg(c.cliente_id) from public.cliente_panel c), p_desde, p_hasta, true),
      'cuenta_corriente', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                             from public.cuenta_corriente_de_clientes(p_desde, p_hasta) k)
    )
  end
$function$;

revoke all on function public.costo_de_obras_a_la_fecha_rubros(text[], date, date, boolean) from public, anon;
revoke all on function public.analiticas_consumo_mensual_rubros(text[]) from public, anon;
revoke all on function public.analiticas_costos_rubros(date, date, text[]) from public, anon;
grant execute on function public.costo_de_obras_a_la_fecha_rubros(text[], date, date, boolean) to authenticated, service_role;
grant execute on function public.analiticas_consumo_mensual_rubros(text[]) to authenticated, service_role;
grant execute on function public.analiticas_costos_rubros(date, date, text[]) to authenticated, service_role;

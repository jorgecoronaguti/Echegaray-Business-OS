-- EL RUBRO DE UN COMPROBANTE, CON EVIDENCIA; Y EL DETALLE DEL CRM, EN LOS CUATRO RUBROS (18/09/2026).
--
-- ═══ D8 DE LA AUDITORÍA: «SIN CLASIFICAR» NO ES MATERIAL ═══
--
-- `rubro_de_compra` de T1201 mandaba a materiales todo lo que no tuviera familia: 54 comprobantes y
-- $ 20,58 M, entre ellos el servicio de limpieza de Femenia en Quattropani ($ 3,16 M), el abono de agua
-- de Ruviño, los viajes de camión regador y un servicio de higiene y seguridad. Y una compra de cal y
-- tanza a Corralón Progreso cayó en subcontratistas porque Compras la cargó con la familia
-- «Subcontratos y mano de obra». La regla nueva usa lo que el comprobante DICE, en este orden:
--
--   1. proveedor marcado «Subcontratista» en su ficha                        → subcontratistas
--   2. familia «Subcontratos y mano de obra», SALVO que el proveedor sea un corralón, una ferretería
--      o una pinturería (venden materiales, no mano de obra)                  → subcontratistas
--   3. familia de servicio/equipo/combustible (alquiler y traslado de equipos, servicios de obra,
--      combustible de obra)                                                   → otros
--   4. SIN familia o «SIN CLASIFICAR», y el concepto o el detalle de obra dicen servicio, limpieza,
--      agua, abono, viaje, flete, traslado, camión, higiene y seguridad (HyS), alquiler, honorarios,
--      combustible                                                            → otros
--   5. sin familia y un sub-rubro de servicio o vehículo                      → otros
--   6. todo lo demás                                                          → materiales
--
-- Lo que llega a un rubro por el concepto (regla 4) se sigue viendo como «SIN CLASIFICAR en Compras»
-- en el detalle: la pantalla no esconde que la clasificación la hizo el OS y no Compras.
--
-- ═══ D4: EL PANEL DE DETALLE DEL CRM NO CERRABA CON SU CELDA ═══
--
-- `detalle_costo_de_obra` (la lee la app publicada: NO se toca) arma «materiales» con todo lo que no
-- es subcontrato por proveedor. La celda de la rama separa «otros», así que en 11 obras el panel decía
-- «no cierra con la celda». `detalle_costo_de_obra_rubros` usa la MISMA regla que la celda
-- (`rubro_de_compra`), con IVA como la celda, y abre también «otros». Mano de obra y HH delegan en la
-- función de siempre.
--
-- Todos los objetos que cambian acá los lee SÓLO el código de esta rama; lo publicado no los conoce.
set local lock_timeout = '5s';

create or replace function public.rubro_de_compra(p_es_subcontrato boolean, p_familia text, p_sub_rubro text, p_texto text, p_proveedor text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_es_subcontrato, false) then 'subcontratistas'
    when p_familia = 'Subcontratos y mano de obra'
     and coalesce(p_proveedor, '') !~* '(corral|ferreter|pinturer)' then 'subcontratistas'
    when p_familia in ('Alquiler y traslado de equipos', 'Servicios de obra (baño, contenedor, agua)', 'Combustible de obra')
      then 'otros'
    when coalesce(nullif(btrim(p_familia), ''), 'SIN CLASIFICAR') = 'SIN CLASIFICAR'
     and coalesce(p_texto, '') ~* '(servicio|serv\.? ?hys|higiene|seguridad|limpieza|\magua\M|abono|bidon|dispenser|viaje|flete|traslado|cami[oó]n|alquiler|honorario|combustible|nafta|gas ?oil)'
      then 'otros'
    when p_familia is null
     and p_sub_rubro in ('Combustible', 'Honorarios y servicios', 'Oficina e informática', 'Vehículos y taller', 'Equipos y rodados (inversión)')
      then 'otros'
    else 'materiales'
  end
$$;
comment on function public.rubro_de_compra(boolean, text, text, text, text) is
  'El rubro de un comprobante de Compras imputado a una obra, con evidencia: proveedor subcontratista; familia de subcontratos salvo corralón/ferretería/pinturería; familia de servicio/equipo/combustible; SIN CLASIFICAR con concepto de servicio → otros; el resto materiales. Ver 20260918T1510.';
revoke all on function public.rubro_de_compra(boolean, text, text, text, text) from public, anon;
grant execute on function public.rubro_de_compra(boolean, text, text, text, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.costo_de_obras_a_la_fecha_rubros(p_obras text[], p_desde date, p_hasta date, p_neto boolean)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  filas as (
    select f.*, public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro
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
      cross join lateral (select public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro) r
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

create or replace function public.costo_de_obras_por_rubro(p_obras text[], p_desde date default null, p_hasta date default null, p_neto boolean default true)
returns table (obra_id text, rubro text, monto numeric, monto_estimado numeric, n integer, detalle jsonb)
language sql
stable
set search_path to 'public'
as $$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  filas as materialized (
    select f.obra_id, f.fecha, f.a_la_fecha, f.proveedor,
           public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro,
           coalesce(nullif(nullif(btrim(s.familia_material), ''), 'SIN CLASIFICAR'), nullif(btrim(s.sub_rubro), ''), 'SIN CLASIFICAR en Compras') as familia
      from ids
      cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
  ),
  compras as (
    select f.obra_id, f.rubro, sum(f.a_la_fecha) as monto, null::numeric as monto_estimado, count(*)::int as n,
           (select coalesce(jsonb_agg(jsonb_build_object('grupo', g.grupo, 'n', g.n, 'monto', g.monto) order by g.monto desc), '[]'::jsonb)
              from (select case when x.rubro = 'subcontratistas' then coalesce(x.proveedor, 'sin proveedor') else x.familia end as grupo,
                           count(*)::int as n, sum(x.a_la_fecha) as monto
                      from filas x
                     where x.obra_id = f.obra_id and x.rubro = f.rubro
                     group by 1) g) as detalle
      from filas f
     group by f.obra_id, f.rubro
  ),
  mo_filas as materialized (
    select m.* from ids cross join lateral public.costo_mo_de_obras(ids.obras, p_desde, p_hasta) m
  ),
  mo_q as (
    select m.obra_canonica_id as obra_id, m.quincena_desde, m.quincena_hasta,
           count(distinct m.persona_id) filter (where m.estado <> 'falta_dato')::int as personas,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as monto,
           sum(m.horas) filter (where m.estado <> 'falta_dato') as horas,
           sum(m.horas) filter (where m.estado = 'falta_dato') as horas_sin_dato,
           bool_or(m.estado = 'estimado') as estimado,
           sum(m.costo_total) filter (where m.estado = 'estimado') as monto_estimado
      from mo_filas m
     group by 1, 2, 3
  ),
  mo as (
    select q.obra_id, 'mano_obra'::text as rubro, sum(q.monto) as monto, nullif(sum(q.monto_estimado), 0) as monto_estimado,
           count(*)::int as n,
           jsonb_agg(jsonb_build_object(
             'grupo', to_char(q.quincena_desde, 'DD/MM') || ' a ' || to_char(q.quincena_hasta, 'DD/MM/YY'),
             'n', q.personas, 'monto', q.monto, 'horas', q.horas, 'estimado', q.estimado,
             'horas_sin_dato', nullif(q.horas_sin_dato, 0)) order by q.quincena_desde) as detalle
      from mo_q q
     group by q.obra_id
  )
  select t.obra_id, t.rubro, t.monto, t.monto_estimado, t.n, t.detalle
    from (select * from compras union all select * from mo) t
   where coalesce((select public.ve_economia()), false) or (select auth.uid()) is null
   order by t.obra_id, t.rubro
$$;

create or replace function public.detalle_costo_de_obra_rubros(p_obra text, p_rubro text)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select case
    when not public.es_administracion() then null::jsonb
    when p_rubro in ('materiales', 'subcontratos', 'otros') then (
      select jsonb_build_object(
               'obra_id', p_obra, 'rubro', p_rubro, 'corte', current_date,
               'total', coalesce(sum(x.a_la_fecha), 0), 'por_vencer', coalesce(sum(x.por_vencer), 0),
               'n', count(*),
               'filas', coalesce(jsonb_agg(jsonb_build_object(
                          'referencia', x.referencia, 'sheet_id', x.sheet_id, 'fila', x.fila,
                          'fecha', x.fecha, 'fecha_prevista', x.fecha_prevista, 'estado', x.estado,
                          'proveedor', x.proveedor, 'comprobante', x.comprobante, 'concepto', x.concepto,
                          'familia', x.familia,
                          'total', x.total, 'a_la_fecha', x.a_la_fecha, 'por_vencer', x.por_vencer)
                        order by x.fecha desc nulls last, x.fila desc nulls last), '[]'::jsonb))
        from (
          select f.*, s.familia_material as familia,
                 public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro, concat_ws(' ', f.concepto, f.detalle_obra), f.proveedor) as rubro
            from public.costo_de_obra_filas(array[p_obra]) f
            left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
        ) x
       where x.rubro = case p_rubro when 'subcontratos' then 'subcontratistas' else p_rubro end)
    else public.detalle_costo_de_obra(p_obra, p_rubro)
  end
$$;
comment on function public.detalle_costo_de_obra_rubros(text, text) is
  'El detalle de una celda de costo del CRM en los cuatro rubros, con la misma regla (rubro_de_compra) y la misma base (con IVA, a la fecha) que la celda. Mano de obra y HH delegan en detalle_costo_de_obra.';
revoke all on function public.detalle_costo_de_obra_rubros(text, text) from public, anon;
grant execute on function public.detalle_costo_de_obra_rubros(text, text) to authenticated, service_role;

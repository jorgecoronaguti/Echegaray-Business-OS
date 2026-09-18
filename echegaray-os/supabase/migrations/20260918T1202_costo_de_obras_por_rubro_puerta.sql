-- `costo_de_obras_por_rubro`: LA MISMA PUERTA QUE `obra_economia_cartera` (18/09/2026).
--
-- La versión de 20260918T0900 devolvía NADA cuando `ve_economia()` era false, y `ve_economia()` es false
-- sin sesión: el orquestador (rol postgres, sin `auth.uid()`) y cualquier script de verificación leían
-- cero filas y no podían distinguir «no hay consumo» de «no tengo permiso». La vista de la cartera ya
-- resuelve eso con `ve_economia() or auth.uid() is null`; acá se copia esa regla. Un usuario con sesión
-- y sin economía sigue sin ver nada.
set local lock_timeout = '5s';

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
           public.rubro_de_compra(f.es_subcontrato, s.familia_material, s.sub_rubro) as rubro,
           coalesce(nullif(btrim(s.familia_material), ''), nullif(btrim(s.sub_rubro), ''), 'sin familia') as familia
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

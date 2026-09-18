-- EL COSTO DE CADA OBRA POR TIPO DE COSTO: DIRECTO CONTRA INDIRECTO (dueño, 18/09/2026).
--
-- ═══ EL PEDIDO ═══
--
-- «Necesito la columna tipo de cobro de pestaña Compras de Sheet Flujo de Fondos esté guardada en
-- Supabase y sea un concepto a mostrar por obra, desglosado y referenciado en todo Analíticas según
-- corresponda.» La columna es «Tipo de Costo» (ya vive en `compra_sheet.tipo_costo`, sincronizada del
-- Sheet). Y el modelo del dueño, textual: «lo indirecto es lo que estás considerando estructura».
--
--   Directo    la compra impacta en una obra concreta.
--   Indirecto  compra de la empresa que no es de una obra: Administración y Taller.
--   Estructura NO es una compra (nómina, impuestos, ARCA, sindicatos, banco): el dueño pidió sacarlo
--              de Compras a sus pestañas; está en mudanza. Si una fila «Estructura» tiene obra, se
--              publica APARTE con ese nombre y NO se suma al costo de la obra.
--
-- ═══ LA REGLA, UNA VEZ ═══
--
--   · compras: `costo_de_obra_filas_iva` (a la fecha, neto si se pide) × `compra_sheet.tipo_costo`.
--     Sin tipo de costo → 'sin tipo' (se dice, no se asume Directo).
--   · mano de obra propia (`costo_mo_de_obras`): DIRECTO por definición —son las horas de la obra—.
--     No viene de Compras: su tipo lo fija esta función y lo dice `origen`.
--
-- NO SE APLICA A PRODUCCIÓN DESDE LA RAMA (regla del 18/09): ningún objeto publicado la lee todavía.
set local lock_timeout = '5s';

create or replace function public.costo_de_obras_por_tipo_costo(p_obras text[], p_desde date default null, p_hasta date default null, p_neto boolean default true)
returns table (obra_id text, tipo_costo text, en_costo boolean, monto numeric, n integer, origen text)
language sql
stable
set search_path to 'public'
as $$
  with
  ids as (
    select coalesce(p_obras, (select array_agg(o.obra_id) from public.obra_panel o)) as obras
  ),
  compras as (
    select f.obra_id,
           case when s.tipo_costo in ('Directo', 'Indirecto', 'Estructura') then s.tipo_costo else 'sin tipo' end as tipo_costo,
           sum(f.a_la_fecha) as monto, count(*)::int as n
      from ids
      cross join lateral public.costo_de_obra_filas_iva(ids.obras, null, p_neto) f
      left join public.compra_sheet s on coalesce(s.sheet_id::text, s.fila::text) = f.referencia
     where (p_desde is null or f.fecha >= p_desde)
       and (p_hasta is null or f.fecha <= p_hasta)
     group by 1, 2
  ),
  mo as (
    select m.obra_canonica_id as obra_id, 'Directo'::text as tipo_costo,
           sum(m.costo_total) filter (where m.estado <> 'falta_dato') as monto,
           count(distinct m.quincena_desde)::int as n
      from ids cross join lateral public.costo_mo_de_obras(ids.obras, p_desde, p_hasta) m
     group by 1
  )
  select t.obra_id, t.tipo_costo,
         -- ESTRUCTURA NO ES COSTO DE LA OBRA: está en mudanza fuera de Compras. Se publica y no se suma.
         t.tipo_costo <> 'Estructura' as en_costo,
         t.monto, t.n, t.origen
    from (
      select c.obra_id, c.tipo_costo, c.monto, c.n, 'Compras · columna Tipo de Costo'::text as origen from compras c
      union all
      select m.obra_id, m.tipo_costo, m.monto, m.n, 'mano de obra propia por quincena: directo por definición'::text from mo m where m.monto is not null
    ) t
   where coalesce((select public.es_administracion()), false) or coalesce((select public.ve_economia()), false) or (select auth.uid()) is null
   order by t.obra_id, t.tipo_costo
$$;
comment on function public.costo_de_obras_por_tipo_costo(text[], date, date, boolean) is
  'El costo de cada obra por Tipo de Costo de Compras (Directo · Indirecto), con la mano de obra propia como directo; «Estructura» con obra se publica aparte con en_costo = false (no es compra, está en mudanza). Misma base a la fecha que costo_de_obras_a_la_fecha.';
revoke all on function public.costo_de_obras_por_tipo_costo(text[], date, date, boolean) from public, anon;
grant execute on function public.costo_de_obras_por_tipo_costo(text[], date, date, boolean) to authenticated, service_role;

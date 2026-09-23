-- ERP OBRAS · H2.1 (corrección) — LAS HOJAS DE UNA HISTORIA SE BUSCAN POR `actividad_padre_id`.
--
-- 20260923T2300 las buscaba por prefijo de `obra_wbs.ruta_orden`. El test lo delató: dos hermanas
-- con el mismo `orden` tienen la MISMA ruta, y cada historia sumaba las tareas de las demás (83,3 en
-- vez de 87,5). La relación padre-hija es la única que no miente; la ruta era un atajo.

create or replace view public.obra_historia_peso
with (security_invoker = true) as
with recursive historias as (
  select w.actividad_id, w.obra_id, w.nombre, w.nivel, a.costo_mo, a.hh_plan, a.inicio_plan, a.fin_plan
    from public.obra_wbs w
    join public.obra_actividad a on a.id = w.actividad_id
   where not coalesce(w.archivada, false)
     and (w.nivel = 2 or a.costo_mo is not null)
),
descendientes as (
  select h.actividad_id as historia_id, a.id
    from historias h
    join public.obra_actividad a on a.actividad_padre_id = h.actividad_id
  union all
  select d.historia_id, a.id
    from descendientes d
    join public.obra_actividad a on a.actividad_padre_id = d.id
),
hojas as (
  select d.historia_id,
         avg(av.avance_pct) as avance_pct,
         count(*) filter (where av.avance_pct is not null) as n_medidas,
         count(*) as n_hojas
    from descendientes d
    join public.obra_wbs w on w.actividad_id = d.id and not w.tiene_hijas and not coalesce(w.archivada, false)
    left join public.actividad_avance av on av.actividad_id = d.id
   group by d.historia_id
),
totales as (
  select obra_id,
         sum(costo_mo) as costo_mo_total,
         sum(hh_plan) filter (where hh_plan is not null) as hh_plan_total,
         sum(public.dias_habiles(obra_id, inicio_plan, fin_plan)) filter (where inicio_plan is not null and fin_plan is not null) as dias_teoricos_total,
         count(*) as n_historias
    from historias
   group by obra_id
)
select h.actividad_id, h.obra_id, h.nombre, h.costo_mo,
       o.metodo_ponderacion,
       case o.metodo_ponderacion
         when 'costo_mo' then case when h.costo_mo is not null and t.costo_mo_total > 0 then h.costo_mo / t.costo_mo_total end
         when 'parejo' then 1.0 / nullif(t.n_historias, 0)
         when 'hh_plan' then case when h.hh_plan is not null and t.hh_plan_total > 0 then h.hh_plan / t.hh_plan_total end
         when 'dias_teoricos' then case when h.inicio_plan is not null and h.fin_plan is not null and t.dias_teoricos_total > 0
                                        then public.dias_habiles(h.obra_id, h.inicio_plan, h.fin_plan)::numeric / t.dias_teoricos_total end
         else null
       end as peso,
       (h.costo_mo is null) as sin_costo,
       coalesce(l.avance_pct, 0) as avance_pct,
       coalesce(l.n_medidas, 0)::int as n_medidas,
       coalesce(l.n_hojas, 0)::int as n_hojas
  from historias h
  join public.obra_canonica o on o.id = h.obra_id
  left join totales t on t.obra_id = h.obra_id
  left join hojas l on l.historia_id = h.actividad_id;

grant select on public.obra_historia_peso to authenticated;

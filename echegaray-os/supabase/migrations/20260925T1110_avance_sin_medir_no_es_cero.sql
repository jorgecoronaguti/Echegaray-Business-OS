-- ERP OBRAS · UNA OBRA SIN NINGUNA TAREA MEDIDA NO AVANZÓ 0 %: NO SE MIDIÓ.
--
-- Con el primer costo de MO cargado desde un presupuesto (pilon, 25/09) la obra pasó a pesar y
-- `obra_avance_ponderado` publicó «0,0 %» con 0 de 1 tareas medidas. Sin ninguna medición el avance es
-- NULL («sin medir»), como pide el diseño: «sin registrar», nunca 0. Con al menos una medida, la
-- cuenta sigue igual (una tarea sin registro aporta 0 a su historia).
create or replace view public.obra_avance_ponderado
with (security_invoker = true) as
select obra_id,
       max(metodo_ponderacion) as metodo,
       case when coalesce(sum(peso), 0) > 0 and sum(n_medidas) > 0 then round(sum(avance_pct * coalesce(peso, 0)), 1) end as avance_pct,
       sum(costo_mo) as costo_mo_total,
       case when coalesce(sum(peso), 0) > 0 and sum(n_medidas) > 0 then round(sum(avance_pct * coalesce(peso, 0)) / 100 * sum(costo_mo), 0) end as costo_teorico,
       count(*)::int as n_historias,
       count(*) filter (where sin_costo)::int as n_historias_sin_costo,
       round(100 * (1 - coalesce(sum(peso), 0)), 1) as pct_sin_peso,
       sum(n_medidas)::int as n_items_medidos,
       sum(n_hojas)::int as n_items
  from public.obra_historia_peso
 group by obra_id;

grant select on public.obra_avance_ponderado to authenticated;

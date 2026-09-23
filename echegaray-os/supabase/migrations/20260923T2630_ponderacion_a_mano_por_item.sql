-- ERP OBRAS · C04/C05 — LA PONDERACIÓN A MANO VIVE EN CADA ÍTEM (diseño aprobado, 23/09/2026).
--
-- C05 reparte el peso ENTRE HERMANAS: «cada nivel suma 100 % entre hermanas». H2 (20260923T2300)
-- dejó `obra_canonica.metodo_ponderacion = 'manual'` previsto y lo documentó como «la ponderación la
-- carga C05 en obra_actividad.ponderacion» — pero la columna nunca se creó y la vista devolvía NULL
-- para toda historia en ese modo. Acá nace la columna, con su GRANT (toda columna nueva nace sin
-- permiso: 20260923T2500), y la vista aprende a pesar una historia como el PRODUCTO de las
-- ponderaciones de su cadena (rubro × épica × historia), que es lo que significa que cada nivel
-- sume 100 entre hermanas.
--
-- NULL nunca es 0: una historia sin ponderación cargada no pesa (peso NULL) y `pct_sin_peso` lo dice.

alter table public.obra_actividad
  add column if not exists ponderacion numeric
  check (ponderacion is null or (ponderacion >= 0 and ponderacion <= 100));
comment on column public.obra_actividad.ponderacion is
  'C05: peso del ítem entre sus hermanas, 0–100. Sólo se lee con obra_canonica.metodo_ponderacion = ''manual''. NULL = sin cargar, no pesa.';

grant select (ponderacion) on public.obra_actividad to authenticated;
grant update (ponderacion) on public.obra_actividad to authenticated;

create or replace view public.obra_historia_peso
with (security_invoker = true) as
with recursive historias as (
  select w.actividad_id, w.obra_id, w.nombre, w.nivel, a.costo_mo, a.hh_plan, a.inicio_plan, a.fin_plan
    from public.obra_wbs w
    join public.obra_actividad a on a.id = w.actividad_id
   where not coalesce(w.archivada, false)
     and (w.nivel = 2 or a.costo_mo is not null)
),
-- El peso a mano de cada nodo: su ponderación por la de su padre, hasta la raíz.
cadena as (
  select a.id, a.obra_id, a.actividad_padre_id,
         case when a.ponderacion is null then null else a.ponderacion / 100.0 end as peso_manual
    from public.obra_actividad a
   where a.actividad_padre_id is null and not a.archivada
  union all
  select a.id, a.obra_id, a.actividad_padre_id,
         case when a.ponderacion is null or c.peso_manual is null then null else c.peso_manual * a.ponderacion / 100.0 end
    from public.obra_actividad a
    join cadena c on c.id = a.actividad_padre_id
   where not a.archivada
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
         when 'manual' then c.peso_manual
         else null
       end as peso,
       (h.costo_mo is null) as sin_costo,
       coalesce(l.avance_pct, 0) as avance_pct,
       coalesce(l.n_medidas, 0)::int as n_medidas,
       coalesce(l.n_hojas, 0)::int as n_hojas
  from historias h
  join public.obra_canonica o on o.id = h.obra_id
  left join totales t on t.obra_id = h.obra_id
  left join hojas l on l.historia_id = h.actividad_id
  left join cadena c on c.id = h.actividad_id;

grant select on public.obra_historia_peso to authenticated;

-- ERP OBRAS · H2.1 — PONDERACIÓN POR COSTO DE MANO DE OBRA (diseño aprobado, 23/09/2026).
--
-- Qué existe hoy y por qué no alcanza: `obra_actividad.pct` y `actividad_avance.avance_pct` dan el
-- avance de CADA ítem, y `obra_panel.avance_pct` los promedia parejo. El diseño pide que cada
-- HISTORIA pese por su costo de mano de obra —una historia de $ 3 M vale tres veces una de $ 1 M—
-- y que la obra muestre «Costo teórico $X de $Y de MO» = avance × Σ costo_mo. Ningún dato guardaba
-- ese costo por nodo, ni había método de ponderación elegido por obra.
--
-- Historia = nodo de nivel 2 del árbol (Rubro 0 › Épica 1 › Historia 2 › Tarea 3 › Subtarea 4, en
-- `obra_wbs.nivel`), o cualquier nodo con `costo_mo` cargado. Su avance es el promedio PAREJO de
-- las hojas medibles que cuelgan de ella (las tareas pesan igual entre sí, salvo `ponderacion`
-- manual, que queda para C05). Una historia sin costo pesa 0 y se cuenta aparte: NULL nunca es 0.

alter table public.obra_actividad
  add column if not exists costo_mo numeric;
comment on column public.obra_actividad.costo_mo is
  'Costo de mano de obra de la historia (nivel 3 del diseño). Fuente: partida vinculada o carga manual. NULL = sin costo, no pesa.';

alter table public.obra_canonica
  add column if not exists metodo_ponderacion text not null default 'costo_mo';
alter table public.obra_canonica drop constraint if exists obra_canonica_metodo_ponderacion_check;
alter table public.obra_canonica
  add constraint obra_canonica_metodo_ponderacion_check
  check (metodo_ponderacion in ('costo_mo', 'parejo', 'manual', 'dias_teoricos', 'hh_plan'));
comment on column public.obra_canonica.metodo_ponderacion is
  'C05: cómo pesan las historias entre sí. Por defecto por costo de MO (diseño ERP Obras, 23/09/2026).';

-- ── LAS HISTORIAS DE CADA OBRA, CON SU PESO ─────────────────────────────────────────────────────
create or replace view public.obra_historia_peso
with (security_invoker = true) as
with historias as (
  select w.actividad_id, w.obra_id, w.nombre, w.nivel, a.costo_mo, a.hh_plan,
         a.inicio_plan, a.fin_plan, w.ruta_orden
    from public.obra_wbs w
    join public.obra_actividad a on a.id = w.actividad_id
   where not coalesce(w.archivada, false)
     and (w.nivel = 2 or a.costo_mo is not null)
),
hojas as (
  -- Las hojas medibles que cuelgan de cada historia: descendientes sin hijas, con avance leído.
  select h.actividad_id as historia_id,
         avg(av.avance_pct) as avance_pct,
         count(*) filter (where av.avance_pct is not null) as n_medidas,
         count(*) as n_hojas
    from historias h
    join public.obra_wbs d
      on d.obra_id = h.obra_id
     and d.ruta_orden[1:array_length(h.ruta_orden, 1)] = h.ruta_orden
     and d.actividad_id <> h.actividad_id
     and not d.tiene_hijas
     and not coalesce(d.archivada, false)
    left join public.actividad_avance av on av.actividad_id = d.actividad_id
   group by h.actividad_id
),
totales as (
  select obra_id,
         sum(costo_mo) as costo_mo_total,
         sum(coalesce(hh_plan, 0)) filter (where hh_plan is not null) as hh_plan_total,
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
         else null  -- 'manual': la ponderación la carga C05 en `obra_actividad.ponderacion`; hasta entonces no pesa
       end as peso,
       (h.costo_mo is null) as sin_costo,
       coalesce(l.avance_pct, 0) as avance_pct,
       coalesce(l.n_medidas, 0)::int as n_medidas,
       coalesce(l.n_hojas, 0)::int as n_hojas
  from historias h
  join public.obra_canonica o on o.id = h.obra_id
  left join totales t on t.obra_id = h.obra_id
  left join hojas l on l.historia_id = h.actividad_id;

-- ── EL AVANCE PONDERADO DE LA OBRA ──────────────────────────────────────────────────────────────
create or replace view public.obra_avance_ponderado
with (security_invoker = true) as
select obra_id,
       max(metodo_ponderacion) as metodo,
       round(sum(avance_pct * coalesce(peso, 0)), 1) as avance_pct,
       sum(costo_mo) as costo_mo_total,
       round(sum(avance_pct * coalesce(peso, 0)) / 100 * sum(costo_mo), 0) as costo_teorico,
       count(*)::int as n_historias,
       count(*) filter (where sin_costo)::int as n_historias_sin_costo,
       round(100 * (1 - coalesce(sum(peso), 0)), 1) as pct_sin_peso,
       sum(n_medidas)::int as n_items_medidos,
       sum(n_hojas)::int as n_items
  from public.obra_historia_peso
 group by obra_id;

grant select on public.obra_historia_peso, public.obra_avance_ponderado to authenticated;

-- ERP OBRAS · H2.2 y H2.3 — PARTE DIARIO POR TAREA CON CANTIDAD, QUIÉN Y CON QUÉ; DÍAS HÁBILES.
--
-- Qué existe hoy y por qué no alcanza: `obra_ejecucion` YA ES el parte por tarea (actividad_id,
-- fecha, cantidad, avance_pct, metodo) y `obra_ejecucion_equipo` guarda el equipo como TEXTO libre.
-- No se crea `parte_tarea` aparte —sería la misma tabla con otro nombre—: se le agregan la fracción
-- del día (0..1) y si fue declarada a mano, las PERSONAS del parte con sus horas, y el ACTIVO real
-- del módulo Herramientas al lado del texto. `planilla_obra` es la lectura del diseño 04c.

alter table public.obra_ejecucion
  add column if not exists fraccion numeric,
  add column if not exists declarada boolean not null default false;
alter table public.obra_ejecucion drop constraint if exists obra_ejecucion_fraccion_check;
alter table public.obra_ejecucion
  add constraint obra_ejecucion_fraccion_check check (fraccion is null or (fraccion >= 0 and fraccion <= 1));
comment on column public.obra_ejecucion.fraccion is
  'Fracción del ítem hecha en este parte (0..1). NULL = se deduce de cantidad/cantidad_objetivo o de avance_pct.';
comment on column public.obra_ejecucion.declarada is
  'true = la fracción se cargó a mano (método manual), no medida por cantidad.';

alter table public.obra_ejecucion_equipo
  add column if not exists activo_id uuid references public.activo(id) on delete set null;
comment on column public.obra_ejecucion_equipo.activo_id is
  'El activo real de Herramientas usado en el parte (diseño ERP Obras 06). `equipo` queda como rótulo.';

-- ── QUIÉN ESTUVO EN CADA PARTE ───────────────────────────────────────────────────────────────────
create table if not exists public.obra_ejecucion_persona (
  id uuid primary key default gen_random_uuid(),
  ejecucion_id uuid not null references public.obra_ejecucion(id) on delete cascade,
  obra_id text not null,
  persona_id uuid not null references public.personas(id) on delete cascade,
  horas numeric check (horas is null or horas >= 0),
  creado_en timestamptz not null default now(),
  unique (ejecucion_id, persona_id)
);
comment on table public.obra_ejecucion_persona is
  'Las personas de un parte por tarea, con sus horas (NULL = sin registrar). Diseño ERP Obras 06 «Quién y con qué».';
create index if not exists obra_ejecucion_persona_ejecucion_idx on public.obra_ejecucion_persona(ejecucion_id);
create index if not exists obra_ejecucion_persona_obra_idx on public.obra_ejecucion_persona(obra_id);

alter table public.obra_ejecucion_persona enable row level security;
-- La puerta es la del parte: quien ve/escribe el `obra_ejecucion` ve/escribe a su gente. La
-- subconsulta corre con los derechos del que consulta, así que hereda la RLS de `obra_ejecucion`.
drop policy if exists obra_ejecucion_persona_select on public.obra_ejecucion_persona;
create policy obra_ejecucion_persona_select on public.obra_ejecucion_persona for select to authenticated
  using (exists (select 1 from public.obra_ejecucion e where e.id = ejecucion_id));
drop policy if exists obra_ejecucion_persona_insert on public.obra_ejecucion_persona;
create policy obra_ejecucion_persona_insert on public.obra_ejecucion_persona for insert to authenticated
  with check (exists (select 1 from public.obra_ejecucion e where e.id = ejecucion_id));
drop policy if exists obra_ejecucion_persona_update on public.obra_ejecucion_persona;
create policy obra_ejecucion_persona_update on public.obra_ejecucion_persona for update to authenticated
  using (exists (select 1 from public.obra_ejecucion e where e.id = ejecucion_id))
  with check (exists (select 1 from public.obra_ejecucion e where e.id = ejecucion_id));
drop policy if exists obra_ejecucion_persona_delete on public.obra_ejecucion_persona;
create policy obra_ejecucion_persona_delete on public.obra_ejecucion_persona for delete to authenticated
  using (exists (select 1 from public.obra_ejecucion e where e.id = ejecucion_id));
grant select, insert, update, delete on public.obra_ejecucion_persona to authenticated;

-- ── EL PARTE LEÍDO COMO LO PIDE EL DISEÑO: fracción resuelta, personas y activos ────────────────
create or replace view public.parte_tarea
with (security_invoker = true) as
select e.id, e.obra_id, e.actividad_id, e.fecha, e.cantidad as cantidad_hecha, e.comentario as nota,
       e.creado_por, e.creado_en, e.declarada,
       least(1, coalesce(
         e.fraccion,
         case when a.metodo_avance = 'cantidad' and a.cantidad_objetivo > 0 then e.cantidad / a.cantidad_objetivo end,
         e.avance_pct / 100
       )) as fraccion,
       (select coalesce(array_agg(p.persona_id order by p.creado_en), '{}') from public.obra_ejecucion_persona p where p.ejecucion_id = e.id) as personas,
       (select coalesce(array_agg(q.activo_id order by q.id) filter (where q.activo_id is not null), '{}') from public.obra_ejecucion_equipo q where q.ejecucion_id = e.id) as activos
  from public.obra_ejecucion e
  join public.obra_actividad a on a.id = e.actividad_id;

-- ── EL % DEL ÍTEM POR PARTES Y SUS DÍAS REALES ──────────────────────────────────────────────────
create or replace view public.actividad_partes_resumen
with (security_invoker = true) as
select actividad_id, obra_id,
       least(1, sum(coalesce(fraccion, 0))) as fraccion_acumulada,
       count(distinct fecha)::int as dias_reales,
       max(fecha) as ultimo_parte,
       bool_or(fecha = current_date) as parte_hoy
  from public.parte_tarea
 group by actividad_id, obra_id;

-- ── LA PLANILLA (04c): tarea × día hábil con Σ fracción, quién y con qué ────────────────────────
create or replace function public.planilla_obra(p_obra_id text, p_desde date, p_hasta date)
returns table (actividad_id uuid, fecha date, fraccion numeric, cantidad numeric, personas uuid[], activos uuid[], n_partes int)
language sql stable
set search_path = public as $$
  select t.actividad_id, t.fecha,
         least(1, sum(coalesce(t.fraccion, 0))) as fraccion,
         sum(t.cantidad_hecha) as cantidad,
         (select coalesce(array_agg(distinct p), '{}'::uuid[]) from public.parte_tarea u cross join unnest(u.personas) p
           where u.actividad_id = t.actividad_id and u.fecha = t.fecha) as personas,
         (select coalesce(array_agg(distinct q), '{}'::uuid[]) from public.parte_tarea u cross join unnest(u.activos) q
           where u.actividad_id = t.actividad_id and u.fecha = t.fecha) as activos,
         count(*)::int as n_partes
    from public.parte_tarea t
   where t.obra_id = p_obra_id and t.fecha between p_desde and p_hasta
   group by t.actividad_id, t.fecha
$$;
revoke all on function public.planilla_obra(text, date, date) from public, anon;
grant execute on function public.planilla_obra(text, date, date) to authenticated;

-- ── DÍAS HÁBILES DE LA OBRA (H2.3): al lado de `obra_panel`, no adentro ─────────────────────────
-- `obra_panel` es una vista grande que se redefine con cuidado (ya se replanificó mal una vez).
-- Los dos números viven en una vista chica que se une por `obra_id`.
create or replace view public.obra_dias_habiles
with (security_invoker = true) as
select p.obra_id,
       case when p.fecha_inicio_real is not null then public.dias_habiles(p.obra_id, p.fecha_inicio_real, current_date) end as dia_habil_actual,
       case when p.fecha_inicio_plan is not null and p.fecha_fin_plan is not null then public.dias_habiles(p.obra_id, p.fecha_inicio_plan, p.fecha_fin_plan) end as dias_habiles_plan
  from public.obra_panel p;

grant select on public.parte_tarea, public.actividad_partes_resumen, public.obra_dias_habiles to authenticated;

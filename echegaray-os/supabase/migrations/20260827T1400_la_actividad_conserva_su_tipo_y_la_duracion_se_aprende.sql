-- LA EXPERIENCIA DE OBRA SE PUEDE VOLVER A USAR: LA ACTIVIDAD DICE DE QUÉ TAREA ES, Y LA DURACIÓN
-- SE APRENDE APARTE DEL RENDIMIENTO.
--
-- ═══ EL CUELLO QUE ESTO ABRE (27/08/2026) ═══
--
-- 119 actividades terminadas tienen duración planificada Y duración real: son 119 hechos medidos
-- sobre cuánto tarda de verdad el trabajo de Echegaray. Ninguna se podía reutilizar, porque ninguna
-- dice DE QUÉ TAREA es. Sin `tarea_tipo_id` la experiencia queda pegada a la actividad que la
-- produjo y no le sirve a la próxima obra.
--
-- ═══ POR QUÉ EL VÍNCULO LLEVA ORIGEN Y CONFIANZA ═══
--
-- Vincular una actividad histórica con un tipo de tarea es CLASIFICAR, y clasificar admite error.
-- Una asignación por nombre idéntico no vale lo mismo que una que propuso un modelo mirando dos
-- textos parecidos, y el día que un rendimiento salga raro hay que poder preguntar de dónde salió el
-- vínculo. Por eso cada asignación guarda quién la hizo, con qué evidencia y con qué confianza — y
-- se puede deshacer poniendo las cuatro columnas en NULL sin tocar un solo dato de la obra.
--
-- ═══ Y POR QUÉ LA DURACIÓN VIVE EN OTRA TABLA ═══
--
-- `rendimiento_historico` mide HORAS POR UNIDAD y necesita HH imputadas a la actividad, que hoy casi
-- no existen. La duración mide DÍAS y sólo necesita fechas, que sí existen. Son dos métricas con
-- dos requisitos y dos usos: mezclarlas en una tabla obligaría a rellenar con NULL la mitad de cada
-- fila y a explicar en cada consulta cuál de las dos se está mirando.

create extension if not exists pg_trgm;

-- ── 1. LA ACTIVIDAD CONSERVA SU TIPO, Y CÓMO LO OBTUVO ───────────────────────────────────────

alter table public.obra_actividad
  add column if not exists tarea_tipo_origen     text,
  add column if not exists tarea_tipo_confianza  text,
  add column if not exists tarea_tipo_evidencia  jsonb,
  add column if not exists tarea_tipo_asignado_en timestamptz,
  -- ═══ LO QUE EL MODELO PROPONE NO SE APLICA SOLO ═══
  --
  -- La zona gris —«Hormigonado» contra «HORMIGONADO A MANO», «Compactación» contra «RELLENO Y
  -- COMPACTACIÓN»— la resuelve un modelo, y su respuesta es una inferencia. Aplicarla como dato
  -- maestro contaminaría el rendimiento de esa tarea para siempre: hormigonar a mano y hormigonar
  -- con bomba son la misma palabra y dos productividades distintas. La propuesta se guarda ACÁ, con
  -- su evidencia, y aceptarla es un acto de una persona.
  add column if not exists propuesta_tarea_tipo_id uuid references public.tarea_tipo(id),
  add column if not exists propuesta_evidencia     jsonb,
  add column if not exists propuesta_en            timestamptz;

do $$ begin
  alter table public.obra_actividad add constraint obra_actividad_tarea_tipo_origen_ck
    check (tarea_tipo_origen is null or tarea_tipo_origen in
      ('presupuesto', 'plantilla', 'manual', 'nombre-exacto', 'similitud', 'modelo'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.obra_actividad add constraint obra_actividad_tarea_tipo_confianza_ck
    check (tarea_tipo_confianza is null or tarea_tipo_confianza in ('EXACTO', 'ALTA', 'CANDIDATO'));
exception when duplicate_object then null; end $$;

-- Las que YA tenían tipo lo trajeron de la partida cotizada: es el origen más fuerte que hay y no
-- se toca. Se rotula para que el día de mañana no parezca que las clasificó un algoritmo.
update public.obra_actividad
   set tarea_tipo_origen = 'presupuesto', tarea_tipo_confianza = 'EXACTO'
 where tarea_tipo_id is not null and tarea_tipo_origen is null;

comment on column public.obra_actividad.propuesta_tarea_tipo_id is
  'Lo que un modelo cree que es esta actividad. NO es el vínculo: el vínculo es tarea_tipo_id. Aceptar una propuesta es una decisión de una persona.';

comment on column public.obra_actividad.tarea_tipo_origen is
  'De dónde salió el vínculo: presupuesto (la partida cotizada) · plantilla · manual · nombre-exacto · similitud · modelo. Poner las cuatro columnas tarea_tipo_* en NULL deshace la clasificación sin tocar ningún dato de la obra.';

create index if not exists obra_actividad_sin_clasificar_ix
  on public.obra_actividad (obra_id) where tarea_tipo_id is null and archivada is not true;

-- ── 2. LA DURACIÓN APRENDIDA ─────────────────────────────────────────────────────────────────

create table if not exists public.duracion_historica (
  id                uuid primary key default gen_random_uuid(),
  actividad_id      uuid not null references public.obra_actividad(id) on delete cascade,
  obra_id           text not null,
  tarea_tipo_id     uuid references public.tarea_tipo(id),
  actividad_nombre  text not null,
  -- El plan y el real, en días. Nunca cero de relleno: lo que no se sabe queda en NULL y la fila
  -- no se escribe.
  dias_plan         numeric not null,
  dias_real         numeric not null,
  desvio_dias       numeric generated always as (dias_real - dias_plan) stored,
  desvio_pct        numeric,
  inicio_plan       date,
  fin_plan          date,
  inicio_real       date,
  fin_real          date,
  dotacion_real     integer,
  estado            text not null default 'CANDIDATO'
                      check (estado in ('CANDIDATO', 'VALIDADO', 'DESCARTADO')),
  confianza         text check (confianza in ('alta', 'media', 'baja')),
  veces_confirmado  integer not null default 1,
  evidencia         jsonb,
  clave             text not null unique,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

comment on table public.duracion_historica is
  'Cuánto tardó de verdad cada actividad terminada contra lo planificado. Es la OTRA métrica del aprendizaje de obra: la de rendimiento (hs/unidad) vive en rendimiento_historico y necesita HH imputadas; ésta sólo necesita fechas, que sí existen. No se mezclan.';
comment on column public.duracion_historica.tarea_tipo_id is
  'Nullable a propósito: el HECHO se guarda igual aunque la actividad todavía no esté clasificada. El día que se le asigne un tipo, la experiencia pasa a ser reutilizable sin volver a medirla.';

create index if not exists duracion_historica_tarea_ix on public.duracion_historica (tarea_tipo_id)
  where tarea_tipo_id is not null;
create index if not exists duracion_historica_obra_ix on public.duracion_historica (obra_id);

alter table public.duracion_historica enable row level security;

do $$ begin
  create policy duracion_historica_lee on public.duracion_historica for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on public.duracion_historica to authenticated;
grant select, insert, update, delete on public.duracion_historica to service_role;

-- ── 3. LA EXPERIENCIA POR TIPO DE TAREA, EN UNA LECTURA ──────────────────────────────────────
--
-- Lo que XSAS y quien planifica necesitan preguntar: «de esta tarea, ¿cuánto sabemos?». Las dos
-- métricas viajan juntas pero SEPARADAS, cada una con sus casos y sus obras. Un solo número mágico
-- escondería que la duración se sabe por seis casos y el rendimiento por ninguno.

create or replace view public.experiencia_por_tarea
with (security_invoker = true) as
select
  t.id                                        as tarea_tipo_id,
  t.codigo, t.nombre, t.unidad,
  d.casos                                     as casos_duracion,
  d.obras                                     as obras_duracion,
  d.dias_plan_mediana,
  d.dias_real_mediana,
  d.desvio_pct_mediana,
  d.confianza_minima                          as confianza_duracion,
  r.casos                                     as casos_rendimiento,
  r.obras                                     as obras_rendimiento,
  r.hs_unitarias_mediana,
  r.confianza_minima                          as confianza_rendimiento,
  -- Con una sola obra hay un dato, no una referencia. Es la misma regla que ya aplica
  -- `rendimiento_recomendado`, dicha una vez para las dos métricas.
  (coalesce(d.obras, 0) >= 2)                 as duracion_reutilizable,
  (coalesce(r.obras, 0) >= 2)                 as rendimiento_reutilizable
from public.tarea_tipo t
left join lateral (
  select count(*)::int casos, count(distinct obra_id)::int obras,
         percentile_cont(0.5) within group (order by dias_plan)  as dias_plan_mediana,
         percentile_cont(0.5) within group (order by dias_real)  as dias_real_mediana,
         percentile_cont(0.5) within group (order by desvio_pct) as desvio_pct_mediana,
         min(case confianza when 'baja' then 0 when 'media' then 1 else 2 end) conf
    from public.duracion_historica x where x.tarea_tipo_id = t.id and x.estado <> 'DESCARTADO'
) dd on true
left join lateral (select dd.casos, dd.obras, dd.dias_plan_mediana, dd.dias_real_mediana,
                         dd.desvio_pct_mediana,
                         (array['baja','media','alta'])[dd.conf + 1] as confianza_minima) d on true
left join lateral (
  select count(*)::int casos, count(distinct obra_id)::int obras,
         percentile_cont(0.5) within group (order by hs_unitarias) as hs_unitarias_mediana,
         min(case confianza when 'baja' then 0 when 'media' then 1 else 2 end) conf
    from public.rendimiento_historico x
   where x.tarea_tipo_id = t.id and x.estado <> 'DESCARTADO' and x.hs_unitarias is not null
) rr on true
left join lateral (select rr.casos, rr.obras, rr.hs_unitarias_mediana,
                         (array['baja','media','alta'])[rr.conf + 1] as confianza_minima) r on true
where t.activo is not false;

comment on view public.experiencia_por_tarea is
  'Lo que Echegaray aprendió de cada tarea, con las dos métricas SEPARADAS y su cantidad de casos y obras. Reutilizable pide dos obras distintas: con una hay un dato, no una referencia.';

grant select on public.experiencia_por_tarea to authenticated, service_role;

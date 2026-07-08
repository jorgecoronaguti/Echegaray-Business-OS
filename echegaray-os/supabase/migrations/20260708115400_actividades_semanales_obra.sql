-- O1-B: Ciclo Semanal Real de Obra. Modificación mínima de modelo aprobada explícitamente
-- por Jorge para representar SEMANA -> OBRA -> ACTIVIDAD -> PARTIDA (opcional) -> FRENTE
-- (opcional) -> RESPONSABLE -> AVANCE/HH OBJETIVO -> RESTRICCIONES -> AVANCE/HH REAL ->
-- ESTADO -> CAUSA DE DESVÍO.
--
-- Grano operacional elegido con evidencia real (ver o1-a-obra-piloto-base-operacional.md
-- y el tracker Gantt real de Drive, hoja "San Francisco" de avance_obra.xlsx): actividad
-- en texto libre + responsable + personas/tiempo, NO partida presupuestaria rígida ni CPM.
-- Mismo criterio que registros_hh (PRP-008): texto libre, sin cuadrilla/legajo formal.
--
-- partida_id es opcional (nullable) porque la evidencia real muestra que la mayoría de
-- las actividades semanales de obra no se planifican contra una partida presupuestaria
-- específica -- se vincula solo "cuando exista" esa relación real.
create table actividades_semanales (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references obras(id) on delete restrict,

  semana_inicio date not null, -- lunes de la semana (mismo criterio que F1: inicio_semana)
  actividad text not null,
  partida_id uuid references partidas_presupuesto(id) on delete set null,
  frente text,
  responsable text not null,

  avance_objetivo numeric(5,2) check (avance_objetivo is null or (avance_objetivo >= 0 and avance_objetivo <= 100)),
  hh_objetivo numeric(8,2) check (hh_objetivo is null or hh_objetivo > 0),
  restricciones text,

  avance_real numeric(5,2) check (avance_real is null or (avance_real >= 0 and avance_real <= 100)),
  hh_real numeric(8,2) check (hh_real is null or hh_real > 0),
  causa_desvio text,

  estado text not null default 'planificada' check (estado in ('planificada', 'en_curso', 'cerrada')),

  fuente_legacy text,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (obra_id, semana_inicio, actividad)
);

create index actividades_semanales_obra_idx on actividades_semanales(obra_id);
create index actividades_semanales_obra_semana_idx on actividades_semanales(obra_id, semana_inicio);

alter table actividades_semanales enable row level security;

create policy "authenticated_full_access" on actividades_semanales
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.actividades_semanales to authenticated;

create trigger actividades_semanales_set_updated_at before update on actividades_semanales
  for each row execute function set_updated_at();

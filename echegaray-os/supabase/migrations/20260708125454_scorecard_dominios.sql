-- Scorecard vivo (Programa de Ejecución Continua, punto 2): el scorecard de madurez
-- deja de vivir solo en un documento (.claude/memory) y pasa a ser una tabla real que
-- el propio OS puede leer, para poder responder "qué dominio está más atrasado / cuál
-- puede avanzar ahora" sin depender de que alguien abra un artifact viejo.
create table scorecard_dominios (
  id uuid primary key default gen_random_uuid(),
  dominio text not null unique,
  nivel_actual integer not null check (nivel_actual between 0 and 10),
  evidencia text not null,
  fecha_evaluacion date not null default current_date,
  bloqueante text not null,
  criterio_objetivo_avance text not null,
  incremento_activo text,
  resultado_esperado text,
  resultado_real text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table scorecard_dominios enable row level security;

create policy scorecard_dominios_select on scorecard_dominios
  for select to authenticated using (true);

create policy scorecard_dominios_write on scorecard_dominios
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

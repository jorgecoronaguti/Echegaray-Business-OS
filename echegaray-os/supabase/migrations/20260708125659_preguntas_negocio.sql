-- Catálogo de preguntas de negocio (Track B / B2): convierte las secciones G/H del
-- Marco de Madurez (preguntas confiables / no confiables todavía) en un catálogo
-- vivo -- para que el OS sepa qué puede responder con evidencia y qué no, en vez de
-- que esa clasificación viva solo en un documento congelado.
create table preguntas_negocio (
  id uuid primary key default gen_random_uuid(),
  dominio text not null,
  pregunta text not null unique,
  datos_necesarios text not null,
  fuente text not null,
  metodo_calculo text not null,
  estado text not null check (estado in ('confiable', 'parcial', 'no_confiable')),
  nivel_confianza_actual text,
  gap_bloqueante text,
  ultima_validacion date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table preguntas_negocio enable row level security;

create policy preguntas_negocio_select on preguntas_negocio
  for select to authenticated using (true);

create policy preguntas_negocio_write on preguntas_negocio
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

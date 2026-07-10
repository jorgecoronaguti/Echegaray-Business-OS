-- Backlog Autónomo (Track B / punto 6, OLA 2): el backlog de gaps/riesgos/oportunidades
-- detectados por el propio sistema deja de vivir solo en un artifact y pasa a ser una
-- tabla real. No es un segundo task manager: se convierte en `acciones` (Centro de
-- Acción) reutilizando el mismo mecanismo de `alerta_origen_id` ya usado para alertas
-- del dashboard -- acá el origen es un item de backlog en vez de una alerta.
create table backlog_autonomo (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'gap_dato', 'gap_proceso', 'riesgo', 'anomalia', 'oportunidad',
    'gap_skill', 'deuda_tecnica', 'integracion_faltante', 'mejora_potencial'
  )),
  titulo text not null,
  evidencia text not null,
  fuente text not null,
  confianza text not null check (confianza in (
    'confirmado', 'conciliado', 'observado', 'calculado', 'estimado', 'inferido', 'conflictivo', 'sin_dato'
  )),
  impacto text not null check (impacto in ('alta', 'media', 'baja')),
  urgencia text not null check (urgencia in ('alta', 'media', 'baja', 'por_confirmar')),
  esfuerzo text not null check (esfuerzo in ('alto', 'medio', 'bajo')),
  dependencia text,
  recomendacion text not null,
  nivel_autonomia_permitido text not null check (nivel_autonomia_permitido in ('A', 'B', 'C', 'D', 'E', 'F')),
  estado text not null default 'abierto' check (estado in ('abierto', 'en_curso', 'resuelto', 'descartado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table backlog_autonomo enable row level security;

create policy backlog_autonomo_select on backlog_autonomo
  for select to authenticated using (true);

create policy backlog_autonomo_write on backlog_autonomo
  for all to authenticated
  using (current_rol() in ('direccion', 'administracion'))
  with check (current_rol() in ('direccion', 'administracion'));

create trigger backlog_autonomo_set_updated_at before update on backlog_autonomo
  for each row execute function set_updated_at();

-- CALENDARIO FINANCIERO — snapshot del modelo diario del motor de Ingeniería Financiera.
--
-- La lógica vive EXCLUSIVAMENTE en el motor (orquestador/lib/calendario-financiero.mjs). El worker
-- corre el motor (tiene las credenciales de Google y lee las pestañas reales) y guarda acá el
-- resultado ya calculado. La Web SÓLO lee esta tabla: nunca el Sheet, nunca recalcula, nunca mete
-- lógica financiera en React. Un solo snapshot vivo (el más reciente por generado_en).
create table if not exists public.finanzas_calendario (
  id           bigint generated always as identity primary key,
  generado_en  timestamptz not null default now(),
  payload      jsonb not null
);

alter table public.finanzas_calendario enable row level security;
drop policy if exists finanzas_calendario_read on public.finanzas_calendario;
-- Lectura para cualquier usuario autenticado: es información de gestión de la propia empresa. La
-- escritura la hace el backend con el rol de servicio (que ignora RLS).
create policy finanzas_calendario_read on public.finanzas_calendario
  for select to authenticated using (true);
grant select on public.finanzas_calendario to authenticated;

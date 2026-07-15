-- RLS para las tablas del Plan 1 (integraciones + comprobantes ARCA). El orquestador escribe
-- con service role (bypassa RLS); la web lee con sesión autenticada, así que necesita policy
-- de SELECT. Cumple la regla del proyecto: RLS habilitado en toda tabla.
alter table public.integraciones enable row level security;
create policy integraciones_select on public.integraciones
  for select to authenticated using (true);
grant select on public.integraciones to authenticated;

alter table public.comprobantes_arca enable row level security;
create policy comprobantes_arca_select on public.comprobantes_arca
  for select to authenticated using (true);
grant select on public.comprobantes_arca to authenticated;

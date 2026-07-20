-- AUDITORÍA 2026-07-19 · HALLAZGO DE SEGURIDAD: tres tablas quedaron sin RLS, violando la regla del
-- CLAUDE.md ("RLS habilitado en toda tabla de Supabase"). Sin RLS, cualquiera con la anon key puede
-- leerlas (y potencialmente escribirlas) a través de la API pública de Supabase.
--
--   · obra_canonica — el eje canónico de obras (la columna vertebral del OS)
--   · obra_alias    — el mapeo texto→obra que decide a qué obra se imputa cada costo
--   · cobranzas     — datos financieros de clientes
--
-- Se habilita RLS CON políticas en el mismo paso: activar RLS sin política equivale a denegar todo
-- y rompería la web. El orquestador entra con service role y no se ve afectado.
-- Patrón consistente con adicionales/certificados: todos los autenticados leen; escriben los roles
-- de gestión.

-- ── obra_canonica ─────────────────────────────────────────────────────────────
alter table public.obra_canonica enable row level security;
drop policy if exists obra_canonica_select on public.obra_canonica;
create policy obra_canonica_select on public.obra_canonica for select to authenticated using (true);
drop policy if exists obra_canonica_write on public.obra_canonica;
create policy obra_canonica_write on public.obra_canonica for all to authenticated
  using (current_rol() = any (array['direccion','administracion']))
  with check (current_rol() = any (array['direccion','administracion']));

-- ── obra_alias ────────────────────────────────────────────────────────────────
-- Es sensible: quien edita un alias cambia a qué obra se imputa el costo real.
alter table public.obra_alias enable row level security;
drop policy if exists obra_alias_select on public.obra_alias;
create policy obra_alias_select on public.obra_alias for select to authenticated using (true);
drop policy if exists obra_alias_write on public.obra_alias;
create policy obra_alias_write on public.obra_alias for all to authenticated
  using (current_rol() = any (array['direccion','administracion']))
  with check (current_rol() = any (array['direccion','administracion']));

-- ── cobranzas ─────────────────────────────────────────────────────────────────
alter table public.cobranzas enable row level security;
drop policy if exists cobranzas_select on public.cobranzas;
create policy cobranzas_select on public.cobranzas for select to authenticated using (true);
drop policy if exists cobranzas_write on public.cobranzas;
create policy cobranzas_write on public.cobranzas for all to authenticated
  using (current_rol() = any (array['direccion','administracion']))
  with check (current_rol() = any (array['direccion','administracion']));

-- Hallazgo real del linter de seguridad de Supabase (get_advisors) al auditar las
-- políticas RLS después de PR5: current_rol() era ejecutable por el rol `anon`
-- (sin sesión) vía RPC. No filtraba datos (devuelve null sin perfil), pero no hay
-- motivo para exponerlo a usuarios no autenticados -- se restringe a `authenticated`.
revoke execute on function current_rol() from public;
revoke execute on function current_rol() from anon;
grant execute on function current_rol() to authenticated;

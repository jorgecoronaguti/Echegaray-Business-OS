-- PRP-001 / Fase 0: fix real detectado al probar acceso autenticado contra Supabase real.
-- Las policies de RLS no alcanzan sin el GRANT de tabla correspondiente: el rol
-- `authenticated` no tenía privilegios base sobre estas tablas (permission denied
-- incluso con `USING (true)`). `anon` queda deliberadamente sin GRANT (además de sin
-- policy), para bloquear acceso no autenticado en ambas capas.

grant select, insert, update, delete on public.clientes to authenticated;
grant select, insert, update, delete on public.obras to authenticated;
grant select, insert, update, delete on public.cuentas_financieras to authenticated;
grant select, insert, update, delete on public.proveedores to authenticated;

-- CUTOVER — el alta de operarios de campo se hace con la service_role key (server-only,
-- nunca expuesta al cliente). Necesita escribir en perfiles para asignar el rol. service_role
-- bypassa RLS pero necesita el GRANT de tabla.
grant select, insert, update, delete on public.perfiles to service_role;

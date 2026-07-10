-- La RLS policy sola no alcanza -- Supabase revoca los privilegios por defecto del
-- rol `authenticated` sobre tablas nuevas; hace falta el GRANT explícito (mismo
-- patrón que costos_reales y el resto de las tablas operativas). Sin esto, PostgREST
-- devuelve "permission denied" incluso con una policy `using (true)`.
grant select, insert, update, delete on clasificaciones_costo_obra to authenticated;

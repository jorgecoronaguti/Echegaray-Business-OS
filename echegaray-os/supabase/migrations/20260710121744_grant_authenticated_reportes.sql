-- Mismo patrón que 20260708134500: sin GRANT explícito, RLS nunca llega a
-- evaluarse y la app ve las tablas vacías sin error visible.
grant select on reportes_definiciones to authenticated;
grant all on reportes_definiciones to authenticated;
grant select, insert, update on reportes_generados to authenticated;

-- LA COLUMNA NUEVA NACE SIN PERMISO (otra vez). `obra_canonica` se lee con GRANT POR COLUMNA para
-- `authenticated`; la H2 (20260923T2300) agregó `metodo_ponderacion` y las vistas `security_invoker`
-- `obra_historia_peso` y `obra_avance_ponderado` la leen. Resultado en producción (capturas 23/09):
-- «permission denied for table obra_canonica» en Resumen, Ítems y Planilla de toda obra.
grant select (metodo_ponderacion) on public.obra_canonica to authenticated;

-- LA COLUMNA NUEVA NACE SIN PERMISO (trampa ya pagada, y hoy volvió a morder en producción).
--
-- `persona_directorio` es `security_invoker=true`: cada columna que publica la lee el rol del que
-- consulta. Los permisos de `personas` para `authenticated` son POR COLUMNA (categoria, en_la_empresa,
-- es_prueba, especialidad, fecha_egreso, fecha_ingreso, id, nombre_completo, puesto). La migración
-- 20260908T1500 sumó `legajo` a la vista sin sumar el GRANT: la lista Plantel respondía
-- «permission denied for table personas» y quedaba vacía. REVERSIBLE: `revoke select (legajo) ...`.
grant select (legajo) on public.personas to authenticated;

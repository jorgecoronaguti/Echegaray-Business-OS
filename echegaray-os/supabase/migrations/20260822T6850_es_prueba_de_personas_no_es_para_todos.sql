-- ═══ es_prueba DE personas NO ES PARA TODOS (22/08/2026) ═══
--
-- La guarda de columnas comerciales lo atrapó en la suite: 20260822T6400 le dio SELECT a
-- authenticated sobre personas.es_prueba, pero el legajo se lee por persona_legajo (que exige
-- es_administracion()) y NINGUNA cara consulta esa columna de personas — el filtro de cuentas de
-- prueba usa perfiles.es_prueba. Un grant que nadie usa sobre la tabla del legajo es superficie
-- regalada: se revoca. La columna queda; service_role la sigue operando.

revoke select (es_prueba) on public.personas from authenticated;

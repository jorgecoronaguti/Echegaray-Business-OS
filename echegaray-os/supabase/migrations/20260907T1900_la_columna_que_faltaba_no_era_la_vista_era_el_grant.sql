-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA CAUSA NO ERA LA VISTA, ERA EL GRANT DE UNA COLUMNA — Y MI PRIMER ARREGLO ABRIÓ UNA FUGA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Cadena completa, porque las tres piezas importan:
--
-- 1. La migración de las 16:00 agregó `where p.es_prueba is not true` a `persona_directorio`. La
--    vista es `security_invoker = true`, o sea que se resuelve con los permisos de quien consulta.
--    Y `authenticated` NO tiene `select` sobre `personas.es_prueba`: ese grant por columna se revocó
--    el 22/08 (`20260822T6850_es_prueba_de_personas_no_es_para_todos.sql`). Citar la columna en el
--    WHERE convirtió la vista entera en «permission denied for table personas», que la pantalla
--    mostró como «No pude leer el legajo».
--
--    RLS NO ES GRANT, y un GRANT es POR COLUMNA: una columna que la vista sólo usa para filtrar
--    necesita permiso igual que una que publica. Es la trampa que este repo ya tenía escrita y que
--    volví a pisar.
--
-- 2. Mi primer arreglo fue poner `security_invoker = false`. Sacó el error… y abrió un agujero: con
--    los derechos del dueño de la vista, el RLS de `personas` deja de aplicarse y CUALQUIER usuario
--    autenticado —un jefe de obra, un rol de campo— pasa a leer las 74 personas en vez de las de su
--    obra. Verificado en vivo por una auditoría con navegador: 10 filas por la vista contra 1 por la
--    tabla. Cambié un error visible por una fuga invisible, que es el peor canje posible.
--
-- 3. Lo correcto es lo que arregla las dos cosas: la vista vuelve a `security_invoker = true` —el
--    RLS manda— y se le da a `authenticated` el permiso MÍNIMO que necesita para poder filtrar:
--    `select` sobre esa única columna. No publica nada nuevo: `es_prueba` no está en la lista de
--    columnas de la vista, sólo se usa en el WHERE.
--
-- Y la razón por la que la 16:00 no lo detectó: se midió con una conexión de superusuario, donde
-- ningún grant falta nunca. Una vista con porteros SÓLO se puede medir como `authenticated`.

grant select (es_prueba) on public.personas to authenticated;

alter view public.persona_directorio set (security_invoker = true);

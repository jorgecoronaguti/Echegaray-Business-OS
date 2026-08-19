-- La lista BLANCA de columnas legibles de `personas` la mide
-- `orquestador/lib/columnas-comerciales-cerradas.test.mjs`, y con las dos columnas nuevas se puso
-- roja — que es exactamente para lo que se escribió: una columna del legajo nace cerrada.
--
-- De las dos, sólo una tiene que abrirse:
--
--   · `en_la_empresa` SÍ. La lee `persona_directorio`, que es una vista `security_invoker` y por lo
--     tanto necesita el grant. Es operativo puro —si la persona sigue trabajando acá— y es lo mismo
--     que `persona_plantel` ya deja ver al no publicar a quien se fue.
--
--   · `legajo` NO. Es el número con el que liquida JORNALES; la obra no lo necesita para asignar a
--     nadie. La ficha lo lee por `persona_legajo`, que corre como su dueño y no depende de este
--     grant, así que cerrarlo no le saca nada a Administración.
--
-- La RLS de `personas` deja a un jefe de obra leer las filas de quien está asignado a SU obra. Sin
-- este revoke, el número de legajo de esa gente le quedaba visible.

revoke select (legajo) on public.personas from authenticated;

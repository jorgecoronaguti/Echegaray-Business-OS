-- LOS PRIVILEGIOS QUE FALTABAN. Sin esto el Módulo 01 no se puede leer, y el modo de fallar engaña.
--
-- ═══ QUÉ PASÓ (17/08/2026) ═══
--
-- La migración `20260817210000_modulo_01_obras.sql` habilitó RLS y creó las policies de las cuatro
-- tablas nuevas… y no otorgó ni un `grant`. **RLS y GRANT son dos permisos distintos**: la policy
-- decide QUÉ FILAS ve un rol que ya puede leer la tabla; el grant decide SI PUEDE LEERLA. Con la
-- policy puesta y el grant ausente, el resultado no es "ve cero filas": es
-- `permission denied for view obra_panel` para todo el mundo, incluida la service_role.
--
-- Y encima `obra_panel` se recreó con `drop view` + `create view`. El `drop` se lleva puestos los
-- grants que la vista vieja sí tenía — así que esta migración no sólo agrega lo nuevo: repone lo que
-- funcionaba antes y yo tiré.
--
-- ═══ POR QUÉ NO LO VI, Y CÓMO SE VIO ═══
--
-- Yo verifiqué la migración leyendo la base con el driver `pg` y el usuario del worker, que es dueño
-- del esquema y no necesita grant. Todo daba bien. La web entra por PostgREST como `authenticated`,
-- y ahí no entraba nada. Es el defecto clásico de validar un control contra la misma vía que lo
-- produce — el módulo entero se veía como **404** en cada ruta, porque el server component no podía
-- resolver la obra y Next.js devolvía "no encontrada" en vez de "no puedo leer".
--
-- Lo encontró una verificación visual con navegador real hecha por alguien que no escribió el
-- código. Ninguna de mis pruebas —suite en verde, typecheck limpio, build exit 0, migración
-- aplicada sin error— podía encontrarlo.

-- ── Las tablas del módulo: lectura para cualquier autenticado; la escritura la sigue acotando la
--    policy por rol (dirección / administración / jefe de obra).
grant select, insert, update, delete on public.obra_actividad   to authenticated;
grant select, insert, update, delete on public.obra_dependencia to authenticated;
grant select, insert, update, delete on public.obra_restriccion to authenticated;
grant select, insert, update, delete on public.obra_documento   to authenticated;

-- ── El eje canónico y sus derivadas. `obra_panel` es la que lee el portafolio.
grant select on public.obra_canonica   to authenticated;
grant select on public.obra_alias      to authenticated;
grant select on public.obra_costo_real to authenticated;
grant select on public.obra_panel      to authenticated;

-- ── `drive_index` la lee la solapa de Documentos para resolver el nombre del archivo. El archivo
--    sigue en Drive: acá sólo se lee su metadata.
grant select on public.drive_index to authenticated;

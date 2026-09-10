-- EL RASTRO DEL RETIRO NO DEJABA BORRAR NINGUNA MARCA — 10/09/2026.
--
-- `20260910T1200_asistencia_dia_retiro.sql` declaró `asistencia_dia_retiro.obra_canonica_id` como
-- `uuid`. La columna que copia —`asistencia_dia.obra_canonica_id`— es TEXT desde el día que se
-- creó, y con razón: `obra_canonica.id` es un slug (`pisos-industriales`), no un uuid; está escrito
-- en `20260908T1900_asistencia_dia.sql` línea 36.
--
-- CONSECUENCIA MEDIDA EN LA BASE REAL (sesión de Dirección, no service_role):
--
--   delete from asistencia_dia where persona_id = …
--   → column "obra_canonica_id" is of type uuid but expression is of type text
--
-- El trigger corre `before delete`, así que la falla se lleva puesto el borrado entero: la función
-- «quitar el presente» que el dueño pidió el 10/09 NO funciona para NINGUNA persona —ni la de
-- prueba ni una real—, y tampoco se puede borrar una marca desde ningún lado. El botón existe, la
-- policy está bien y el `grant` también: lo que falla es el tipo de una columna del rastro.
--
-- Por qué no se vio antes: la migración se probó por la pantalla, y la pantalla dice «no se pudo»
-- con el mensaje en el `title` del botón. El efecto —la fila que se tenía que ir— nunca se leyó en
-- su destino. Es exactamente la trampa que el principio de cierre nombra: la evidencia es del
-- efecto, no del intento.
--
-- LA TABLA ESTÁ VACÍA (ningún borrado pudo completarse nunca), así que el `alter` no puede perder
-- datos: no hay ninguno.
--
-- REVERSA:
--   alter table public.asistencia_dia_retiro alter column obra_canonica_id type uuid using null;

alter table public.asistencia_dia_retiro
  alter column obra_canonica_id type text using obra_canonica_id::text;

comment on column public.asistencia_dia_retiro.obra_canonica_id is
  'La obra que tenía la marca. TEXT, como obra_canonica.id: los ids de obra son slugs, no uuid.';

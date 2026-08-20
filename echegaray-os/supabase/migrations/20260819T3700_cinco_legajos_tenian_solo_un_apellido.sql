-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CINCO LEGAJOS SE LLAMABAN CON UN APELLIDO Y NADA MÁS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `BALMACEDA`, `ISAGUIRRE`, `NARBAEZ`, `SAAVEDRA` y `SANCHEZ`: así estaban nombradas las carpetas en
-- el data room y así entraron al módulo. Un apellido solo no identifica a nadie —en este plantel hay
-- cuatro González y cinco Quiroga— y además rompía el emparejamiento: cualquier papel de esas
-- personas parecía estar en el legajo de otra.
--
-- El nombre completo NO se dedujo: está impreso en la Libreta de Fondo de Cese del IERIC que cada
-- uno tiene en su propia carpeta, junto a su CUIL. Se leyó de ahí.
--
-- QUEDAN COMO LOS ESCRIBE EL FORMULARIO, con la inicial cortada incluida («FACUNDO S», «LEONARDO
-- G»): el campo de la libreta tiene ancho fijo y trunca. Completar esa inicial a ojo sería la única
-- parte inventada de un dato que hasta acá es todo evidencia.

update public.personas set nombre_completo = 'BALMACEDA GONZALEZ MAXIMILIANO A' where nombre_completo = 'BALMACEDA';
update public.personas set nombre_completo = 'ISAGUIRRE PABLO MARCOS'           where nombre_completo = 'ISAGUIRRE';
update public.personas set nombre_completo = 'NARBAEZ FACUNDO S'                where nombre_completo = 'NARBAEZ';
update public.personas set nombre_completo = 'SAAVEDRA MAURICIO MIGUEL'         where nombre_completo = 'SAAVEDRA';
update public.personas set nombre_completo = 'SANCHEZ ACOSTA LEONARDO G'        where nombre_completo = 'SANCHEZ';

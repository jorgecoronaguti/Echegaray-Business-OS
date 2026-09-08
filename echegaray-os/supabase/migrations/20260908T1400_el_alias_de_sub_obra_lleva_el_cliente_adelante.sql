-- CORRIGE 20260908T1300. Esa migración dice que la clave del alias lleva el cliente adelante «así el
-- alias no captura un rótulo suelto de otra fuente» — y en la misma sentencia insertó uno sin cliente:
-- norm_obra('OFICINAS Y FABRICA') → le-comedor. Un rótulo «OFICINAS Y FABRICA» de Compras o de otro
-- cliente caería en La Estrella sin que nadie lo decidiera. Se quita; quedan los tres con cliente.
--
-- Y el número de la cabecera de aquella migración era 317 filas: la re-corrida real movió 345
-- (290 OFICINAS Y FABRICA + 45 PISO 120M + 10 Entre). Aquella no se edita porque ya está aplicada y
-- registrada con su hash; el dato correcto queda acá.
delete from public.obra_alias
 where alias = public.norm_obra('OFICINAS Y FABRICA')
   and obra_id = 'le-comedor'
   and ejemplo_raw = 'JORNALES: OFICINAS Y FABRICA';

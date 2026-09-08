-- TRES RÓTULOS DE JORNALES QUE EL EJE DE OBRAS NO CONOCÍA — y 317 filas de registros_hh que por eso
-- habían caído a la obra «madre» del cliente (decisión del dueño, 08/09/2026).
--
-- El importador JORNALES → registros_hh resuelve el rótulo CLIENTE · OBRA de la planilla contra este
-- diccionario; lo que no reconoce lo deja al nivel del cliente y lo dice en `notas`. Estos tres eran
-- inequívocos y el dueño los confirmó:
--
--   · «LA ESTRELLA · OFICINAS Y FABRICA» (16/04 → 15/07/2026) → le-comedor «Oficina y Fábrica de
--     Palitos» (La Estrella, 01/01 → 03/07/2026): única obra del cliente con ese nombre y esas fechas.
--   · «MESSINAS · PISO 120M» (16/07 → 14/08/2026) → messina-pisos-120-rampa «PISOS 120 M² Y RAMPA»,
--     la obra EN CARTERA (activa). `pisos-120m2` (cerrada) arranca el mismo 20/07: es la misma obra
--     dada de alta dos veces; el dueño eligió la que está en cartera.
--   · «JAVIER SANCHEZ · Entre» (03/08 → 14/08/2026) → entrepiso-y-escalera (San Francisco, plan
--     10/08 → 21/08/2026). «Entre» es la abreviatura de la planilla.
--
-- Lo que sigue al nivel del cliente porque NO es inequívoco: «LA ESTRELLA · MAMPOSTERIA», «GALPON 8»,
-- «Cierre de Obra», «OFICINA» (a secas), «JAVIER SANCHEZ · Revoque…». Un alias nuevo acá MUEVE las
-- filas ya importadas en la próxima corrida (no las duplica).
--
-- La clave es `norm_obra(rótulo)`, la misma que usa el resto del OS, con el cliente adelante: así el
-- alias no captura un «Entre» suelto de otra fuente.
insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw) values
  (public.norm_obra('LA ESTRELLA OFICINAS Y FABRICA'), 'le-comedor',              'obra', 'JORNALES: LA ESTRELLA · OFICINAS Y FABRICA'),
  (public.norm_obra('OFICINAS Y FABRICA'),             'le-comedor',              'obra', 'JORNALES: OFICINAS Y FABRICA'),
  (public.norm_obra('MESSINAS PISO 120M'),             'messina-pisos-120-rampa', 'obra', 'JORNALES: MESSINAS · PISO 120M'),
  (public.norm_obra('JAVIER SANCHEZ Entre'),           'entrepiso-y-escalera',    'obra', 'JORNALES: JAVIER SANCHEZ · Entre')
on conflict (alias) do nothing;

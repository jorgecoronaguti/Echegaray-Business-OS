-- ALIAS DE CLIENTE QUE FALTABAN EN EL EJE — el mismo cliente escrito distinto según la planilla.
--
-- QUÉ PASÓ (20/07): armé el cuadro "por cliente" de Jornales por Quincena usando el texto tal cual
-- aparece en el archivo JORNALES ("JAVIER SANCHEZ"). El dueño lo corrigió al nombre real de la
-- empresa ("San Francisco") y el cuadro se fue a $0 con una diferencia de -$53.448.688 contra el
-- total de quincenas. No fue un error de fórmula: el eje canónico NO SABÍA que son el mismo cliente.
--
-- EVIDENCIA (no es interpretación mía, lo dice la propia planilla):
--   · Compras, desplegable "Cliente / Asignación": la opción oficial es "San Francisco".
--   · RESUMEN, etiqueta de la tabla dinámica: "IMOTOR/San Francisco/JAVI SANCHEZ" — un solo cliente.
--   · RESUMEN, etiqueta de la tabla dinámica: "LA ESTRELLA /ALIMENTOS DEL SUR SAS" — un solo cliente.
--   · _J_OBREROS columna CLIENTE: 135 filas dicen "JAVIER SANCHEZ", ninguna dice "San Francisco".
--
-- REGLA QUE ESTO DEFIENDE: el nombre canónico es el de la empresa (el del desplegable de Compras),
-- y las grafías de cada planilla son alias. Nunca al revés: si el canónico fuera el texto de una
-- planilla, cada planilla nueva crearía un cliente nuevo.

insert into public.obra_alias (alias, obra_id, clasificacion)
select v.alias, o.id, 'obra'
  from (values
    -- Cómo lo escribe el archivo JORNALES (Obreros 26) — la persona, no la obra.
    ('javier sanchez', 'San Francisco'),
    ('javi sanchez',   'San Francisco'),
    -- Cómo lo escribe la facturación: IMOTOR es la razón social del mismo cliente.
    ('imotor',         'San Francisco'),
    -- La Estrella factura como Alimentos del Sur SAS.
    ('alimentos sur sas', 'La Estrella'),
    ('alimentos sur',     'La Estrella')
  ) as v(alias, obra)
  join public.obra_canonica o on o.nombre = v.obra
 where not exists (select 1 from public.obra_alias a where a.alias = v.alias);

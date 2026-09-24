-- «FACUNDO BUTIERREZ» es el único legajo cargado en orden Nombre Apellido: la heurística de la precarga
-- (20260924T2210) lo dio vuelta a «Butierrez Facundo». Sólo si nadie lo corrigió todavía.
update public.personas set nombre_para_mostrar = 'Facundo Butierrez'
 where nombre_completo = 'FACUNDO BUTIERREZ' and nombre_para_mostrar = 'Butierrez Facundo' and nombre_para_mostrar_fuente = 'heuristica';

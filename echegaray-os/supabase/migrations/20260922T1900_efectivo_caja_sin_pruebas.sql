-- EFECTIVO A RENDIR: LAS PERSONAS DE PRUEBA NO LLEGAN A LA CAJA REAL (22/09/2026).
--
-- Los usuarios y personas de las pruebas e2e viven en la base de producción (`personas.es_prueba`). La
-- QA visual del módulo creó una entrega de $1,50 a «[PRUEBA E2E] QA Campo» y la réplica `_EFECTIVO_RAW`
-- del Sheet real la levantó: una prueba sin anular habría descontado plata de la CAJA de la empresa.
-- La vista que alimenta la réplica excluye a las personas de prueba; las pantallas las siguen viendo
-- (para poder probarlas), la caja no.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
create or replace view public.efectivo_movimiento_caja with (security_invoker = true) as
  select e.fecha, e.codigo, p.nombre_completo as persona,
         coalesce(o.nombre, 'Estructura') as destino, 'Entrega'::text as movimiento,
         -e.monto as importe, e.creada_en as registrado_en
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false)
  union all
  select d.fecha, e.codigo, p.nombre_completo, coalesce(o.nombre, 'Estructura'), 'Devolución', d.monto, d.registrada_en
    from public.efectivo_devolucion d
    join public.efectivo_entrega e on e.id = d.entrega_id
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
   where e.anulada_en is null and not coalesce(p.es_prueba, false);

notify pgrst, 'reload schema';

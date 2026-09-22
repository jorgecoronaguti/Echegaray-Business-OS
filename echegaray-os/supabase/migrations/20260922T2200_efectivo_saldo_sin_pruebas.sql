-- LAS ENTREGAS DE PRUEBA, FUERA DE LA VISTA — y el nombre nunca nulo (auditoría de cierre, 22/09/2026).
--
-- La 2100 cambió `join personas` por `left join` para que la persona vea SU entrega. Efecto no buscado: las
-- entregas de personas `es_prueba`, que hasta entonces escondía por accidente la RLS restrictiva de
-- `personas`, pasaron a salir con `persona` en null. Dos consecuencias en Administración: suman en «Efectivo
-- en manos», y las pantallas que hacen `persona.split(...)` (FichaEntrega, PanelObservado, RevisarComprobante)
-- rompen. La entrega de prueba de $ 1,50 existe en producción.
--
-- No se vuelve al `join`: se filtra con una función `security definer` que mira `personas` SIN la RLS, que es
-- la única forma de distinguir «es de prueba» de «no puedo ver esa fila». Es el mismo criterio que la caja
-- (migración 1900) y deja la vista coherente con ella: lo de prueba no existe para nadie.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.
create or replace function public.persona_es_prueba(p_persona uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select p.es_prueba from public.personas p where p.id = p_persona), false)
$$;
revoke all on function public.persona_es_prueba(uuid) from public, anon;
grant execute on function public.persona_es_prueba(uuid) to authenticated;

create or replace view public.efectivo_entrega_saldo with (security_invoker = true) as
  select e.id, e.codigo, e.persona_id,
         -- NUNCA NULO: quien no puede ver la fila de `personas` igual tiene que poder leer su entrega.
         coalesce(p.nombre_completo, 'sin nombre') as persona,
         e.obra_id, o.nombre as obra,
         e.estructura, e.fecha, e.monto as entregado,
         coalesce(r.rendido, 0)  as rendido,  coalesce(r.filas, 0) as filas_rendidas,
         coalesce(d.devuelto, 0) as devuelto,
         e.monto - coalesce(r.rendido, 0) - coalesce(d.devuelto, 0) as en_su_poder,
         (e.conformidad_en is not null or e.conformidad_papel_url is not null) as conformidad,
         case when e.anulada_en is not null then 'anulada'
              when e.cerrada_en is not null then 'cerrada'
              else 'abierta' end as estado,
         e.para_que, e.conformidad_en, e.cerrada_en, e.anulada_en, e.anulada_motivo
    from public.efectivo_entrega e
    left join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join lateral (select sum(monto) rendido, count(*) filas from public.efectivo_rendicion where entrega_id = e.id) r on true
    left join lateral (select sum(monto) devuelto from public.efectivo_devolucion where entrega_id = e.id) d on true
   where not public.persona_es_prueba(e.persona_id);
grant select on public.efectivo_entrega_saldo to authenticated;
notify pgrst, 'reload schema';

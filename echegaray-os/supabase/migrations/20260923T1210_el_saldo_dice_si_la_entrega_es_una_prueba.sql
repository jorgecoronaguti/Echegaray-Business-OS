-- LA VISTA DEL SALDO DICE SI LA ENTREGA ES UNA PRUEBA (cierre de la 20260923T1200).
--
-- La marca sin publicar no sirve: la pantalla tiene que saber si esta entrega se puede BORRAR o sólo
-- anular, y tiene que poder decirlo en la lista —una prueba y una entrega real no se leen igual—. Es
-- la misma vista de siempre, con una columna más al final; nada de lo que ya se lee cambia de lugar.
--
-- `security_invoker` y el `left join` a `personas` quedan como estaban: la lección del 22/09 sigue
-- valiendo (una vista de un módulo no puede depender de la RLS de otra tabla para decidir si la fila
-- existe), y acá `personas` entra con `join` porque la entrega SIN persona no existe: es una FK.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

create or replace view public.efectivo_entrega_saldo with (security_invoker = true) as
  select e.id, e.codigo, e.persona_id, p.nombre_completo as persona, e.obra_id, o.nombre as obra,
         e.estructura, e.fecha, e.monto as entregado,
         coalesce(r.rendido, 0)  as rendido,  coalesce(r.filas, 0) as filas_rendidas,
         coalesce(d.devuelto, 0) as devuelto,
         e.monto - coalesce(r.rendido, 0) - coalesce(d.devuelto, 0) as en_su_poder,
         (e.conformidad_en is not null or e.conformidad_papel_url is not null) as conformidad,
         case when e.anulada_en is not null then 'anulada'
              when e.cerrada_en is not null then 'cerrada'
              else 'abierta' end as estado,
         e.para_que, e.conformidad_en, e.cerrada_en, e.anulada_en, e.anulada_motivo,
         e.es_prueba
    from public.efectivo_entrega e
    join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join lateral (select sum(monto) rendido, count(*) filas from public.efectivo_rendicion where entrega_id = e.id) r on true
    left join lateral (select sum(monto) devuelto from public.efectivo_devolucion where entrega_id = e.id) d on true;

notify pgrst, 'reload schema';

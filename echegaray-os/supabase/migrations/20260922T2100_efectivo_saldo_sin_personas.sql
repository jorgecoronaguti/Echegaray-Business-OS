-- LA PERSONA NO VEÍA SU PROPIA ENTREGA (QA de las pantallas de teléfono, 22/09/2026).
--
-- `efectivo_entrega_saldo` es `security_invoker` y hacía `join public.personas`. La RLS de `efectivo_entrega`
-- deja ver lo propio, pero la de `personas` NO garantiza que alguien se vea a sí mismo: pide Administración,
-- una asignación de obra que el rol pueda ver, o registros de horas. Un obrero sin asignación —y toda persona
-- marcada `es_prueba` fuera de una sesión de prueba— desaparecía del JOIN, y «Mi efectivo» decía
-- «No tenés efectivo de la empresa» teniendo plata en la mano. Medido: la entrega ER-0002 existe, la tabla la
-- deja ver, y la vista devolvía cero filas.
--
-- El nombre pasa a `left join`: es una comodidad de las pantallas de Administración —que sí ven `personas`—
-- y no puede decidir si la fila EXISTE. Nada más cambia: mismas columnas, mismo orden, mismo security_invoker.
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
         e.para_que, e.conformidad_en, e.cerrada_en, e.anulada_en, e.anulada_motivo
    from public.efectivo_entrega e
    left join public.personas p on p.id = e.persona_id
    left join public.obra_canonica o on o.id = e.obra_id
    left join lateral (select sum(monto) rendido, count(*) filas from public.efectivo_rendicion where entrega_id = e.id) r on true
    left join lateral (select sum(monto) devuelto from public.efectivo_devolucion where entrega_id = e.id) d on true;
grant select on public.efectivo_entrega_saldo to authenticated;
notify pgrst, 'reload schema';

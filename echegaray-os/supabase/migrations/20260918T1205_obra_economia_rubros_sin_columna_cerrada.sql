-- `obra_economia_rubros` NO LEE `obra_canonica.monto_contratado` (18/09/2026).
--
-- La vista es security_invoker y esa columna está cerrada por GRANT de columna para `authenticated`
-- (decisión del 10/09: el formulario no es la definición del contratado). Con sesión de Dirección la
-- vista entera contestaba «permission denied for table obra_canonica»: Analíticas no leía nada. El
-- origen «formulario» se deduce sin tocar la columna: no hay fila en la cartera y `contratado_de_obra`
-- (security definer) igual devuelve un número.
set local lock_timeout = '5s';

create or replace view public.obra_economia_rubros with (security_invoker = true) as
with rubros as (
  select r.obra_canonica_id,
         jsonb_object_agg(r.rubro, jsonb_build_object(
           'monto', r.monto, 'motivo', r.motivo, 'estimado', r.estimado, 'cita', r.cita, 'detalle', r.detalle)) as por_rubro,
         max(r.monto) filter (where r.rubro = 'mano_obra')       as mano_obra,
         max(r.monto) filter (where r.rubro = 'materiales')      as materiales,
         max(r.monto) filter (where r.rubro = 'subcontratistas') as subcontratistas,
         max(r.monto) filter (where r.rubro = 'otros')           as otros,
         bool_or(r.estimado) as estimado
    from public.obra_presupuesto_rubro r
   group by r.obra_canonica_id
),
hh as (
  select p.obra_canonica_id, p.hh_estimada
    from public.presupuestos p
   where p.estado = 'aprobado' and p.obra_canonica_id is not null and p.hh_estimada > 0
)
select oc.id                        as obra_canonica_id,
       oc.nombre,
       oc.cliente_id,
       oc.estado,
       oc.obra_padre_id,
       public.contratado_de_obra(oc.id) as contratado,
       e.contratado_usd,
       coalesce(e.contrato_fuente, e.origen, case when e.obra_canonica_id is null and public.contratado_de_obra(oc.id) is not null then 'formulario' end) as contratado_origen,
       e.referencia                 as contratado_referencia,
       e.contrato_mano_obra,
       e.contrato_mano_obra_usd,
       e.contrato_materiales,
       e.contrato_materiales_usd,
       e.contrato_total,
       e.contrato_fuente_drive_id,
       e.contrato_fuente_nombre,
       e.contrato_cita,
       e.tipo_cambio,
       l.estado                     as presupuesto_estado,
       l.motivo                     as presupuesto_motivo,
       l.costo_directo              as presupuestado_total,
       l.moneda                     as presupuesto_moneda,
       coalesce(r.estimado, l.estimado, false) as presupuesto_estimado,
       l.fuente_drive_id            as presupuesto_fuente_drive_id,
       l.fuente_nombre              as presupuesto_fuente_nombre,
       l.fuente_fecha               as presupuesto_fecha,
       l.fuente_modificado          as presupuesto_fuente_modificado,
       l.cita                       as presupuesto_cita,
       l.leido_en                   as presupuesto_leido_en,
       r.mano_obra                  as presupuestado_mano_obra,
       r.materiales                 as presupuestado_materiales,
       r.subcontratistas            as presupuestado_subcontratistas,
       r.otros                      as presupuestado_otros,
       coalesce(r.por_rubro, '{}'::jsonb) as presupuesto_rubros,
       h.hh_estimada                as presupuesto_hh
  from public.obra_canonica oc
  left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
  left join public.obra_presupuesto_lectura l on l.obra_canonica_id = oc.id
  left join rubros r on r.obra_canonica_id = oc.id
  left join hh h on h.obra_canonica_id = oc.id
 where oc.fusionada_en is null;
grant select on public.obra_economia_rubros to authenticated, service_role;

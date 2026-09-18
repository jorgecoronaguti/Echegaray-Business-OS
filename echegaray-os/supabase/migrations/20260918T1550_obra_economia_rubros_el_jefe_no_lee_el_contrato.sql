-- EL JEFE DE OBRA NO LEE LOS METADATOS DEL CONTRATO EN `obra_economia_rubros` (18/09/2026).
--
-- `obra_economia_cartera` ya le enmascara al jefe (es_administracion sin ve_economia) el precio y sus
-- montos, pero `obra_economia_rubros` —la vista de Analíticas y de la ficha de la obra— reenviaba sin
-- máscara `contratado_origen` («oc-usd-x-tc», «suma-viva», «contrato»), `contratado_referencia`
-- («según OC 2256»), `contrato_fuente_drive_id`/`contrato_fuente_nombre` (el archivo del contrato) y
-- `contrato_cita`. No son montos, pero son el precio por otro camino: dicen de dónde sale, en qué
-- moneda y en qué papel está. La regla del 19/08 es que el jefe administra la obra (sus costos) y no ve
-- la venta. Se enmascaran acá con la misma puerta que `contratado_de_obra()` —`ve_economia() OR
-- auth.uid() IS NULL`—. `contrato_cita` también: su máscara en `obra_economia_cartera` (T1100) vive en
-- otra rama. Sólo se envuelven columnas de TEXTO: los montos del contrato ya llegan enmascarados de
-- `obra_economia_cartera`, y envolver un numeric(p,s) en CASE le quita el typmod y `create or replace
-- view` lo rechazaría («cannot change data type of view column»).
--
-- Mismo cuerpo que 20260918T1520 con las columnas del contrato envueltas: mismos nombres, mismo orden,
-- mismos tipos (create or replace view lo exige). Lo que ve Dirección y Administración no cambia; el
-- jefe no ve Analíticas (la página es notFound sin ve_economia) y la ficha no lee estas columnas.
--
-- NO APLICADA. Se aplica con el deploy de la rama, después de 20260918T1520.
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
aprob as (
  select p.obra_canonica_id, p.hh_estimada, p.costo_indirecto_presupuestado
    from public.presupuestos p
   where p.estado = 'aprobado' and p.obra_canonica_id is not null
)
select oc.id                        as obra_canonica_id,
       oc.nombre,
       oc.cliente_id,
       oc.estado,
       oc.obra_padre_id,
       public.contratado_de_obra(oc.id) as contratado,
       e.contratado_usd,
       case when (public.ve_economia() or auth.uid() is null) then
         coalesce(e.contrato_fuente, e.origen, case when e.obra_canonica_id is null and public.contratado_de_obra(oc.id) is not null then 'formulario' end)
       end as contratado_origen,
       case when (public.ve_economia() or auth.uid() is null) then e.referencia end as contratado_referencia,
       e.contrato_mano_obra,
       e.contrato_mano_obra_usd,
       e.contrato_materiales,
       e.contrato_materiales_usd,
       e.contrato_total,
       case when (public.ve_economia() or auth.uid() is null) then e.contrato_fuente_drive_id end as contrato_fuente_drive_id,
       case when (public.ve_economia() or auth.uid() is null) then e.contrato_fuente_nombre end as contrato_fuente_nombre,
       case when (public.ve_economia() or auth.uid() is null) then e.contrato_cita end as contrato_cita,
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
       -- LAS HORAS SON LAS DEL DOCUMENTO (D6): Σ de las horas de oficial y ayudante que el cargador leyó
       -- ítem por ítem. `presupuestos.hh_estimada` queda sólo de respaldo (Pisos 120, sin lectura por insumo).
       coalesce(l.hh_cotizadas, nullif(h.hh_estimada, 0))::numeric(10,2) as presupuesto_hh,
       case when l.hh_cotizadas is not null then 'documento' when nullif(h.hh_estimada, 0) is not null then 'presupuestos' end as presupuesto_hh_origen,
       -- ═══ EL MARGEN COTIZADO: UNA SOLA DEFINICIÓN (D1, 18/09/2026) ═══
       -- contratado − costo directo presupuestado − gastos generales de la cotización. Es la única cifra
       -- que la app llama «margen cotizado»: la ficha de la obra y el chat la leen de acá. Sin alguna de
       -- las tres patas —o con un contratado que es la suma viva de Cobranzas— es NULL, nunca un número
       -- parcial.
       h.costo_indirecto_presupuestado as gastos_generales_cotizados,
       case when l.estado = 'leido' and public.contratado_de_obra(oc.id) is not null
             and coalesce(e.origen, '') <> 'suma-viva' and h.costo_indirecto_presupuestado is not null
            then public.contratado_de_obra(oc.id) - l.costo_directo - h.costo_indirecto_presupuestado
       end as margen_cotizado
  from public.obra_canonica oc
  left join public.obra_economia_cartera e on e.obra_canonica_id = oc.id
  left join public.obra_presupuesto_lectura l on l.obra_canonica_id = oc.id
  left join rubros r on r.obra_canonica_id = oc.id
  left join aprob h on h.obra_canonica_id = oc.id
 where oc.fusionada_en is null;
grant select on public.obra_economia_rubros to authenticated, service_role;

notify pgrst, 'reload schema';

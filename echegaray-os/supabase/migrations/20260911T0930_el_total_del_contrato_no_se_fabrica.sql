-- ═══ EL TOTAL DEL CONTRATO NO SE FABRICA: SIN DÓLAR NO HAY TOTAL, Y CERO NO ES UNA BASE ══════════
--
-- Auditor de cierre, 11/09/2026, sobre la migración 20260911T0900:
--   5 · `contrato_total = coalesce(mano_obra_valuada, 0) + coalesce(materiales, 0)`: con la tabla
--       tipo_cambio vacía o atrasada, `contratado_valuado()` devuelve NULL, la pata en dólares de
--       Quattropani desaparece sin ruido y el total queda en $ 44.110.169 —los materiales solos—:
--       la barra publicaría «100 % + $ 45,9 M por encima del contrato», que es mentira.
--   6 · `mano_obra = null, materiales = 0` da total 0, y la pantalla escribía «$ 0» tapando el
--       precio de OBRAS. Un total de cero no es una base: la pantalla ya lo trata como NULL y acá
--       la vista deja de publicarlo.
--   7 · la `nota` de la fila (una INFERENCIA declarada, Dilución de ácido) no viajaba a la pantalla.
--
-- Regla: si el papel fija un componente y no se puede valuar en pesos, el total es NULL; si el
-- total da cero, es NULL. Y `contrato_nota` viaja con el resto.

create or replace view public.obra_economia_cartera with (security_invoker = false) as
with valuado as (
  select c.*,
         case when c.mano_obra_moneda = 'USD' then public.contratado_valuado(null, c.mano_obra) else c.mano_obra end as mo_pesos,
         case when c.materiales_moneda = 'USD' then public.contratado_valuado(null, c.materiales) else c.materiales end as mat_pesos
    from public.obra_contrato c
)
select e.obra_canonica_id,
       e.obra_clave,
       case when public.ve_economia() or auth.uid() is null
            then public.contratado_valuado(e.contratado, e.contratado_usd) end as contratado,
       case when public.ve_economia() or auth.uid() is null then e.contratado_usd end as contratado_usd,
       e.costo_mo,
       e.costo_materiales,
       case when public.ve_economia() or auth.uid() is null
            then case when e.contratado_usd is not null and public.tc_vigente() is not null
                           and e.costo_mo is not null and e.costo_materiales is not null
                      then public.contratado_valuado(e.contratado, e.contratado_usd)
                           - e.costo_mo - e.costo_materiales
                      else e.margen end end as margen,
       e.plazo_desde,
       e.plazo_hasta,
       e.origen,
       e.leido_en,
       e.referencia,
       e.nota,
       e.oc_civa_ventana,
       e.oc_civa_historico,
       e.oc_n_ventana,
       e.oc_n_historico,
       public.tc_vigente() as tipo_cambio,
       case when public.ve_economia() or auth.uid() is null then c.mo_pesos end as contrato_mano_obra,
       case when public.ve_economia() or auth.uid() is null
            then case when c.mano_obra_moneda = 'USD' then c.mano_obra end end as contrato_mano_obra_usd,
       case when public.ve_economia() or auth.uid() is null then c.mat_pesos end as contrato_materiales,
       case when public.ve_economia() or auth.uid() is null
            then case when c.materiales_moneda = 'USD' then c.materiales end end as contrato_materiales_usd,
       case when public.ve_economia() or auth.uid() is null
            then case
                   when c.obra_id is null then null
                   -- un componente fijado en el papel que no se puede valuar anula el total
                   when c.mano_obra is not null and c.mo_pesos is null then null
                   when c.materiales is not null and c.mat_pesos is null then null
                   when coalesce(c.mo_pesos, 0) + coalesce(c.mat_pesos, 0) <= 0 then null
                   else coalesce(c.mo_pesos, 0) + coalesce(c.mat_pesos, 0)
                 end end as contrato_total,
       c.fuente_tipo     as contrato_fuente,
       c.fuente_drive_id as contrato_fuente_drive_id,
       c.fuente_nombre   as contrato_fuente_nombre,
       c.cita            as contrato_cita,
       c.nota            as contrato_nota
  from public.obra_economia_sheet e
  left join valuado c on c.obra_id = e.obra_canonica_id;

grant select on public.obra_economia_cartera to authenticated;
grant select on public.obra_economia_cartera to service_role;

-- La RPC transporta la nota.
create or replace function public.pantalla_clientes()
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select jsonb_build_object(

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    'clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'cliente_id', c.cliente_id, 'slug', c.slug,
                 'nombre_comercial', c.nombre_comercial, 'razon_social', c.razon_social,
                 'cuit', c.cuit, 'direccion', c.direccion, 'telefono', c.telefono,
                 'email', c.email, 'responsable_id', c.responsable_id,
                 'responsable_nombre', c.responsable_nombre, 'drive_carpeta_id', c.drive_carpeta_id,
                 'activo', c.activo, 'notas', c.notas, 'n_obras', c.n_obras,
                 'n_obras_activas', c.n_obras_activas,
                 'restricciones_abiertas', c.restricciones_abiertas,
                 'avance_sincronizado_en', c.avance_sincronizado_en,
                 'n_contactos', c.n_contactos, 'n_documentos', c.n_documentos)
               order by c.n_obras_activas desc, c.nombre_comercial asc), '[]'::jsonb)
        from public.cliente_panel c
    ),

    'obras_activas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'avance_pct', o.avance_pct,
                                  'jefe_obra', o.jefe_obra)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from public.obra_panel o
    ),

    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
    ),

    'certificados', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
                                  'fecha_certificacion', t.fecha_certificacion,
                                  'fecha_facturacion', t.fecha_facturacion,
                                  'fecha_cobranza', t.fecha_cobranza)
               order by t.fecha_certificacion asc), '[]'::jsonb)
        from public.certificados t
    ),

    'papeles', (
      select coalesce(jsonb_agg(
               jsonb_build_object('id', r.id, 'cliente_id', r.cliente_id, 'obra_id', r.obra_id,
                                  'tipo', r.tipo, 'numero', r.numero, 'fecha', r.fecha,
                                  'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
                                  'nombre_archivo', r.nombre_archivo,
                                  'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.eliminado_en is null
    ),

    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  -- el desglose del contrato (11/09/2026)
                                  'contrato_mano_obra', e.contrato_mano_obra,
                                  'contrato_mano_obra_usd', e.contrato_mano_obra_usd,
                                  'contrato_materiales', e.contrato_materiales,
                                  'contrato_materiales_usd', e.contrato_materiales_usd,
                                  'contrato_total', e.contrato_total,
                                  'contrato_fuente', e.contrato_fuente,
                                  'contrato_fuente_drive_id', e.contrato_fuente_drive_id,
                                  'contrato_fuente_nombre', e.contrato_fuente_nombre,
                                  'contrato_cita', e.contrato_cita,
                                  'contrato_nota', e.contrato_nota)), '[]'::jsonb)
        from public.obra_economia_cartera e
    ),

    'contratos', (
      select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
        from public.cliente_documento d
       where d.rol = 'contrato'
    ),

    'economia_clientes', (
      select coalesce(jsonb_agg(
               jsonb_build_object('cliente_id', x.cliente_id, 'contratado', x.contratado,
                                  'contratado_en_curso', x.contratado_en_curso,
                                  'n_obras_en_curso', x.n_obras_en_curso,
                                  'n_obras_cerradas', x.n_obras_cerradas,
                                  'n_obras_con_precio', x.n_obras_con_precio,
                                  'n_obras_sin_precio', x.n_obras_sin_precio,
                                  'costo_real', x.costo_real, 'facturado_90d', x.facturado_90d,
                                  'cobrado_90d', x.cobrado_90d, 'cobrado_total', x.cobrado_total,
                                  'cobrado_neto_total', x.cobrado_neto_total, 'saldo', x.saldo,
                                  'vencido', x.vencido, 'por_vencer', x.por_vencer,
                                  'pendiente_contractual', x.pendiente_contractual)), '[]'::jsonb)
        from public.cliente_economia x
    )
  )
$function$;

-- LA CARTERA TRAE EL COSTO A LA FECHA DE TODAS LAS OBRAS, NO SÓLO DE LAS ACTIVAS (14/09/2026).
--
-- QA de tercero: ARCOR mostraba Materiales y Mano de obra «—» y La Estrella sólo $80 M (lo sin obra),
-- porque `pantalla_clientes()` pedía `costo_de_obras_a_la_fecha` sólo para `estado = 'activa'` y sus
-- obras están cerradas. El dueño pidió «los costos hasta el momento sumados de cada obra de cada
-- cliente»: una obra cerrada gastó igual. La ficha ya calculaba todas; la cartera ahora también, y la
-- identidad «obras + sin obra = Compras del cliente» vuelve a cerrar en la cartera.
--
-- Cambio único sobre la definición viva: se quita el filtro de estado en `costo_obra`.

CREATE OR REPLACE FUNCTION public.pantalla_clientes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with obras as materialized (
    select o.obra_id, o.nombre, o.cliente_id, o.estado, o.avance_pct, o.jefe_obra, o.orden,
           o.obra_padre_id
      from public.obra_panel o
  )
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
                                  'jefe_obra', o.jefe_obra,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct,
                                  'obra_padre_id', o.obra_padre_id)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
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
                                  'obra_padre_id', e.obra_padre_id,
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
                                  -- EL DESGLOSE PRESUPUESTADO SIGUE VIAJANDO HASTA QUE LA CARTERA
                                  -- (`TablaClientes`) deje de dibujarlo: sacarlo antes dejaría sus dos
                                  -- columnas en «—». Se retira junto con ese cambio de pantalla.
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

    -- ═══ LO GASTADO A LA FECHA EN CADA TRABAJO EN CURSO (dueño, 13/09/2026) ═══
    'costo_obra', case
      when not (select public.es_administracion()) then null::jsonb
      else public.costo_de_obras_a_la_fecha(array(select o.obra_id from obras o))
    end,

    'costo_sin_obra', case
      when not (select public.es_administracion()) then null::jsonb
      else public.compras_sin_obra_de_clientes(array(select c.cliente_id from public.cliente_panel c))
    end,

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


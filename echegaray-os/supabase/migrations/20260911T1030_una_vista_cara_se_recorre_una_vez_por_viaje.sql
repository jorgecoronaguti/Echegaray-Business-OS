-- UNA VISTA CARA SE RECORRE UNA VEZ POR VIAJE, NO DOS NI TRES.
--
-- ═══ EL PROBLEMA MEDIDO (11/09/2026, `pg_stat_statements`) ═══
--
-- Las tres RPC de pantalla son el 93% del tiempo de base del rol `authenticated`: 242,8 s de 261 s.
-- Todo lo demás junto es el 7%. Y dentro de ellas había trabajo repetido dentro del MISMO viaje:
--
--   · `pantalla_clientes()` recorría `public.obra_panel` DOS veces —`obras_activas` y
--     `obras_todas`—. `obra_panel` es la vista más cara del viaje: 384 nodos de plan y 9.770
--     buffers para devolver 25 filas.
--   · `campanita_atencion()` recorría `public.comprobante_compra` TRES veces —sin imputar, sin
--     resolver y duplicados—. La campanita es la consulta MÁS LLAMADA del OS: una por pantalla
--     (46 llamadas contra 15 de `pantalla_clientes()` en la misma ventana).
--
-- ═══ QUÉ CAMBIA, Y QUÉ NO ═══
--
-- Cambia CUÁNTAS VECES se lee cada vista. No cambia ni una definición: los `where` siguen siendo
-- los mismos, `comprobante_cumple_filtro()` sigue siendo el único criterio de los filtros de
-- compras, y el jsonb que sale es IDÉNTICO BYTE A BYTE al de la versión anterior — medido, no
-- supuesto: las dos versiones convivieron en una transacción y se comparó `JSON.stringify` de cada
-- una (evidencia en `/tmp/claude-1001/perf-db-1109/antes.md`).
--
-- ═══ LO MEDIDO, CON LA MÉTRICA QUE NO MIENTE ═══
--
-- La métrica primaria es `shared hit` —buffers accedidos— y no los ms: no depende de la carga de la
-- VM, que durante parte de la jornada estuvo saturada por la suite completa corriendo contra esta
-- misma base. Y se midió DOS VECES con la candidata PRIMERO, para que el calentamiento de caché no
-- la favorezca: una con la VM cargada y otra con la VM libre. Los cuatro números dieron lo mismo,
-- que es la razón por la que se pueden escribir acá:
--
--   | RPC                    | buffers antes | buffers después | ms mínimo antes | después |
--   |------------------------|---------------|-----------------|-----------------|---------|
--   | `pantalla_clientes()`  |        17.780 |      13.090     |          223 ms |  190 ms |
--   | `campanita_atencion()` |           417 |         353     |           45 ms |   41 ms |
--
-- ═══ POR QUÉ `MATERIALIZED` VA EXPLÍCITO ═══
--
-- Postgres materializa un CTE referenciado más de una vez y lo INLINEA cuando hay una sola
-- referencia. Si mañana una de las dos claves de `obras_*` se fuera, el CTE quedaría con una sola
-- referencia y la doble pasada volvería sola, sin que nadie la escribiera. `materialized` lo clava.
--
-- ═══ LA ADVERTENCIA DE 20260911T0130, Y POR QUÉ EL NÚMERO LA CONTRADICE ═══
--
-- Esa migración dejó escrito que meter los tres contadores en un solo recorrido «obligaría a
-- evaluar el parecido de las 737 filas para contestar cuántas no tienen obra», porque
-- `tiene_posible_duplicado` es un `exists` y una consulta que no lo menciona no lo evalúa.
-- La dirección es correcta: el CTE evalúa el parecido para todas las filas. Lo que la predicción no
-- contaba es que la pasada de `duplicados` YA lo evaluaba para todas —era su `where`—, así que el
-- `exists` se pagaba igual y además se pagaban dos recorridos más. Por eso el neto es a favor:
-- 417 → 353 buffers. La advertencia queda derogada POR MEDICIÓN, no por opinión.
--
-- No se toca `pantalla_cliente(p_slug)`: ya recorre `obra_panel` una sola vez, con el CTE
-- `sus_obras` de 20260911T0040. Éste sigue ese mismo patrón.

create or replace function public.pantalla_clientes()
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $$
  -- LAS OBRAS, UNA SOLA VEZ (11/09/2026). `obras_activas` y `obras_todas` recorrían
  -- `public.obra_panel` —384 nodos de plan, la vista más cara del viaje— DOS veces en la misma
  -- llamada. Un CTE referenciado dos veces Postgres lo materializa, así que la vista se recorre una
  -- sola vez y las dos claves salen del mismo material. `materialized` va EXPLÍCITO: si mañana una
  -- de las dos claves se fuera, el CTE quedaría con una sola referencia y Postgres lo volvería a
  -- inlinear — o sea, la doble pasada volvería sola sin que nadie la escribiera.
  with obras as materialized (
    select o.obra_id, o.nombre, o.cliente_id, o.estado, o.avance_pct, o.jefe_obra, o.orden
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
                                  'jefe_obra', o.jefe_obra)
               order by o.orden asc, o.nombre asc), '[]'::jsonb)
        from obras o
       where o.estado = 'activa'
    ),

    'obras_todas', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_id', o.obra_id, 'nombre', o.nombre,
                                  'cliente_id', o.cliente_id, 'estado', o.estado,
                                  'avance_pct', o.avance_pct)
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
$$;

revoke all on function public.pantalla_clientes() from public;
grant execute on function public.pantalla_clientes() to authenticated, service_role;

create or replace function public.campanita_atencion()
 returns jsonb
 language sql
 stable
 security invoker
 set search_path to 'public'
as $$
  -- LOS COMPROBANTES, UNA SOLA VEZ (11/09/2026). Los tres contadores de compras recorrían
  -- `public.comprobante_compra` —26 nodos de plan, con una ventana adentro para el parecido— TRES
  -- veces por navegación, y la campanita es la consulta MÁS LLAMADA del OS: una por pantalla
  -- (50 llamadas en 15 minutos en `pg_stat_statements`, contra 15 de `pantalla_clientes()`).
  --
  -- `materialized` EXPLÍCITO por la misma razón que en `pantalla_clientes()`: con una sola
  -- referencia Postgres inlinearía el CTE y las pasadas volverían sin que nadie las escribiera.
  --
  -- EL CRITERIO NO SE MUEVE: los tres `where` siguen siendo `comprobante_cumple_filtro()`, el lado
  -- SQL de PREDICADO. Cambia cuántas veces se lee la vista, no qué cuenta como pendiente.
  with compras as materialized (
    select k.imputacion, k.tiene_posible_duplicado, k.estado_control
      from public.comprobante_compra k
  )
  select jsonb_build_object(

    -- QUIÉN MIRA. Sin el rol, un jefe de obra vería «14 proveedores sin CUIT» y el clic terminaría
    -- en un redirect mudo.
    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    'proveedores_sin_cuit', (
      select count(*) from public.proveedores v where v.activo and coalesce(v.cuit, '') = ''
    ),

    -- LOS DOS PENDIENTES DE IMPUTACIÓN. Un barrido que no toca el parecido.
    'compras_sin_imputar', (
      select count(*) from compras k
       where public.comprobante_cumple_filtro('sin-imputar', k.imputacion, null, k.estado_control)
    ),
    'compras_sin_resolver', (
      select count(*) from compras k
       where public.comprobante_cumple_filtro('sin-resolver', k.imputacion, null, k.estado_control)
    ),

    -- LOS PARECIDOS SIN RESOLVER. Éste sí evalúa el parecido; desde 20260911T0120 se calcula con una
    -- ventana en vez de una subconsulta por fila.
    'compras_duplicadas', (
      select count(*) from compras k
       where public.comprobante_cumple_filtro(
         'duplicados', k.imputacion, k.tiene_posible_duplicado, k.estado_control)
    ),

    -- LOS TRES CARDINALES, con el MISMO `where` que la consulta que reemplazaron en 20260911T0020.
    'nombres_sin_resolver', (select count(*) from public.proveedor_nombre_pendiente),
    'pendientes', (select count(*) from public.imputacion_pendiente),
    'correcciones', (
      select count(*) from public.correccion_asistencia_bandeja b where b.estado = 'pendiente'
    )
  )
$$;

revoke all on function public.campanita_atencion() from public;
grant execute on function public.campanita_atencion() to authenticated, service_role;

notify pgrst, 'reload schema';

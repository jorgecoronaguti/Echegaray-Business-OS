-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO DE ADMINISTRACIÓN SE CIERRA EN LA BASE: el jefe de obra y el operario no lo leen por la API
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Reclamo del dueño (25/09/2026): «cualquiera puede entrar a ver cualquier cosa en computadora o
-- mobile». Medido ese día con la sesión real de cada nivel contra PostgREST (sólo lectura):
--
--   operario (empleado.demo@)  finanzas_caja_negra 29.705 filas · tarjeta_resumen (la Visa con saldos
--                              y límites) · cuentas_financieras 12 · clientes 5 con CUIT, mail y notas ·
--                              cliente_documento 894 · obra_egreso_proyectado 30 (pagos a proveedores
--                              con importe) · costos_reales 37 · orq_tasks/events 1.963 · proveedores 95
--   jefe (ingenieria@)         todo lo anterior + comprobantes_arca 702 · comprobante_compra 670 ·
--                              costos_obra 619 · compra_adjunto · recibos de sueldo ajenos (lista de
--                              documentacion_legajo) y los buckets de comprobantes, clientes y proveedores
--
-- La causa es una sola: casi todas esas tablas tenían `using (true)` para `authenticated` o
-- `es_administracion()`, que desde el 19/08 incluye a `jefe_obra`. Las pantallas no las mostraban,
-- pero la API sí: la puerta estaba cerrada y la cerradura abierta.
--
-- ═══ CÓMO SE CIERRA ═══
--
-- Una POLICY RESTRICTIVA `solo_administracion` por tabla: `ve_economia()` (dirección + administración)
-- para TODO comando. Restrictiva quiere decir que se suma con AND a las que ya están — no hay que
-- reescribir ni una: lo que antes pasaba sólo pasa ahora si además quien pide es Administración.
-- Es aditiva, se lee en una línea y se revierte con un `drop policy`.
--
--   · `service_role` no tiene RLS: el orquestador, los timers y las rutas de servidor que usan la
--     clave de servicio (el portal) siguen igual.
--   · Las vistas y funciones SECURITY DEFINER (dueño `postgres`, que tiene BYPASSRLS) siguen igual:
--     `mi_recibo`, `mi_documento_legajo`, `drive_file_ids_vinculados`, etc.
--   · Las vistas `security_invoker` que leen estas tablas quedan vacías para quien no es
--     Administración — `obra_costo_real` → `obra_panel.costo_real` en null para el jefe, que es lo
--     que corresponde: la economía de la obra es de Administración desde el 23/09.
--
-- ═══ EL NOMBRE DEL CLIENTE SIGUE A LA VISTA ═══
--
-- El dueño decidió el 25/09 que el índice de obras y el nombre de su cliente son iguales para todos
-- los niveles (Herramientas, cabecera de obra). Cerrar `clientes` sin más dejaba esas pantallas sin
-- nombre. Sale `cliente_rotulo`: id, nombre comercial, razón social y slug — NADA más (ni CUIT, ni
-- mail, ni teléfono, ni notas) — para el personal interno. `obra_panel`, `xsas_obra` y
-- `xsas_actividad` pasan a unirse contra ella; la ficha (`cliente_panel`) sigue contra `clientes`.
--
-- SIN `begin/commit` PROPIOS: los pone `orquestador/scripts/aplicar-migracion.mjs`.

-- 1 · El rótulo del cliente, para todos los de adentro ------------------------------------------------
create or replace view public.cliente_rotulo as
  select c.id, c.nombre_comercial, c.razon_social, c.slug, c.activo
    from public.clientes c
   where (select public.current_rol()) in ('direccion', 'administracion', 'jefe_obra', 'campo');
comment on view public.cliente_rotulo is
  'Nombre del cliente para el personal interno (sin CUIT, contacto ni notas). SECURITY DEFINER a propósito: '
  'la tabla clientes es sólo de Administración (20260926T0001). El portal no la usa.';
revoke all on public.cliente_rotulo from public, anon;
grant select on public.cliente_rotulo to authenticated, service_role;

-- Las tres vistas que nombran al cliente se reescriben sobre el rótulo. Se reemplaza la definición
-- VIVA y se exige que el reemplazo haya ocurrido: si la vista cambió de forma, la migración falla.
do $$
declare
  v record;
  def text;
  nuevo text;
begin
  for v in select * from (values
      ('obra_panel',     'LEFT JOIN clientes cl ON', 'LEFT JOIN cliente_rotulo cl ON'),
      ('xsas_obra',      'LEFT JOIN clientes c ON',  'LEFT JOIN cliente_rotulo c ON'),
      ('xsas_actividad', 'LEFT JOIN clientes cl ON', 'LEFT JOIN cliente_rotulo cl ON')
    ) as t(vista, antes, despues)
  loop
    def := regexp_replace(pg_get_viewdef(('public.' || v.vista)::regclass, false), ';\s*$', '');
    nuevo := replace(def, v.antes, v.despues);
    if nuevo = def then raise exception 'public.% no tiene «%»', v.vista, v.antes; end if;
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v.vista, nuevo);
  end loop;
end $$;

-- 2 · Policy restrictiva en las tablas de Administración ---------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    -- Clientes (CRM, portal, cobros)
    'clientes', 'cliente_contacto', 'cliente_documento', 'cliente_nota', 'cliente_acceso', 'cliente_alias',
    'cliente_actividad_portal', 'cliente_orden', 'documento_cliente', 'recibo_cliente', 'rotulo_no_es_cliente',
    'mail_saliente',
    -- Compras y costos
    'compras', 'costos_obra', 'costos_reales', 'comprobantes_arca', 'comprobante_entrada', 'compra_adjunto',
    'compra_obra_cambio', 'obra_egreso_proyectado',
    -- Proveedores (el maestro de nombres sigue legible; ver 3)
    'proveedor_alias', 'proveedor_documento', 'proveedor_notas', 'ml_resolucion', 'ml_entidad_alias',
    -- Finanzas y tesorería
    'finanzas_caja_negra', 'finanzas_calendario', 'finanzas_comparar_financiamiento',
    'finanzas_condiciones_vigentes', 'finanzas_estrategia_vigente', 'finanzas_modelo_liquidez',
    'finanzas_plan_vigente', 'finanzas_priorizar_pagos', 'cuentas_financieras', 'condiciones_financieras',
    'tarjeta_resumen', 'tarjeta_resumen_linea', 'tarjeta_cuota_a_vencer', 'rodados_presupuestos',
    -- Dirección, reportes y el motor del OS
    'scorecard_dominios', 'reportes_generados', 'reportes_definiciones', 'preguntas_negocio', 'post_mortems',
    'conocimiento_empresa', 'xsas_escritura', 'backlog_autonomo', 'aprendizaje_candidato'
  ] loop
    execute format('drop policy if exists solo_administracion on public.%I', t);
    execute format(
      'create policy solo_administracion on public.%I as restrictive for all to authenticated '
      'using ((select public.ve_economia())) with check ((select public.ve_economia()))', t);
  end loop;
end $$;

-- El motor del OS (esquema `orq`, expuesto por las vistas `public.orq_*`): toda tabla que hoy deja
-- leer a `authenticated` pasa a exigir Administración.
do $$
declare
  t text;
begin
  for t in
    select distinct p.tablename from pg_policies p
     where p.schemaname = 'orq' and 'authenticated' = any (p.roles) and p.permissive = 'PERMISSIVE'
  loop
    execute format('drop policy if exists solo_administracion on orq.%I', t);
    execute format(
      'create policy solo_administracion on orq.%I as restrictive for all to authenticated '
      'using ((select public.ve_economia())) with check ((select public.ve_economia()))', t);
  end loop;
end $$;

-- 3 · Proveedores: el nombre se lee (Herramientas y subcontratos lo muestran), escribir es de Administración
drop policy if exists solo_administracion_escribe on public.proveedores;
create policy solo_administracion_escribe on public.proveedores as restrictive for insert to authenticated
  with check ((select public.ve_economia()));
drop policy if exists solo_administracion_edita on public.proveedores;
create policy solo_administracion_edita on public.proveedores as restrictive for update to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));
drop policy if exists solo_administracion_borra on public.proveedores;
create policy solo_administracion_borra on public.proveedores as restrictive for delete to authenticated
  using ((select public.ve_economia()));

-- 4 · Recibos de sueldo ajenos: la documentación del legajo que dice cuánto cobra alguien la ve quien
-- liquida sueldos. El jefe sigue viendo DNI, altas, EPP y exámenes (administra la gente de la obra);
-- el operario ve lo suyo por `mi_documento_legajo` / `mi_recibo`, que son SECURITY DEFINER.
drop policy if exists sueldos_solo_quien_liquida on public.documentacion_legajo;
create policy sueldos_solo_quien_liquida on public.documentacion_legajo as restrictive for all to authenticated
  using ((select public.liquida_sueldos()) or tipo_documento not in ('recibo_sueldo', 'libreta_fondo_cese', 'baja'))
  with check ((select public.liquida_sueldos()) or tipo_documento not in ('recibo_sueldo', 'libreta_fondo_cese', 'baja'));

-- 5 · Vistas SECURITY DEFINER con economía: se envuelven con el portero sin tocar su cuerpo.
-- `obra_economia_cartera` publicaba al jefe costo de MO y de materiales por obra (10 filas).
do $$
declare
  v text;
  def text;
begin
  foreach v in array array['obra_economia_cartera'] loop
    def := pg_get_viewdef(('public.' || v)::regclass, false);
    def := regexp_replace(def, ';\s*$', '');
    execute format('create or replace view public.%I as select * from (%s) s where (select public.ve_economia())', v, def);
  end loop;
end $$;

-- 6 · Storage: comprobantes de compra y de pago, papeles del cliente y del proveedor, y los documentos de
-- obra sin registrar (órdenes de compra del cliente = precio de venta) pasan a Administración.
-- El jefe sigue leyendo los documentos registrados de las obras que ve (`obras_documentos_lee_quien_ve_la_obra`)
-- y cada uno sus propias rendiciones y recibos firmados.
drop policy if exists comprobantes_lee_administracion on storage.objects;
create policy comprobantes_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (select public.ve_economia()));
drop policy if exists comprobantes_sube_administracion on storage.objects;
create policy comprobantes_sube_administracion on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and (select public.ve_economia())
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or ((storage.foldername(name))[1] = 'pagos' and (storage.foldername(name))[2] ~ '^[0-9]+$')));
drop policy if exists documentos_cliente_lee_administracion on storage.objects;
create policy documentos_cliente_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'documentos-cliente' and (select public.ve_economia()));
drop policy if exists documentos_cliente_sube_administracion on storage.objects;
create policy documentos_cliente_sube_administracion on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos-cliente' and (select public.ve_economia())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists proveedores_documentos_lee_administracion on storage.objects;
create policy proveedores_documentos_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'proveedores-documentos' and (select public.ve_economia()));
drop policy if exists proveedores_documentos_sube_administracion on storage.objects;
create policy proveedores_documentos_sube_administracion on storage.objects for insert to authenticated
  with check (bucket_id = 'proveedores-documentos' and (select public.ve_economia())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists obras_documentos_lee_administracion on storage.objects;
create policy obras_documentos_lee_administracion on storage.objects for select to authenticated
  using (bucket_id = 'obras-documentos' and (select public.ve_economia()));

-- 7 · Funciones: las que aprueban operaciones del OS o le encargan trabajo al Director IA exigían sólo
-- «estar logueado» (el operario podía aprobar un mail o una escritura en el Sheet). Las de cobranzas,
-- costos, proveedores y la ficha del cliente exigían `es_administracion()` (el jefe pasaba).
do $$
declare
  f text;
  def text;
  nuevo text;
begin
  foreach f in array array['orq_operation_action', 'orq_submit_objective', 'orq_task_action'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if def is null then raise exception 'no existe public.%', f; end if;
    nuevo := replace(def, 'if auth.uid() is null then raise exception ''no autorizado''; end if;',
                          'if auth.uid() is null or not public.ve_economia() then raise exception ''no autorizado''; end if;');
    if nuevo = def then raise exception 'public.% no tiene la guarda auth.uid() esperada', f; end if;
    execute nuevo;
  end loop;

  foreach f in array array['cobranza_obra_asignar', 'detalle_costo_de_obra_rubros', 'detalle_costo_sin_obra',
                           'pantalla_clientes', 'proveedor_nota_pedir', 'invalidar_ficha_cliente_cache',
                           'drive_file_ids_vinculados'] loop
    for def in
      select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = f
    loop
      nuevo := replace(def, 'es_administracion()', 've_economia()');
      if nuevo = def then raise exception 'public.% no usa es_administracion()', f; end if;
      execute nuevo;
    end loop;
  end loop;
end $$;

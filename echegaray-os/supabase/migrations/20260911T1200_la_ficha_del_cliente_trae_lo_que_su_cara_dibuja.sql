-- ═══ LA FICHA DEL CLIENTE TRAE LO QUE SU CARA DIBUJA, NO LAS NUEVE ═══════════════════════════════
--
-- ═══ EL PROBLEMA, MEDIDO (11/09/2026, `PERF_TRAZA=1` sobre `/clientes/arcor`) ═══
--
-- `pantalla_cliente()` devuelve 199.202 bytes. El desglose del jsonb dice dónde están:
--
--     papeles      94.020 B (333 filas)
--     drive        64.048 B (208 filas)
--     documentos   30.142 B (208 filas)
--     todo lo demás 11.000 B
--
-- `drive` + `documentos` son 94 KB —el 47 % del payload— y sólo los DIBUJAN dos de las nueve caras:
-- Documentos (la lista de archivos vinculados) y Actividad (la línea de tiempo los usa como
-- eventos). Las otras siete los transportan para nada, y como la ficha vuelve a pedir la RPC
-- ENTERA en cada cambio de solapa, ese peso se paga una vez por clic.
--
-- Lo mismo, más chico, con `notas`, `autores`, `certificados` y `actividad_cliente`: los cuatro
-- existen sólo para construir la línea de tiempo de la cara Actividad.
--
-- ═══ LO QUE NO SE RECORTA, Y POR QUÉ ═══
--
-- `papeles` (94 KB) SE QUEDA EN LAS NUEVE CARAS. La cabecera escribe «OC recibidas c/IVA (n) $…» y
-- «OP recibidas c/IVA (n) $…» en todas, y esos dos totales NO son un `sum()` de la tabla: salen de
-- `agruparPapeles()`, que antes de sumar agrupa las copias del mismo papel por número canónico
-- (una OC que llegó en dos mails es UNA orden), descarta los comprobantes de retención por el
-- nombre del archivo y distingue «nadie cargó el importe» de «cero». Reproducir esa regla en SQL
-- para ahorrar 94 KB sería tener dos definiciones de lo que el cliente encargó — exactamente lo que
-- `rpc-de-pantalla-lee-lo-canonico.test.ts` prohíbe. El peso se paga; la regla no se duplica.
--
-- ═══ LA CUENTA SE QUEDA AUNQUE LAS FILAS SE VAYAN ═══
--
-- La barra de solapas escribe «Documentos · N» en las nueve caras. Recortar las filas sin traer la
-- cuenta convertiría ese N en un cero, que afirma que el cliente no tiene ningún papel — un dato
-- falso a cambio de ancho de banda. Por eso entra `n_documentos`, un `count(*)` con el MISMO
-- `where` que las filas: no es un número nuevo, es el `.length` calculado del otro lado del cable.
--
-- ═══ `p_solapa` ES UN RECORTE, NO UN PERMISO ═══
--
-- Quien decide qué puede ver cada rol sigue siendo la RLS (`security invoker`, `ve_economia()`
-- adentro de las vistas). `p_solapa` sólo dice qué va a DIBUJAR la página; un valor cualquiera —o
-- `null`, que es lo que manda un consumidor viejo— devuelve la ficha entera, como antes.

CREATE OR REPLACE FUNCTION public.pantalla_cliente(p_slug text, p_solapa text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with elegido as (
    select c.cliente_id from public.cliente_panel c where c.slug = p_slug
  ),
  -- SUS OBRAS, UNA VEZ. Las usan tres claves: la lista de la ficha, la actividad y el recorte de
  -- los certificados. Sin el CTE, la misma vista se recorrería tres veces en el mismo viaje.
  sus_obras as (
    select o.* from public.obra_panel o
     where o.cliente_id = (select cliente_id from elegido)
  )
  select jsonb_build_object(

    -- LA FICHA. `null` = no existe o no la puedo ver; la pantalla ya distingue eso de un error.
    'cliente', (select to_jsonb(c) from public.cliente_panel c where c.slug = p_slug),

    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS RESPONSABLES POSIBLES, sin las identidades de prueba: nombrar responsable a una cuenta de
    -- QA es una decisión de negocio tomada por accidente. Se filtra por `es_prueba`, no por texto.
    'responsables', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol)
                                order by p.nombre), '[]'::jsonb)
        from public.perfiles p where p.es_prueba = false
    ),

    'contactos', (
      select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
        from public.cliente_contacto k
       where k.cliente_id = (select cliente_id from elegido)
    ),

    'obras', (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from sus_obras o),

    -- LO QUE OBRAS PUBLICA POR OBRA. Sin recortar por cliente: la ficha usa el mapa completo, igual
    -- que la cartera, y recortarlo acá sería una regla nueva que nadie pidió.
    'economia_obras', (
      select coalesce(jsonb_agg(
               jsonb_build_object('obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
                                  -- EL CONTRATO EN SU MONEDA Y EL DÓLAR CON QUE SE VALUÓ: Quattropani
                                  -- se firmó en U$S y el peso equivalente cambia solo de un día para
                                  -- otro. Los dos viajan; la pantalla decide cuál muestra.
                                  'contratado_usd', e.contratado_usd, 'tipo_cambio', e.tipo_cambio,
                                  'origen', e.origen, 'referencia', e.referencia, 'nota', e.nota,
                                  -- LOS DOS TOTALES DE OC NO SE SUMAN: `ventana` es lo que el cliente
                                  -- emitió dentro del año que acota el contratado e `historico` lo de
                                  -- otros años, que en una obra fusionada son órdenes viejas.
                                  'oc_civa_ventana', e.oc_civa_ventana,
                                  'oc_civa_historico', e.oc_civa_historico,
                                  'oc_n_ventana', e.oc_n_ventana,
                                  'oc_n_historico', e.oc_n_historico,
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

    -- LO COBRADO POR TRABAJO — la MISMA vista y las MISMAS ocho columnas que `/clientes`. La ficha
    -- del CRM lo necesita para decir si un trabajo cobró; con una lectura propia, las dos pantallas
    -- del módulo volverían a poder decir números distintos sobre la misma obra.
    'cobrado_por_obra', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total,
               'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
               'proximo_cobro_fecha', u.proximo_cobro_fecha,
               'proximo_cobro_medio', u.proximo_cobro_medio,
               'imputacion', u.imputacion)), '[]'::jsonb)
        from public.obra_cuenta u
       where u.cliente_id = (select cliente_id from elegido)
    ),

    -- LO CONTRATADO Y LO COBRADO DEL CLIENTE, sumado por la base. `null` cuando el rol no ve
    -- economía (`ve_economia()` adentro de la vista) o cuando el cliente no tiene fila.
    'economia_cliente', (
      select jsonb_build_object(
               'cliente_id', x.cliente_id, 'contratado', x.contratado,
               'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
               'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
               'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
               'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
               'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
               'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
               'pendiente_contractual', x.pendiente_contractual)
        from public.cliente_economia x
       where x.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS PAPELES DEL CLIENTE, con `atribucion`: la ficha muestra CÓMO se ató cada uno a su obra.
    'papeles', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero,
               'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita,
               'nombre_archivo', r.nombre_archivo, 'atribucion', r.atribucion,
               'drive_file_id', r.drive_file_id)), '[]'::jsonb)
        from public.cliente_orden r
       where r.cliente_id = (select cliente_id from elegido)
         and r.eliminado_en is null
    ),

    -- CUÁNTOS VÍNCULOS A DRIVE TIENE, SIEMPRE. La barra de solapas escribe «Documentos · N» en
    -- las nueve caras, y sin esta cuenta recortar las filas convertiría ese N en un cero falso —
    -- que es peor que el peso que se ahorra. `count(` no fabrica un número de negocio: es el
    -- `.length` del mismo array, con el mismo `where`, hecho antes del cable.
    'n_documentos', (
      select count(*) from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ),

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', case when p_solapa is null or p_solapa in ('documentos', 'actividad') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ) else '[]'::jsonb end,

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ) else '[]'::jsonb end,
    'autores', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ) else '[]'::jsonb end,

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', case when p_solapa is null or p_solapa = 'actividad' then (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ) else null::jsonb end,

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', case when p_solapa is null or p_solapa = 'actividad' then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ) else '[]'::jsonb end,

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
$function$
;

-- ═══ LA DE UN ARGUMENTO NO SE RETIRA: SE VUELVE LA MISMA CON `p_solapa` EN NULL ═══
--
-- Entre que la migración se aplica y que Vercel termina de desplegar hay una ventana de minutos en
-- la que el código VIVO todavía llama `pantalla_cliente(p_slug)`. Borrar esa firma —o ponerle un
-- DEFAULT, que la vuelve ambigua— deja la ficha del cliente en error justo en esa ventana. Las dos
-- conviven, y la vieja delega: una sola definición del cuerpo, dos puertas.
create or replace function public.pantalla_cliente(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $delega$
  select public.pantalla_cliente(p_slug, null::text)
$delega$;

comment on function public.pantalla_cliente(text, text) is
  'LAS QUINCE LECTURAS DE LA FICHA DEL CLIENTE EN UN VIAJE, y desde 20260911T1200 sólo las que la '
  'cara pedida dibuja: `drive` y `documentos` (94 KB de 199 en el cliente más pesado) viajan en '
  'Documentos y Actividad; `notas`, `autores`, `certificados` y `actividad_cliente`, sólo en '
  'Actividad. `n_documentos` viaja SIEMPRE, porque la barra de solapas cuenta en las nueve caras. '
  '`papeles` no se recorta: los totales de OC y OP de la cabecera los define agruparPapeles() en '
  'TypeScript y reproducirlos acá sería una segunda definición. p_solapa es un RECORTE DE DIBUJO, '
  'nunca un permiso: quien recorta por rol es la RLS, que no cambia.';

comment on function public.pantalla_cliente(text) is
  'La puerta vieja de un argumento: delega en pantalla_cliente(p_slug, null), que devuelve la ficha '
  'entera. Existe para que el código ya desplegado no se caiga en la ventana entre aplicar la '
  'migración y terminar el deploy.';

revoke all on function public.pantalla_cliente(text, text) from public;
revoke all on function public.pantalla_cliente(text) from public;
grant execute on function public.pantalla_cliente(text, text) to authenticated, service_role;
grant execute on function public.pantalla_cliente(text) to authenticated, service_role;

notify pgrst, 'reload schema';

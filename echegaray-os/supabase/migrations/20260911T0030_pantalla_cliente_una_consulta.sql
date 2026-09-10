-- ═══ UNA CONSULTA POR PANTALLA — LA FICHA DEL CLIENTE (`/clientes/[cliente]`) ══════════════════
--
-- ═══ QUINCE VIAJES PARA DIBUJAR UNA FICHA ═══
--
-- Medido con `PERF_TRAZA=1` el 10/09/2026 sobre `/clientes/messina`: 24 consultas por navegación.
-- Seis eran de la campanita (ya resueltas en 20260911T0020) y dos de la solapa; las otras QUINCE
-- son la ficha, y salían en tres olas encadenadas:
--
--   1ª  cliente_panel(slug) · perfiles(auth.uid())
--   2ª  responsables · contactos · obras · economía de obras · economía del cliente · papeles ·
--       presupuestos · documentos, y adentro de «actividad» otras cinco
--   3ª  drive_index y certificados, que dependen de ids que sólo existen después de la 2ª
--
-- El costo dominante no es ninguna de ellas: es el ARRANQUE EN FRÍO POR CONEXIÓN. Un backend que
-- nunca tocó las vistas anidadas del OS paga ~800 ms cargando el catálogo antes de planificar nada;
-- ya caliente, cada vista cuesta 13-23 ms. Quince consultas pueden caer en quince backends del pool
-- de PostgREST, y bajo saturación varios estrenan conexión.
--
-- Las dos lecturas de la 3ª ola son peores todavía: no compiten, ESPERAN. `drive_index` no puede
-- salir hasta que `cliente_documento` volvió con los ids, y `certificados` hasta que `obra_panel`
-- volvió con las obras. Adentro de un solo cuerpo SQL esa dependencia es una subconsulta y deja de
-- costar un viaje.
--
-- ═══ TRANSPORTA, NO DEFINE ═══
--
-- Ni una suma, ni un criterio de negocio, ni una unión de dos listas. Los cruces que la aplicación
-- hace en memoria —el vínculo de `cliente_documento` con el archivo de `drive_index`, el autor de
-- una nota, el nombre de la obra de un certificado— SIGUEN haciéndose en TypeScript: acá las dos
-- listas viajan por separado, exactamente como viajaban. Se resiste la tentación del `left join`
-- porque ese cruce tiene una regla escrita (*«se publica el vínculo con el nombre en null en lugar
-- de perder la fila en un inner join»*) y moverla a SQL sería tener dos copias de una regla que hoy
-- tiene una.
--
-- Lo único que la RPC sí hace es FILTRAR por el mismo predicado que ya filtraba la aplicación
-- (`cotizacion_cascada` por `cliente_id`): traer 400 presupuestos para quedarse con 3 era ancho de
-- banda, no una definición. El filtro de TypeScript se queda igual — si algún día los dos
-- discreparan, gana el de TypeScript porque es el que sigue escrito.
--
-- ═══ `to_jsonb(t)` DONDE LA APLICACIÓN PEDÍA `select *` ═══
--
-- `cliente_panel`, `cliente_contacto`, `obra_panel` y `cotizacion_cascada` se leían con `select *`.
-- Enumerarles las columnas acá las CONGELARÍA: el día que la vista publique un campo nuevo, la
-- pantalla dejaría de recibirlo sin que nada falle. `to_jsonb` mantiene la promesa de `select *`.
-- Donde la aplicación enumeraba, acá también se enumera.

create or replace function public.pantalla_cliente(p_slug text)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
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
      select coalesce(jsonb_agg(jsonb_build_object(
               'obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado,
               'costo_mo', e.costo_mo, 'costo_materiales', e.costo_materiales,
               'margen', e.margen, 'origen', e.origen)), '[]'::jsonb)
        from public.obra_economia_cartera e
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

    -- LOS VÍNCULOS A DRIVE, y APARTE los archivos. No se cruzan acá: ver la cabecera.
    'documentos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen,
               'creado_en', d.creado_en)), '[]'::jsonb)
        from public.cliente_documento d
       where d.cliente_id = (select cliente_id from elegido)
    ),
    -- LA TERCERA OLA QUE DEJA DE SER UNA OLA: esto esperaba a que volvieran los ids de arriba.
    'drive', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
               'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
        from public.drive_index a
       where a.drive_file_id in (
               select d.drive_file_id from public.cliente_documento d
                where d.cliente_id = (select cliente_id from elegido))
    ),

    -- LAS NOTAS Y SUS AUTORES, por separado: una nota cuyo perfil ya no está queda SIN FIRMA, que
    -- es la verdad, en lugar de perderse. Ese cruce lo hace TypeScript y sigue siendo uno solo.
    'notas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en)
               order by n.creado_en desc), '[]'::jsonb)
        from public.cliente_nota n
       where n.cliente_id = (select cliente_id from elegido)
    ),
    'autores', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre)), '[]'::jsonb)
        from public.perfiles p
       where p.id in (
               select n.autor_id from public.cliente_nota n
                where n.cliente_id = (select cliente_id from elegido) and n.autor_id is not null)
    ),

    -- LAS FECHAS DEL CLIENTE PARA LA ACTIVIDAD salen de `clientes`, no de `cliente_panel`: la vista
    -- no las publica, y agregarlas ahí sería una migración para una solapa que no la necesita.
    'actividad_cliente', (
      select jsonb_build_object('nombre_comercial', c.nombre_comercial,
                                'created_at', c.created_at, 'updated_at', c.updated_at)
        from public.clientes c where c.id = (select cliente_id from elegido)
    ),

    -- LOS CERTIFICADOS DE SUS OBRAS — la otra lectura que esperaba a la ola anterior.
    'certificados', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
               'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
               'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
               'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
        from public.certificados t
       where t.obra_canonica_id in (select o.obra_id from sus_obras o)
    ),

    -- LOS PRESUPUESTOS DE ESTE CLIENTE. La aplicación traía TODA la cartera vigente y descartaba en
    -- memoria; el filtro es el mismo predicado (`cliente_id`), sólo que antes del cable.
    'presupuestos', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
        from public.cotizacion_cascada z
       where z.vigente = true and z.cliente_id = (select cliente_id from elegido)
    )
  )
$$;

comment on function public.pantalla_cliente(text) is
  'LAS QUINCE LECTURAS DE LA FICHA DEL CLIENTE EN UN VIAJE, incluidas las dos que ESPERABAN a la ola '
  'anterior (drive_index por los ids de cliente_documento, certificados por las obras del cliente): '
  'adentro de un cuerpo SQL esa dependencia es una subconsulta y deja de costar un viaje. '
  'Transporta: los cruces en memoria —vínculo con archivo, nota con autor, certificado con obra— '
  'siguen en TypeScript, donde tienen su regla escrita una sola vez. security invoker: la RLS y '
  've_economia() recortan igual que antes.';

revoke all on function public.pantalla_cliente(text) from public;
grant execute on function public.pantalla_cliente(text) to authenticated, service_role;

notify pgrst, 'reload schema';

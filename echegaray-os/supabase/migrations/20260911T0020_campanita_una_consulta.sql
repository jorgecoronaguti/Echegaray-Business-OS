-- ═══ UNA CONSULTA POR PANTALLA — LA CAMPANITA ══════════════════════════════════════════════════
--
-- La campanita del header vive en TODAS las pantallas del OS, así que sus lecturas no son el costo
-- de una pantalla: son un impuesto que paga cada navegación. Medido con `PERF_TRAZA=1` el
-- 10/09/2026, eran SEIS viajes por página —el perfil más las cinco señales— y llegaban justo
-- encima de la ola del render, disputándole el pool de PostgREST a la pantalla que el usuario está
-- mirando. En la ola de `/obras`, con 20 consultas simultáneas, las de la campanita midieron
-- `proveedores` 4.125 ms y `comprobante_compra` 6.388 ms: no es que sean caras, es que llegaron
-- cuando ya no había backend caliente libre.
--
-- ═══ TRANSPORTA FILAS, NO CUENTA ═══
--
-- Los cuatro números de Compras salen de `PREDICADO` (`comprasEstado.ts`), que está escrito UNA vez
-- y lo usan tres consumidores: la lista de la pantalla 24, su conteo contra la base y el conteo en
-- memoria de la campanita. Escribir ese predicado otra vez acá —en SQL— sería la cuarta copia, y la
-- primera que nadie compara: el número de la campanita y las filas de la pantalla empezarían a
-- discrepar sin un solo error. Por eso esta función devuelve LAS MISMAS FILAS que hoy viajan
-- (737 comprobantes por tres columnas, 41 proveedores por una) y quien las cuenta sigue siendo
-- `cumpleFiltro` en TypeScript.
--
-- Los tres conteos que SÍ vienen resueltos —`proveedor_nombre_pendiente`, `imputacion_pendiente`,
-- `correccion_asistencia_bandeja`— ya venían resueltos: PostgREST los pedía con
-- `select('*', { count: 'exact', head: true })`, que es un `count(*)` con otro nombre. Contar el
-- cardinal de una tabla no es un criterio de negocio; el criterio está en el `where`, y esos tres
-- `where` son los mismos literales que la consulta que reemplazan.
--
-- ═══ CERO FILAS NO ES CERO, Y ES POR ESO QUE FALLA ENTERA ═══
--
-- `atencionNoLeida` distingue tres estados: hay novedades · no hay · NO PUDE MIRAR. El tercero es
-- el que se pierde siempre, porque una campanita apagada se ve idéntica a un área sin pendientes.
-- Con seis consultas cada señal podía caer sola; con una, caen todas juntas y el estado es «no pude
-- mirar» — que es exactamente lo que hay que decir cuando no se pudo mirar.

create or replace function public.campanita_atencion()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(

    -- QUIÉN MIRA. `chipsDeAtencion` descarta los chips que llevan a una pantalla que este rol no
    -- puede abrir: sin el rol, un jefe de obra vería «14 proveedores sin CUIT» y el clic
    -- terminaría en un redirect mudo. Venía en un viaje aparte y encadenado.
    'perfil', (
      select jsonb_build_object('id', p.id, 'rol', p.rol, 'nombre', p.nombre,
                                'created_at', p.created_at, 'updated_at', p.updated_at)
        from public.perfiles p
       where p.id = (select auth.uid())
    ),

    -- LOS CUIT DE LOS PROVEEDORES ACTIVOS. Quién los cuenta es TypeScript: «sin CUIT» es `!p.cuit`,
    -- que también toma la cadena vacía, y esa decisión ya está escrita en un solo lugar.
    'proveedores_cuit', (
      select coalesce(jsonb_agg(jsonb_build_object('cuit', v.cuit)), '[]'::jsonb)
        from public.proveedores v
       where v.activo
    ),

    -- LAS TRES COLUMNAS QUE DECIDEN LOS CUATRO NÚMEROS DE COMPRAS. Sin filtrar: el filtro es
    -- `PREDICADO`, vive en TypeScript y no se copia acá.
    'compras', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'imputacion', k.imputacion,
               'tiene_posible_duplicado', k.tiene_posible_duplicado,
               'estado_control', k.estado_control)), '[]'::jsonb)
        from public.comprobante_compra k
    ),

    -- LOS TRES CARDINALES, con el MISMO `where` que la consulta que reemplazan.
    'nombres_sin_resolver', (select count(*) from public.proveedor_nombre_pendiente),
    'pendientes', (select count(*) from public.imputacion_pendiente),
    'correcciones', (
      select count(*) from public.correccion_asistencia_bandeja b where b.estado = 'pendiente'
    )
  )
$$;

comment on function public.campanita_atencion() is
  'LAS SEIS LECTURAS DE LA CAMPANITA EN UN VIAJE. Vive en todas las pantallas del OS, así que sus '
  'viajes no son el costo de una pantalla sino un impuesto por navegación que le disputaba el pool '
  'de PostgREST al render. Transporta filas: los cuatro números de Compras los sigue contando '
  'PREDICADO en TypeScript, que es donde están escritos una sola vez. security invoker: cada rol '
  've lo que su RLS le deja ver.';

revoke all on function public.campanita_atencion() from public;
grant execute on function public.campanita_atencion() to authenticated, service_role;

notify pgrst, 'reload schema';

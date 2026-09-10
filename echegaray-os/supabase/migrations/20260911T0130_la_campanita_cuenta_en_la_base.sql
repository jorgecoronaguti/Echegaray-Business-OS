-- ═══ LA CAMPANITA CUENTA EN LA BASE — Y EL PREDICADO PASA A TENER UN LADO SQL ══════════════════
--
-- 20260911T0020 juntó las seis lecturas de la campanita en un viaje y dejó escrito por qué NO
-- contaba en SQL: los cuatro números de Compras salen de `PREDICADO` (`comprasEstado.ts`), y
-- escribirlos otra vez en SQL sería una copia que nadie compara. El argumento era correcto; la
-- conclusión —transportar las 737 filas— costaba esto, medido el 10/09/2026 sobre la base real:
--
--   payload de campanita_atencion() ........ 76 KB por navegación (737 comprobantes + 41 proveedores)
--   bloques del buffer pool ................ 248.056
--   pg_stat_statements (17:59–18:50) ....... 34 llamadas · 3.064 ms de media · 14,8 s de máximo
--
-- Y la campanita vive en TODAS las pantallas: eso no es el costo de una pantalla, es un impuesto por
-- navegación. Era el mayor consumidor de la base en la ventana medida.
--
-- ═══ LA COPIA QUE NO SE COMPARA vs. LA COPIA QUE SE COMPARA ═══
--
-- Lo que estaba mal no era tener el predicado en SQL: era tenerlo SIN un control que lo ate al de
-- TypeScript. La casa ya resolvió esto el 10/09 con `cobranza_imputacion` (SQL) y
-- `cobranza-obra.mjs` (JS): dos implementaciones de la MISMA regla, comparadas fila por fila contra
-- los datos reales. Acá se hace igual.
--
--   · `comprobante_cumple_filtro()` es el lado SQL de `PREDICADO`.
--   · `campanita-rpc.pg.test.mjs` compara los SEIS filtros contra `cumpleFiltro` de TypeScript
--     sobre los 737 comprobantes reales, y exige que un filtro inventado haga FALLAR a la función.
--
-- Un filtro desconocido levanta excepción y no devuelve `false`: si devolviera `false`, un typo en
-- el nombre del filtro haría que la campanita diga «no hay nada que resolver» —una afirmación sobre
-- la empresa— en vez de romperse. Un control que no puede decir «no sé» siempre dice «sí».
--
-- ═══ POR QUÉ NO SE LLAMA `comprobante_estado()` ═══
--
-- Porque el ESTADO del comprobante (la columna CONTROL de la pantalla 24: «Posible duplicado», «Sin
-- imputar», «Confirmada»…) NO es una partición de los seis KPI, y contar los KPI desde un único
-- estado cambiaría tres números. Un comprobante que es parecido a otro Y no tiene obra cuenta en
-- «duplicados» y en «sin imputar», pero su columna CONTROL dice una sola cosa: «Posible duplicado».
-- Una función `comprobante_estado()` que devolviera ese único rótulo y de la que se derivaran los
-- conteos publicaría menos «sin imputar» de los que la lista muestra — el defecto exacto que
-- `comprasEstado.ts` existe para impedir. Lo canónico que hacía falta acá es el PREDICADO.

-- ── 1 · el predicado de cada KPI, con lado SQL ─────────────────────────────────────────────────
--
-- `is not distinct from` y no `=`: es lo que hace `cumpleFiltro` con `===` en TypeScript. Con `=`,
-- una columna NULL daría NULL y el conteo dependería de dónde se use el predicado (un `where` lo
-- descarta, un `case` no). Así la función es TOTAL: siempre true o false, nunca NULL.
create or replace function public.comprobante_cumple_filtro(
  filtro text, imputacion text, tiene_posible_duplicado boolean, estado_control text
) returns boolean
language plpgsql
immutable
parallel safe
as $$
begin
  case filtro
    -- «capturadas» es la lista entera: el KPI que no filtra nada.
    when 'capturadas'   then return true;
    when 'por-revisar'  then return estado_control is not distinct from 'en_revision';
    when 'sin-imputar'  then return imputacion is not distinct from 'sin_identificar';
    when 'sin-resolver' then return imputacion is not distinct from 'sin_resolver';
    when 'estructura'   then return imputacion is not distinct from 'estructura';
    -- LOS DUPLICADOS SIN RESOLVER. Un parecido ya confirmado o mandado a revisión no es trabajo
    -- pendiente, y dejarlo adentro haría que el número no baje por más que se trabaje.
    --
    -- Y NO ACEPTA NULL EN `tiene_posible_duplicado`: es el único filtro que la necesita, y quien la
    -- omitiera obtendría «0 duplicados» —una afirmación sobre la empresa— en vez de un error. La
    -- columna la publica `comprobante_compra` con un `exists`, que nunca es NULL: un NULL acá
    -- significa que quien llama no la pasó.
    when 'duplicados'   then
      if tiene_posible_duplicado is null then
        raise exception 'el filtro «duplicados» necesita tiene_posible_duplicado y llegó NULL'
          using hint = 'La publica public.comprobante_compra; omitirla haría que el KPI diga cero.';
      end if;
      return tiene_posible_duplicado and estado_control is not distinct from 'sin_revisar';
    else raise exception 'filtro de compras desconocido: %', filtro
      using hint = 'Los seis viven en FILTROS de src/features/administracion/services/comprasEstado.ts';
  end case;
end
$$;

comment on function public.comprobante_cumple_filtro(text, text, boolean, text) is
  'El lado SQL de PREDICADO (src/features/administracion/services/comprasEstado.ts): qué cuenta '
  'cada KPI de Compras. Existe para que la campanita pueda contar en la base sin transportar 737 '
  'filas por navegación. Las dos copias las ata campanita-rpc.pg.test.mjs, que las compara sobre '
  'los comprobantes reales; un filtro desconocido levanta excepción y nunca devuelve false.';

revoke all on function public.comprobante_cumple_filtro(text, text, boolean, text) from public;
grant execute on function public.comprobante_cumple_filtro(text, text, boolean, text)
  to authenticated, service_role;

-- ── 2 · la campanita: siete números y el rol, nada más ─────────────────────────────────────────
--
-- Deja de transportar filas. Lo que viajaba y ya no:
--
--   · 737 comprobantes × 3 columnas → tres conteos (`count(*)` con el predicado de arriba);
--   · 41 proveedores × su CUIT      → un conteo. «Sin CUIT» es `!p.cuit` en TypeScript, o sea NULL o
--     cadena vacía: `coalesce(cuit, '') = ''` es exactamente eso, y NO `btrim(...)` — un CUIT de
--     espacios en blanco cuenta como cargado en las dos implementaciones o el conteo y la lista de
--     la pantalla de Proveedores discreparían.
--
-- LOS DOS CONTEOS DE IMPUTACIÓN VAN EN SU PROPIO BARRIDO, aparte del de duplicados, y es a propósito:
-- `tiene_posible_duplicado` es un `exists` contra `comprobante_posible_duplicado`, y una consulta que
-- no lo menciona no lo evalúa (la vista se aplana y las columnas que nadie pide desaparecen del
-- plan). Meterlos en el mismo `count(*) filter (...)` obligaría a evaluar el parecido de las 737
-- filas para contestar «cuántas no tienen obra».
--
-- DEL PERFIL SÓLO VIAJAN `id` Y `rol`. `chipsDeAtencion` usa el rol para descartar los chips que
-- llevan a una pantalla que este rol no puede abrir; el nombre y las fechas los pedía nadie.
create or replace function public.campanita_atencion()
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
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
      select count(*) from public.comprobante_compra k
       where public.comprobante_cumple_filtro('sin-imputar', k.imputacion, null, k.estado_control)
    ),
    'compras_sin_resolver', (
      select count(*) from public.comprobante_compra k
       where public.comprobante_cumple_filtro('sin-resolver', k.imputacion, null, k.estado_control)
    ),

    -- LOS PARECIDOS SIN RESOLVER. Éste sí evalúa el parecido; desde 20260911T0120 se calcula con una
    -- ventana en vez de una subconsulta por fila.
    'compras_duplicadas', (
      select count(*) from public.comprobante_compra k
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

comment on function public.campanita_atencion() is
  'LAS SIETE SEÑALES DE LA CAMPANITA EN UN VIAJE Y YA CONTADAS. Vive en todas las pantallas del OS, '
  'así que sus viajes no son el costo de una pantalla sino un impuesto por navegación: transportaba '
  '76 KB y 248.056 bloques por navegación (34 llamadas, 3.064 ms de media el 10/09/2026). Cuenta con '
  'comprobante_cumple_filtro(), el lado SQL de PREDICADO, atado al de TypeScript por '
  'campanita-rpc.pg.test.mjs. security invoker: cada rol ve lo que su RLS le deja ver.';

revoke all on function public.campanita_atencion() from public;
grant execute on function public.campanita_atencion() to authenticated, service_role;

notify pgrst, 'reload schema';

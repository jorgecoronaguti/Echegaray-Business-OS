-- ============================================================================================
-- LA ENTRADA DE ADMINISTRACIÓN PREGUNTA UNA SOLA VEZ
--
-- ═══ POR QUÉ ═══
--
-- `/administracion` es la pantalla más abierta del OS y la más lenta: 4.904 ms de `respEnd −
-- respStart` medidos en producción el 25/08/2026, con el shell saliendo en 51 ms. Los 4,85 s eran
-- íntegramente el servidor esperando a la base.
--
-- NO era un waterfall: ya usaba `Promise.all`. Era la CANTIDAD DE VIAJES. Medido como
-- `authenticated` con EXPLAIN ANALYZE (mejor de 3, caché caliente), el trabajo real de la base para
-- todos los conteos de esa pantalla suma ~600 ms; el resto es ida y vuelta por HTTP, una por
-- consulta, todas compitiendo por las mismas conexiones del pooler.
--
-- El código ya bajó de diecinueve lecturas a doce contando en memoria lo que se podía (los cuatro
-- números de Compras salen de UNA lectura de tres columnas; los dos de Proveedores, de una de 36
-- `cuit`). Esto es el paso siguiente y el que no se puede dar desde el código: los once números en
-- UN viaje.
--
-- ═══ SECURITY INVOKER, A PROPÓSITO ═══
--
-- Es la decisión importante de este archivo. Un `security definer` sería más rápido —se saltea las
-- policies— y estaría MAL: el conteo de `drive_index` sólo lo puede ver quien ve economía, y el
-- catálogo entero incluye el archivo fiscal y los libros de sueldos. Esta función corre con los
-- permisos de QUIEN LA LLAMA, así que devuelve exactamente lo que esa sesión podría contar por su
-- cuenta. No abre una puerta nueva: junta doce viajes en uno.
--
-- Consecuencia declarada: al jefe de obra `documentos` le vuelve en 0 —no en null— porque su RLS le
-- deja ver 0 filas de `drive_index`. La barra no le dibuja ese destino, así que ese 0 no se publica
-- en ninguna parte. Si alguna vez se publicara, hay que distinguirlo de «no se pudo leer».
--
-- ═══ ESTA MIGRACIÓN NO ESTÁ APLICADA ═══
--
-- Se escribe y se deja escrita: aplicarla no es del trabajo que la produjo. Y NADA depende de ella:
-- `getConteosHome` sigue haciendo sus doce lecturas y funciona igual. El día que se aplique, la
-- página puede llamar a `administracion_conteos()` y quedarse con un viaje.
--
-- ENSAYO HECHO (25/08/2026, dentro de una transacción DESHECHA, como `authenticated` con el JWT de
-- una sesión de Dirección): la función devuelve los MISMOS once números que las doce consultas
-- sueltas, en una sola ejecución.
-- ============================================================================================

create or replace function public.administracion_conteos()
returns table (
  personas integer,
  proveedores integer,
  proveedores_sin_cuit integer,
  nombres_sin_resolver integer,
  compras integer,
  compras_sin_imputar integer,
  compras_sin_resolver integer,
  compras_duplicadas integer,
  pendientes integer,
  correcciones integer,
  tareas_tipo integer,
  documentos integer
)
language sql
stable
-- SIN `security definer`: ver arriba. Y `search_path` fijo igual, porque `stable` no protege de un
-- `search_path` hostil en la sesión que la llama.
set search_path = public, pg_temp
as $$
  select
    -- EL PLANTEL SALE DE LA PERTENENCIA, NO DE LA FECHA: hay bajas sin `fecha_egreso`.
    (select count(*) from public.persona_directorio where en_la_empresa)::int,
    (select count(*) from public.proveedores where activo)::int,
    (select count(*) from public.proveedores where activo and cuit is null)::int,
    (select count(*) from public.proveedor_nombre_pendiente)::int,
    (select count(*) from public.comprobante_compra)::int,
    -- LOS TRES PREDICADOS DE COMPRAS SON LOS DE `comprasEstado.PREDICADO`, palabra por palabra. Si
    -- alguno cambia allá y no acá, la entrada diría «3 sin obra» y la pantalla 24 mostraría nueve.
    (select count(*) from public.comprobante_compra where imputacion = 'sin_identificar')::int,
    (select count(*) from public.comprobante_compra where imputacion = 'sin_resolver')::int,
    (select count(*) from public.comprobante_compra
       where tiene_posible_duplicado and estado_control = 'sin_revisar')::int,
    (select count(*) from public.imputacion_pendiente)::int,
    (select count(*) from public.correccion_asistencia_bandeja where estado = 'pendiente')::int,
    (select count(*) from public.tarea_tipo where activo)::int,
    -- ARCHIVOS, no carpetas: la pantalla /documentos cuenta `is_folder = false` y el contador de la
    -- barra tiene que decir EL MISMO número (QA 24/08: 3599 vs 3128 — la diferencia eran carpetas).
    (select count(*) from public.drive_index where not is_folder)::int
$$;

comment on function public.administracion_conteos() is
  'Los once contadores de la entrada de Administración en UN viaje. Security INVOKER: devuelve lo '
  'que la sesión que llama podría contar por su cuenta. Los predicados de Compras son los mismos '
  'que comprasEstado.PREDICADO en el código.';

grant execute on function public.administracion_conteos() to authenticated;

-- ============================================================================================
-- EL ÚLTIMO PARTE DE CADA OBRA
--
-- La cartera de la entrada dibuja «últ. mov.» de cada obra, que es la fecha del último registro de
-- `obra_ejecucion`. PostgREST tiene los agregados APAGADOS en esta base (`PGRST123: Use of
-- aggregate functions is not allowed`, comprobado el 25/08), así que hoy el código lee las 248
-- filas de `(obra_id, fecha)` y las reduce en memoria. Es correcto y son 12 KB; deja de serlo
-- cuando la tabla tenga decenas de miles de partes.
--
-- Esta vista lo resuelve en la base con el índice que YA existe
-- (`obra_ejecucion_por_obra (obra_id, fecha desc)`). Mientras no esté aplicada, el código de hoy
-- sigue funcionando: no depende de ella.
-- ============================================================================================

create or replace view public.obra_ultimo_parte as
  select obra_id, max(fecha) as ultimo_parte
  from public.obra_ejecucion
  group by obra_id;

comment on view public.obra_ultimo_parte is
  'La fecha del último parte de cada obra. Hereda la RLS de obra_ejecucion (security_invoker).';

-- `security_invoker` para que la vista NO sea una puerta lateral a `obra_ejecucion`: quien la lee ve
-- las obras que su RLS le deja ver, y ni una más.
alter view public.obra_ultimo_parte set (security_invoker = true);

grant select on public.obra_ultimo_parte to authenticated;

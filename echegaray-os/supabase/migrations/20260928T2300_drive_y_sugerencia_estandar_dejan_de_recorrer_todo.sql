-- DOS CONSULTAS LENTAS DE pg_stat_statements (28/09/2026), NINGUNA POR FALTA DE ÍNDICE PK NI POR
-- `ve_economia()` MAL ENVUELTA — LAS DOS EJECUTAN UN JOIN SIN CAMINO INDEXADO PARA UN GRUPO CHICO
-- DE FILAS Y LO PAGAN A FUERZA DE FUERZA BRUTA.
--
-- ═══ 1) `drive_index_read` — LA CUARTA RAMA DE `drive_file_ids_vinculados()` ═══
--
-- Medido como `jefe_obra` real (ingenieria@ecsas.com.ar) con `explain (analyze, buffers)`, dentro de
-- una transacción con `request.jwt.claims` puesto y ROLLBACK, contra producción:
--
--   select * from drive_index where drive_file_id = any($1) (25 ids) ..... 5758 ms, 56712 buffers
--   select * from drive_file_ids_vinculados() ............................ 5848 ms, 57338 buffers
--
-- La función YA es STABLE SECURITY DEFINER con search_path fijo (20260926T0006) — no era eso. El
-- costo es la cuarta rama del UNION: une `obra_canonica` con `drive_index` (la carpeta) y otra vez
-- con `drive_index` (los archivos) por
--
--   d.path like replace(replace(c.path, '\', '\\'), '_', '\_') || '/%'
--
-- un `LIKE` cuyo prefijo NO es una constante (sale de `c.path`, que cambia por cada obra). Postgres
-- sólo convierte `LIKE 'prefijo%'` en un rango de índice cuando el prefijo es constante en tiempo de
-- plan; acá no puede, así que no hay índice que lo sirva — ni el que ya existía (`drive_index_pkey`,
-- por `drive_file_id`) ni ninguno sobre `path`. El plan real terminó en un Nested Loop que, por cada
-- obra (13), recorre casi toda `drive_index` por el único índice disponible que se le pareció
-- (`drive_index_folder_idx`, sobre el booleano `is_folder` — no selectivo), evaluando
-- `papel_comercial()` fila por fila: ~56 000 buffers, la mayoría CPU sobre caché caliente, no I/O.
--
-- ═══ EL ARREGLO: el MISMO prefijo, escrito como rango en vez de como patrón ═══
--
-- `path LIKE (prefijo || '/%')` con `prefijo` ya escapado (el `replace` de `_`) es exactamente el
-- conjunto de filas que empiezan con el texto literal `prefijo || '/'` — ninguna otra: el escape de
-- `_` existía sólo para que ese carácter no actuara de comodín dentro del patrón. Ese mismo conjunto
-- se describe, sin patrón y sin escape, como
--
--   path COLLATE "C" >= prefijo || '/'  AND  path COLLATE "C" < prefijo || '0'
--
-- ('/' es 0x2F, '0' es 0x30, el byte siguiente; no hay ningún carácter ASCII entre medio). El
-- `COLLATE "C"` fuerza comparación byte a byte —la base usa `en_US.UTF-8` vía ICU
-- (`datlocprovider='i'`), y con esa colación `>=`/`<` NO garantizan el mismo orden que una
-- comparación de bytes, así que sin forzar "C" el rango podría no ser exactamente ese conjunto—.
-- Con "C" sí lo es, y un rango SÍ es indexable con parámetros de fila (nested loop parametrizado).
--
-- Ensayado (función con otro nombre, misma consulta, ROLLBACK) contra el mismo usuario jefe_obra:
--
--   drive_file_ids_vinculados()          ............ 6233 ms  (78 filas)
--   drive_file_ids_vinculados_ensayo() ............... 111 ms  (78 filas)   ← mismo conjunto exacto
--   direccion (jorge@ecsas.com.ar) ................... 4670 ms → 103 ms    (894 filas, mismo conjunto)
--   campo (empleado.demo, sin obra) ..................... 79 ms →  79 ms   (54 filas, sin cambio — no pasa por la rama 4)
--
-- Y la consulta real reportada, con la policy ya apuntando a la función corregida:
--
--   select * from drive_index where drive_file_id = any($1)  ..... 5758 ms → 58 ms  (mismas filas)
--
-- MISMOS PERMISOS: para jefe_obra, dirección y campo el conjunto de `drive_file_id` devuelto por la
-- función nueva es IDÉNTICO al de la vieja (0 filas de diferencia en cualquier dirección, comparado
-- fila por fila). El índice nuevo sólo acelera la lectura; no cambia qué policy evalúa ni qué ve cada
-- rol.

-- Si una sincronización del Drive tiene la tabla tomada, que falle en 3 s en vez de quedar en cola trabando lecturas.
set lock_timeout = '3s';

create index if not exists drive_index_path_c_idx on public.drive_index (path collate "C");
comment on index public.drive_index_path_c_idx is
  'Rango de prefijo de carpeta para drive_file_ids_vinculados() (rama 4). COLLATE "C" a propósito: '
  'la base es en_US.UTF-8/ICU y el rango sólo es equivalente al LIKE de prefijo bajo comparación '
  'byte a byte. Ver 20260928T2300.';

create or replace function public.drive_file_ids_vinculados()
 returns setof text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select d.drive_file_id
    from public.documentacion_legajo d
   where d.drive_file_id is not null
     and public.mi_persona_id() is not null
     and d.persona_id = public.mi_persona_id()
  union
  select od.drive_file_id
    from public.obra_documento od
   where od.drive_file_id is not null
     and public.ve_obra(od.obra_id)
     and (public.ve_economia()
          or (coalesce(od.rol, '') not in ('cotizacion', 'cotizacion_interna', 'orden_compra', 'resumen_recotizacion', 'contrato', 'factura', 'certificado')
              and not public.papel_comercial(null, od.nombre)
              and not public.drive_papel_comercial(od.drive_file_id)))
  union
  select cd.drive_file_id
    from public.cliente_documento cd
   where cd.drive_file_id is not null
     and public.ve_economia()
  union
  select d.drive_file_id
    from public.obra_canonica o
    join public.drive_index c
      on c.drive_file_id = o.drive_carpeta_id
     and not coalesce(c.trashed, false)
    join public.drive_index d
      on d.path collate "C" >= (c.path || '/')
     and d.path collate "C" < (c.path || '0')
     and not d.is_folder
   where o.drive_carpeta_id is not null
     and public.ve_obra(o.id)
     and (public.ve_economia() or not public.papel_comercial(d.path, d.name))
$function$;
comment on function public.drive_file_ids_vinculados() is
  'El catálogo de Drive que ve quien no es Administración. Rama 4 (carpeta de obra) reescrita como '
  'rango COLLATE "C" en vez de LIKE de prefijo no constante — mismo conjunto, indexable. Ver 20260928T2300.';

-- ═══ 2) `obra_actividad_sugerencia_estandar` — la CTE `candidatas` normalizaba adentro del JOIN ═══
--
-- Medido como jefe_obra, `explain (analyze, buffers)` sobre `obra_id = 'galpones'`: 1137 ms, 66
-- buffers (todo en caché — no es I/O, es CPU). El plan: un Nested Loop de 205 `tarea_tipo` activas
-- por 280 `obra_actividad` sin vincular (57 400 combinaciones) cuyo `Join Filter` compara
-- `norm_area_txt(codigo/nombre)` de LOS DOS LADOS — `norm_area_txt` hace `translate` + `lower` +
-- `regexp_replace` + `trim`. El `OR` entre «matchea por código» y «matchea por nombre» le impide a
-- Postgres usar un Hash Join (un hash sólo sirve para un `AND` de igualdades), así que cae a Nested
-- Loop y recalcula la normalización de CADA lado en CADA una de las 57 400 combinaciones — hasta
-- 4 llamadas a una función con regex por par, en vez de una vez por fila (205 + 280 = 485 llamadas).
--
-- `norm_area_txt` es IMMUTABLE (incluso podría indexarse) — el problema no es que no se pueda
-- precalcular, es que la CTE original no lo hacía: `candidatas` armaba `norm_area_txt(v.codigo)`
-- directo en la condición del JOIN.
--
-- ═══ EL ARREGLO: normalizar una vez por lado, ANTES del join, con CTEs `MATERIALIZED` ═══
--
-- `WITH v_norm AS (...)`/`t_norm AS (...)` sin `MATERIALIZED` no alcanza: desde Postgres 12 el
-- planificador puede — y acá elige — «inlinear» una CTE referenciada una sola vez, lo que vuelve a
-- pegar `norm_area_txt()` en el predicado del JOIN y deja el plan idéntico al original (comprobado:
-- mismo Nested Loop, mismos 1137 ms). `MATERIALIZED` fuerza a Postgres a calcular la CTE una vez y
-- reusar el resultado — ahí el `Join Filter` pasa a comparar dos columnas de texto ya calculadas, sin
-- ninguna llamada a función por par.
--
-- Ensayado (vista con otro nombre, ROLLBACK) contra las MISMAS 28 obras activas de producción:
--
--   obra_actividad_sugerencia_estandar (jefe_obra, 'galpones') ......... 1190-1200 ms
--   ..._ensayo (misma consulta, mismo usuario) ............................. 77 ms   (15×)
--   28 obras comparadas fila por fila (obra_id, actividad_id, tarea_tipo_id,
--   evidencia, hh sugeridas...) .................. 0 diferencias en cualquier dirección
--
-- MISMOS PERMISOS: la vista no toca su propia RLS (no la tiene; hereda la de `obra_actividad` vía la
-- vista `obra_actividad_vinculacion`, sin tocar). El único cambio es DÓNDE se calcula
-- `norm_area_txt()`, no QUÉ compara ni QUÉ fila ve cada rol.

create or replace view public.obra_actividad_sugerencia_estandar with (security_invoker = true) as
with v_norm as materialized (
  select v.obra_id,
    v.actividad_id,
    v.nombre as actividad_nombre,
    v.codigo,
    public.norm_area_txt(v.codigo) as codigo_norm,
    public.norm_area_txt(v.nombre) as nombre_norm
  from public.obra_actividad_vinculacion v
  where v.estado = 'sin_vincular' and not v.archivada
), t_norm as materialized (
  select t.id,
    t.codigo,
    t.nombre,
    t.unidad,
    public.norm_area_txt(t.codigo) as codigo_norm,
    public.norm_area_txt(t.nombre) as nombre_norm
  from public.tarea_tipo t
  where t.activo
), candidatas as (
  select v.obra_id,
    v.actividad_id,
    v.actividad_nombre,
    t.id as tarea_tipo_id,
    t.codigo as tarea_tipo_codigo,
    t.nombre as tarea_tipo_nombre,
    t.unidad as tarea_tipo_unidad,
    case
      when v.codigo is not null and v.codigo_norm = t.codigo_norm then 'codigo_exacto'
      else 'nombre_exacto'
    end as evidencia
  from v_norm v
  join t_norm t
    on (v.codigo is not null and v.codigo_norm = t.codigo_norm)
    or v.nombre_norm = t.nombre_norm
), mejor as (
  select c.obra_id,
    c.actividad_id,
    c.actividad_nombre,
    c.tarea_tipo_id,
    c.tarea_tipo_codigo,
    c.tarea_tipo_nombre,
    c.tarea_tipo_unidad,
    c.evidencia,
    min(case when c.evidencia = 'codigo_exacto' then 0 else 1 end) over (partition by c.actividad_id) as mejor_rango
  from candidatas c
), filtradas as (
  select mejor.obra_id,
    mejor.actividad_id,
    mejor.actividad_nombre,
    mejor.tarea_tipo_id,
    mejor.tarea_tipo_codigo,
    mejor.tarea_tipo_nombre,
    mejor.tarea_tipo_unidad,
    mejor.evidencia,
    mejor.mejor_rango
  from mejor
  where case when mejor.evidencia = 'codigo_exacto' then 0 else 1 end = mejor.mejor_rango
)
select f.obra_id,
  f.actividad_id,
  f.actividad_nombre,
  f.tarea_tipo_id,
  f.tarea_tipo_codigo,
  f.tarea_tipo_nombre,
  f.tarea_tipo_unidad,
  f.evidencia,
  case f.evidencia
    when 'codigo_exacto' then 'el código de la actividad es el mismo que el de la tarea tipo'
    else 'el nombre de la actividad es el mismo que el de la tarea tipo'
  end as evidencia_texto,
  est.analisis_id as analisis_sugerido_id,
  est.variante as analisis_sugerido_variante,
  est.hh_por_unidad as hh_por_unidad_sugerida,
  est.n_vigentes as analisis_vigentes
from filtradas f
left join lateral (
  select count(*)::integer as n_vigentes,
    case when count(*) = 1 then (array_agg(e.analisis_id))[1] else null::uuid end as analisis_id,
    case when count(*) = 1 then (array_agg(e.variante))[1] else null::text end as variante,
    case when count(*) = 1 then (array_agg(e.hh_por_unidad))[1] else null::numeric end as hh_por_unidad
  from public.estandar_productivo e
  where e.tarea_tipo_id = f.tarea_tipo_id
) est on true
where (select count(*) from filtradas g where g.actividad_id = f.actividad_id) = 1;
comment on view public.obra_actividad_sugerencia_estandar is
  'Sugerencia de tarea tipo estándar para actividades sin vincular. v_norm/t_norm MATERIALIZED: '
  'norm_area_txt() se calcula una vez por fila, no una vez por par del join (57 400 pares con la '
  'CTE sin materializar). Ver 20260928T2300.';

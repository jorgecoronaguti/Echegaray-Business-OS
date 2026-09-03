-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CUÁL DE LOS PRECIOS SE USA, Y DESDE CUÁNDO.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ LO QUE SE MIDIÓ ANTES DE ESCRIBIR ESTO (03/09/2026) ═══
--
-- `recurso_precio` tiene 389 filas, una por recurso, TODAS `vigente`, y las 389 se escribieron en
-- el mismo minuto: 2026-08-21 15:57. No es la firma de un catálogo que se pisa a sí mismo —los tres
-- escritores que existen (`importar-base-maestra.mjs`, `recursosActions.ts` y `aplicarResolucion()`)
-- jubilan la fila anterior e insertan una nueva, nunca hacen `update ... set costo`—: es la firma de
-- UNA SOLA CARGA. La serie no creció porque nadie cargó un segundo precio, no porque el segundo haya
-- borrado al primero. `recurso_precio_resolucion` lo confirma: 56 NECESITA_HUMANO, 49 VIGENTE,
-- 2 SIN_PRECIO y CERO ACTUALIZADO — el único camino autónomo que agrega una observación nunca
-- devolvió el resultado que la agrega.
--
-- ═══ EL PROBLEMA QUE SÍ EXISTE: «VIGENTE» ESTÁ DEFINIDO TRES VECES ═══
--
--   1. `recurso_precio.vigente`  — la fila marcada. Es la que multiplica `recurso_costo`, y por lo
--                                  tanto la que forma el costo directo de una cotización.
--   2. `precioVigente()` en `precios.mjs` — la observación con la fecha MÁS NUEVA.
--   3. `cot_gate_congelado()`    — `max(fecha_precio)` sobre TODA la serie, sin mirar `vigente`.
--
-- Con series de largo 1 las tres coinciden y nadie lo nota. En cuanto un recurso tenga dos
-- observaciones pueden separarse, y ahí el control de frescura estaría juzgando un precio DISTINTO
-- del que se multiplica: el sistema diría «fresco» sobre un total calculado con el viejo.
--
-- Acá se fija UNA definición y se la deja consultable: **el precio que se usa es la fila marcada
-- `vigente`** —porque es la que entra en el número— y cuando esa fila NO es la observación más nueva
-- de la serie, eso NO se resuelve solo eligiendo la otra: se declara CONFLICTO. Elegir en silencio
-- es exactamente lo que hace que un desacuerdo entre fuentes no se vea nunca.
--
-- ═══ LO QUE QUEDA ROTO Y NO SE TOCA ACÁ ═══
--
-- `cot_gate_congelado()` lee `recurso_precio` en TRES lugares SIN filtrar por `vigente`:
--
--   · SIN_PRECIO             `not exists (... rp.costo is not null and rp.fecha_precio is not null)`
--   · SIN_PRECIO_CALCULABLE  el mismo `not exists`
--   · PRECIO_DESACTUALIZADO  `having max(rp.fecha_precio) < current_date - coalesce(max(rp.vigencia_dias), 180)`
--
-- Mientras cada recurso tenga UNA observación eso da el mismo resultado que mirar la fila vigente
-- —verificado: el gate de la cotización de Quattropani devuelve un JSON idéntico antes y después de
-- esta migración—. En cuanto un recurso tenga dos, se separan y en la dirección peligrosa:
--
--   · una observación vieja pero fechada tapa un precio vigente SIN fecha, y SIN_PRECIO deja de
--     dispararse cuando más falta hace;
--   · si alguien revierte una carga equivocada, `max(fecha_precio)` sigue siendo la de la
--     observación jubilada y el gate declara fresco un total calculado con la vieja;
--   · `max(vigencia_dias)` toma la ventana MÁS PERMISIVA de toda la serie, así que una observación
--     histórica con vigencia contractual larga apaga el control para todas las demás.
--
-- El arreglo es agregar `and rp.vigente` a los tres y leer la vigencia de esa misma fila. NO se hace
-- en esta migración porque el encargo acotó el cambio a `recurso_precio` y hay varias ramas de
-- cotizador en vuelo sobre esa función: reemplazarla desde acá revertiría en silencio el trabajo de
-- otra. Queda declarado para que lo decida quien tiene la vista del conjunto.

-- ═══ QUÉ NO HACE ═══
--
-- No inventa, no interpola y no actualiza nada por inflación. Un precio de 2017 sale con su fecha,
-- sus 3.501 días y su estado HISTORICO. El trabajo de este objeto es que la antigüedad se pueda
-- LEER, no taparla.

-- ── la serie de cada recurso, y cuál de sus observaciones se está usando ───────────────────────
--
-- `left join` desde `recurso` a propósito: «este recurso NUNCA tuvo precio» es información que el
-- gate necesita, y un `join` la haría desaparecer justo cuando más importa.
--
-- El `where` repite el patrón de `analisis_sin_precio`: la vista es `security_invoker`, así que para
-- quien no ve economía la RLS de `recurso_precio` vacía el join y los 389 recursos saldrían como
-- «sin precio». Contestar mal es peor que no contestar: sin `ve_economia()` la vista devuelve CERO
-- filas, y cero acá significa «no te corresponde». `auth.uid() is null` es el rol del servidor —el
-- motor, el worker y los scripts, que no viajan con JWT—: ésos sí la leen entera.
create or replace view public.recurso_precio_serie with (security_invoker = true) as
with obs as (
  select rp.recurso_id,
         count(*)                                                   as observaciones,
         count(*) filter (where rp.fecha_precio is not null)         as observaciones_fechadas,
         min(rp.fecha_precio)                                        as primera_fecha,
         max(rp.fecha_precio)                                        as ultima_fecha
    from public.recurso_precio rp
   group by rp.recurso_id)
select r.id                                          as recurso_id,
       r.codigo,
       r.nombre,
       r.unidad,
       r.tipo,
       r.activo,
       v.id                                          as observacion_id,
       v.costo,
       v.moneda,
       v.fuente,
       v.proveedor,
       v.fecha_precio,
       coalesce(v.vigencia_dias, 180)                 as vigencia_dias,
       (current_date - v.fecha_precio)::int           as antiguedad_dias,
       coalesce(o.observaciones, 0)::int              as observaciones,
       coalesce(o.observaciones_fechadas, 0)::int     as observaciones_fechadas,
       o.primera_fecha,
       o.ultima_fecha,
       (o.ultima_fecha - o.primera_fecha)::int        as span_dias,
       case
         when v.id is null and coalesce(o.observaciones, 0) = 0 then 'FALTA_DATO'
         when v.id is null                                      then 'CONFLICTO'
         when v.fecha_precio is null                            then 'FALTA_DATO'
         when v.fecha_precio > current_date                     then 'ERROR'
         when o.ultima_fecha > v.fecha_precio                   then 'CONFLICTO'
         when (current_date - v.fecha_precio) > coalesce(v.vigencia_dias, 180) then 'HISTORICO'
         else 'EXTRAIDO'
       end                                            as estado,
       case
         when v.id is null and coalesce(o.observaciones, 0) = 0
           then 'no hay ninguna observacion de precio para este recurso: nunca se cotizo'
         when v.id is null
           then 'hay ' || o.observaciones || ' observacion(es) y NINGUNA marcada vigente: nadie eligio cual se usa'
         when v.fecha_precio is null
           then 'la observacion que se usa vale ' || v.costo || ' ' || v.moneda ||
                ' y no dice de que dia es: sin fecha no se puede saber si todavia sirve'
         when v.fecha_precio > current_date
           then 'la observacion que se usa esta fechada el ' || v.fecha_precio || ', en el futuro'
         when o.ultima_fecha > v.fecha_precio
           then 'la observacion marcada vigente es del ' || v.fecha_precio || ' pero la mas nueva de la serie es del ' ||
                o.ultima_fecha || ': el precio que se multiplica NO es el mas reciente que se observo'
         when (current_date - v.fecha_precio) > coalesce(v.vigencia_dias, 180)
           then 'el precio es del ' || v.fecha_precio || ' (' || (current_date - v.fecha_precio) ||
                ' dias, vigencia ' || coalesce(v.vigencia_dias, 180) || '): sirve de referencia y no cierra un presupuesto'
         else 'el precio es del ' || v.fecha_precio || ' (' || (current_date - v.fecha_precio) ||
              ' dias, vigencia ' || coalesce(v.vigencia_dias, 180) || ')'
       end                                            as por_que
  from public.recurso r
  left join public.recurso_precio v on v.recurso_id = r.id and v.vigente
  left join obs o on o.recurso_id = r.id
 where public.ve_economia() or auth.uid() is null;

comment on view public.recurso_precio_serie is
  'UNA fila por recurso: cual de sus observaciones de precio se esta usando (la marcada vigente, '
  'que es la que multiplica recurso_costo), que antiguedad tiene en dias, y cuantas observaciones '
  'respaldan a ese recurso. observaciones = 1 significa que no hay serie: la deriva de ESE recurso '
  'no se puede medir y la vigencia sale prestada del IPC. CONFLICTO cuando la fila vigente no es la '
  'observacion mas nueva, o cuando hay observaciones y ninguna marcada: eso no se resuelve solo, se '
  'declara. Es ECONOMICA: sin ve_economia() devuelve cero filas, y cero es «no te corresponde».';

-- ── la pregunta puntual: «¿qué precio uso para este recurso y qué tan viejo es?» ───────────────
--
-- `returns setof` la vista y no un `record` armado a mano: así hay UN solo lugar donde se decide qué
-- es el vigente. Una función que repitiera el `case` sería la cuarta definición del mismo concepto.
create or replace function public.recurso_precio_estado(p_recurso_id uuid)
returns setof public.recurso_precio_serie
language sql
stable
security invoker
set search_path to 'public'
as $$
  select * from public.recurso_precio_serie where recurso_id = p_recurso_id
$$;

comment on function public.recurso_precio_estado(uuid) is
  'El precio que se usa para un recurso, su antiguedad en dias y cuantas observaciones lo respaldan. '
  'Devuelve CERO filas cuando el recurso no existe o cuando quien pregunta no ve economia — no '
  'devuelve un precio en null, que se leeria como «no tiene».';

grant select on public.recurso_precio_serie to authenticated;
grant select on public.recurso_precio_serie to service_role;
grant execute on function public.recurso_precio_estado(uuid) to authenticated;
grant execute on function public.recurso_precio_estado(uuid) to service_role;

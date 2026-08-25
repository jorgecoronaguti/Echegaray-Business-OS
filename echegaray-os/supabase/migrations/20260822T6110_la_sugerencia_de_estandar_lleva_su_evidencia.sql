-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA SUGERENCIA DE ESTÁNDAR LLEVA SU EVIDENCIA — Y NUNCA SE APLICA SOLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20260822T6100 hizo visible que las 350 actividades están SIN VINCULAR. Ésta contesta la pregunta
-- siguiente —«¿y cuál sería?»— sin contestarla por nadie.
--
-- ═══ QUÉ CUENTA COMO EVIDENCIA, MEDIDO EN LA BASE VIVA (22/08/2026) ═══
--
--   nombre exacto normalizado   12 actividades de 350 enganchan con una tarea tipo
--   código exacto normalizado    0 (las actividades del tracker traen códigos de WBS —«1.2.3»—
--                                   y las tarea tipo códigos de catálogo: dos vocabularios)
--
-- Doce de 350. Ése es el número real y por eso ESTO ES UNA SUGERENCIA: si el 3,4% se resolviera
-- solo y el 96,6% quedara igual, lo único que se habría logrado es que nadie sepa cuáles de los 350
-- fueron mirados por una persona y cuáles los adivinó una consulta.
--
-- ═══ LO QUE QUEDA AFUERA, A PROPÓSITO ═══
--
-- Nada de similitud, tokens ni «se parece». `documentacion-obra-vinculo.mjs` ya paga ese precio con
-- un piso de 2 palabras y un filtro de ruido para el caso documento→actividad, y aun así el
-- resultado sale marcado como INFERENCIA de confianza media. Acá el vínculo decide contra qué
-- estándar se mide el rendimiento de una obra: la barra es «el nombre es el mismo», o nada.
--
-- Y si dos tareas tipo distintas empatan con el mismo nombre normalizado, NO hay sugerencia. Empate
-- no es candidato: elegir una sería inventar la decisión que la persona todavía no tomó.

create or replace view public.obra_actividad_sugerencia_estandar
with (security_invoker = true) as
with candidatas as (
  select
    v.obra_id,
    v.actividad_id,
    v.nombre                         as actividad_nombre,
    t.id                             as tarea_tipo_id,
    t.codigo                         as tarea_tipo_codigo,
    t.nombre                         as tarea_tipo_nombre,
    t.unidad                         as tarea_tipo_unidad,
    -- El código pesa más que el nombre: un código igual es una decisión de catálogo, un nombre
    -- igual puede ser una coincidencia del idioma.
    case when v.codigo is not null
          and public.norm_area_txt(v.codigo) = public.norm_area_txt(t.codigo)
         then 'codigo_exacto' else 'nombre_exacto' end as evidencia
  from public.obra_actividad_vinculacion v
  join public.tarea_tipo t
    on t.activo
   and (
        (v.codigo is not null and public.norm_area_txt(v.codigo) = public.norm_area_txt(t.codigo))
     or public.norm_area_txt(v.nombre) = public.norm_area_txt(t.nombre)
   )
  -- Sólo para lo que está sin vincular y no está archivado: sugerirle una tarea tipo a una
  -- actividad que ya la tiene sería ofrecer pisar una decisión tomada.
  where v.estado = 'sin_vincular' and not v.archivada
),
-- LA PREFERENCIA SE RESUELVE ANTES DE CONTAR. Si una actividad engancha por código con una tarea
-- tipo y por nombre con otra, no son dos candidatas empatadas: manda el código.
mejor as (
  select c.*, min(case when c.evidencia = 'codigo_exacto' then 0 else 1 end)
                 over (partition by c.actividad_id) as mejor_rango
  from candidatas c
),
filtradas as (
  select * from mejor
  where (case when evidencia = 'codigo_exacto' then 0 else 1 end) = mejor_rango
)
select
  f.obra_id,
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
  -- El análisis que se traería, cuando la tarea tipo tiene UNO SOLO vigente. Con varias variantes
  -- vigentes (PNC80 y PNC140 desde T4100) va NULL: la variante la elige quien conoce la obra.
  est.analisis_id                                       as analisis_sugerido_id,
  est.variante                                          as analisis_sugerido_variante,
  est.hh_por_unidad                                     as hh_por_unidad_sugerida,
  est.n_vigentes                                        as analisis_vigentes
from filtradas f
left join lateral (
  select
    count(*)::integer                                   as n_vigentes,
    -- array_agg y no min(): no hay min(uuid), y sobre todo la fila que se devuelve tiene que ser
    -- UNA fila entera —id, variante y horas del MISMO análisis— y no el mínimo de cada columna por
    -- separado, que sería un análisis que no existe.
    case when count(*) = 1 then (array_agg(e.analisis_id))[1]   end as analisis_id,
    case when count(*) = 1 then (array_agg(e.variante))[1]      end as variante,
    case when count(*) = 1 then (array_agg(e.hh_por_unidad))[1] end as hh_por_unidad
  from public.estandar_productivo e
  where e.tarea_tipo_id = f.tarea_tipo_id
) est on true
-- LA REGLA QUE HACE QUE ESTO SEA EVIDENCIA Y NO UNA APUESTA: si la actividad tiene más de una
-- tarea tipo candidata con la mejor evidencia, no se sugiere nada.
where (select count(*) from filtradas g where g.actividad_id = f.actividad_id) = 1;

comment on view public.obra_actividad_sugerencia_estandar is
  'Sugerencias de vinculación actividad → tarea tipo, SÓLO con evidencia dura: código exacto o '
  'nombre exacto (normalizados con norm_area_txt: minúsculas, sin acentos ni puntuación). Nada de '
  'similitud ni tokens, y ningún empate: si hay más de una candidata, no hay sugerencia. Al '
  '22/08/2026 cubre 12 de 350 actividades — por eso se MUESTRA con su evidencia y la aplica una '
  'persona; ninguna de estas filas escribe nada por sí sola. analisis_sugerido_id va NULL cuando la '
  'tarea tipo tiene más de un análisis vigente: elegir la variante es elegir el rendimiento.';

grant select on public.obra_actividad_sugerencia_estandar to authenticated;
grant select on public.obra_actividad_sugerencia_estandar to service_role;

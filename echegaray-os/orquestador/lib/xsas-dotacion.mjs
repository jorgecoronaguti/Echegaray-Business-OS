// CUÁNTA GENTE HACE FALTA — la tercera métrica del aprendizaje de obra.
//
// ═══ POR QUÉ ES UNA MÉTRICA APARTE Y NO UNA COLUMNA MÁS ═══
//
// Las tres miden cosas distintas y necesitan cosas distintas:
//
//   duración      días        sólo necesita fechas            116 hechos hoy
//   rendimiento   hs/unidad   necesita HH **y** cantidad        2 hechos hoy
//   dotación      personas    necesita HH imputadas             4 actividades hoy
//
// Meterlas en una tabla obligaría a rellenar con NULL dos tercios de cada fila y a explicar en cada
// consulta cuál de las tres se está mirando. Y esconden cosas distintas: de una tarea podemos saber
// la duración por seis casos y la dotación por ninguno, y un promedio único lo taparía.
//
// ═══ DE DÓNDE SALE «CUÁNTA GENTE» ═══
//
// De `dotacion_por_hh`: personas distintas que IMPUTARON horas a la actividad. Nunca de
// `obra_asignacion`, que es quién figuraba asignado — la columna `dotacion_real` de la vista cae a
// eso cuando nadie imputó, y para pintar una pantalla alcanza, pero una dotación aprendida de una
// planilla de asignaciones es una dotación que nadie verificó que haya estado en la obra.

import { num } from './obra-plan-real.mjs'
import { OBRAS_NO_REALES } from './xsas-aprendizaje.mjs'

/**
 * ¿DOS DOTACIONES SON LA MISMA? Una persona de diferencia, o un 30% — lo que sea más generoso.
 *
 * El porcentaje solo no sirve con cuadrillas chicas: 2 contra 3 personas es un 50% y son la misma
 * cuadrilla con un ayudante más. Y la persona sola no sirve con cuadrillas grandes: 10 contra 11
 * pasa, 10 contra 14 no.
 */
export const TOLERANCIA_PERSONAS = 1
export const TOLERANCIA_DOTACION_PCT = 30

export function dotacionesConsistentes(a, b) {
  const x = num(a), y = num(b)
  if (x === null || y === null || x === 0) return false
  if (Math.abs(y - x) <= TOLERANCIA_PERSONAS) return true
  return Math.abs(((y - x) / x) * 100) <= TOLERANCIA_DOTACION_PCT
}

/** Desvío de dotación en %. Positivo = trabajó MÁS gente que la prevista. */
export function desvioDotacion(plan, real) {
  const p = num(plan), r = num(real)
  if (p === null || r === null || p === 0) return null
  return ((r - p) / p) * 100
}

/**
 * ¿CUÁNTO VALE ESTA MEDICIÓN DE DOTACIÓN?
 *
 *   alta   la actividad terminó y el cierre no se armó sumando dos declaraciones.
 *   media  terminó con el cierre sumado, o pasó de la mitad sin terminar.
 *   baja   arranque: la cuadrilla todavía se está armando y contarla es contar la mitad.
 */
export function confianzaDotacion({ terminada, avancePct, avanceSumado }) {
  if (terminada === true) return avanceSumado === true ? 'media' : 'alta'
  return (num(avancePct) ?? 0) >= 50 ? 'media' : 'baja'
}

/**
 * EL PASO QUE APRENDE DOTACIÓN. Independiente de los otros dos: corre aunque no haya una sola
 * cantidad ejecutada cargada, porque contar personas no necesita saber cuántos metros se hicieron.
 *
 * Igual que la duración, el hecho se guarda AUNQUE la actividad no tenga tipo de tarea: el dato es
 * cierto y el día que alguien la clasifique pasa a ser reutilizable sin volver a medirlo. Lo que el
 * tipo habilita es comparar entre obras, y por eso sin tipo nunca se VALIDA.
 */
export async function aprenderDotacion({ query }, { dry = false, obras = null } = {}) {
  const { rows } = await query(
    `select actividad_id, obra_id, actividad, tarea_tipo_id, plan_dotacion, dotacion_por_hh,
            avance_pct, terminada, avance_sumado, dias_real, inicio_real, fin_real
       from public.xsas_actividad
      where obra_id <> all($1::text[])
        and ($2::text[] is null or obra_id = any($2::text[]))
        -- SÓLO TRABAJO. Un encabezado de frente «tiene» a todas las personas de sus hijas.
        and es_trabajo
        -- Y sólo horas imputadas: 0 es «nadie imputó», y de ahí no sale una dotación.
        and dotacion_por_hh > 0`,
    [OBRAS_NO_REALES, obras])

  // Cuántas quedaron afuera por no tener a nadie que imputara horas. El hueco se cuenta: sin esto,
  // «4 hechos» parece la totalidad de lo que había.
  const { rows: [s] } = await query(
    `select count(*)::int n from public.xsas_actividad
      where obra_id <> all($1::text[]) and ($2::text[] is null or obra_id = any($2::text[]))
        and es_trabajo and coalesce(dotacion_por_hh, 0) = 0`,
    [OBRAS_NO_REALES, obras])

  const tipos = [...new Set(rows.map((r) => r.tarea_tipo_id).filter(Boolean))]
  const previos = tipos.length
    ? (await query(
      `select actividad_id, obra_id, tarea_tipo_id, dotacion_real, confianza, estado
         from public.dotacion_historica where tarea_tipo_id = any($1::uuid[])`, [tipos])).rows
    : []

  const salida = []
  for (const r of rows) {
    const fila = medir(r, previos)
    salida.push(fila)
    // Lo recién medido entra en la comparación de las siguientes: dos actividades del mismo tipo en
    // la misma corrida tienen que poder confirmarse entre sí, o el estado dependería de cuántas
    // veces se corrió el ciclo y no de la evidencia.
    previos.push({
      actividad_id: r.actividad_id, obra_id: r.obra_id, tarea_tipo_id: r.tarea_tipo_id,
      dotacion_real: r.dotacion_por_hh, confianza: fila.confianza, estado: fila.estado,
    })
    if (!dry) await guardar({ query }, r, fila)
  }

  return {
    medidas: salida.length,
    validadas: salida.filter((x) => x.estado === 'VALIDADO').length,
    sinTipo: rows.filter((r) => !r.tarea_tipo_id).length,
    conPlan: salida.filter((x) => x.desvio !== null).length,
    sinHorasImputadas: s?.n ?? 0,
    filas: salida,
  }
}

/** El veredicto de una fila. Puro salvo por los `previos` que se le pasan. */
function medir(r, previos) {
  const real = Number(r.dotacion_por_hh)
  const confianza = confianzaDotacion({
    terminada: r.terminada, avancePct: r.avance_pct, avanceSumado: r.avance_sumado,
  })
  // VALIDA sólo con otra OBRA: dos frentes de la misma obra comparten la misma cuadrilla, así que
  // que coincidan no prueba nada sobre la tarea. Es la misma regla que rendimiento y duración.
  const otras = r.tarea_tipo_id
    ? previos.filter((p) => p.tarea_tipo_id === r.tarea_tipo_id && p.obra_id !== r.obra_id
      && p.estado !== 'DESCARTADO' && dotacionesConsistentes(p.dotacion_real, real))
    : []
  return {
    clave: `dotacion:${r.actividad_id}`,
    actividad: r.actividad,
    obra: r.obra_id,
    real,
    plan: num(r.plan_dotacion),
    desvio: desvioDotacion(r.plan_dotacion, real),
    estado: otras.length >= 1 ? 'VALIDADO' : 'CANDIDATO',
    confianza,
    vecesConfirmado: otras.length + 1,
  }
}

async function guardar({ query }, r, f) {
  const evidencia = {
    vista: 'public.xsas_actividad', actividad_id: r.actividad_id, obra: r.obra_id,
    personas_que_imputaron: f.real,
    dotacion_prevista: f.plan,
    // Se deja escrito que el número NO salió de las asignaciones: es la diferencia entre quién
    // estuvo y quién figuraba, y sin esta línea no hay forma de saberlo mirando la fila.
    fuente_de_la_dotacion: 'personas distintas con horas imputadas (no obra_asignacion)',
    avance_pct: r.avance_pct, terminada: r.terminada, cierre_sumado: r.avance_sumado === true,
    sin_tipo_de_tarea: !r.tarea_tipo_id,
  }
  await query(
    `insert into public.dotacion_historica
       (actividad_id, obra_id, tarea_tipo_id, actividad_nombre, dotacion_real, dotacion_plan,
        desvio_pct, dias_real, fecha_desde, fecha_hasta, estado, confianza, veces_confirmado,
        evidencia, clave, actualizado_en)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now())
     on conflict (clave) do update set
       tarea_tipo_id = excluded.tarea_tipo_id, dotacion_real = excluded.dotacion_real,
       dotacion_plan = excluded.dotacion_plan, desvio_pct = excluded.desvio_pct,
       dias_real = excluded.dias_real, fecha_desde = excluded.fecha_desde,
       fecha_hasta = excluded.fecha_hasta, estado = excluded.estado,
       confianza = excluded.confianza, veces_confirmado = excluded.veces_confirmado,
       evidencia = excluded.evidencia, actualizado_en = now()`,
    [r.actividad_id, r.obra_id, r.tarea_tipo_id, r.actividad, f.real, f.plan, f.desvio,
      r.dias_real, r.inicio_real, r.fin_real, f.estado, f.confianza, f.vecesConfirmado,
      JSON.stringify(evidencia), f.clave])
}

// QUÉ RENDIMIENTO USAR PARA COTIZAR — y de dónde salió.
//
// ═══ EL CIRCUITO QUE ESTO CIERRA ═══
//
//   PRESUPUESTO → PLAN → EJECUCIÓN → REAL → APRENDIZAJE → **PRÓXIMO PRESUPUESTO**
//
// Las cuatro primeras flechas ya existían. Ésta es la última: cuando alguien va a cotizar una tarea,
// acá está lo que la empresa aprendió haciéndola, con su cantidad de casos y su confianza al lado.
//
// ═══ LA REGLA QUE NO SE NEGOCIA ═══
//
// **Nada se reemplaza en silencio.** La referencia con la que se viene cotizando sigue siendo la
// recomendación por defecto hasta que la experiencia propia la supere en evidencia, no en cantidad
// de dígitos. Un solo caso —por más limpio que esté medido— no cambia un precio: se muestra al lado,
// dice que es un caso, y quien cotiza decide. Dos casos comparables y consistentes sí: ahí la
// experiencia de Echegaray pasa a ser la recomendación, y la referencia queda visible debajo.
//
// El que cotiza ve SIEMPRE las dos y por qué se recomienda una. Un número sin origen no entra a un
// presupuesto.

import { num } from './obra-plan-real.mjs'

/** Mediana — el estadístico correcto acá: una actividad que se descontroló no puede mover el número
 *  de las demás, y con dos o tres casos una media sí se lo comería. */
export function mediana(xs) {
  const v = xs.map(num).filter((x) => x !== null).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

const PEOR = { baja: 0, media: 1, alta: 2 }

/**
 * LA RECOMENDACIÓN, A PARTIR DE TODAS LAS FILAS DE `rendimiento_historico` DE UNA TAREA.
 *
 * `filas`: [{ hsUnitarias, estado, confianza, obraId, actividadId }]
 *
 * Devuelve las dos lecturas por separado —`referencia` y `experiencia`— y cuál se recomienda, con
 * el motivo escrito. Nunca devuelve un número solo.
 */
export function rendimientoParaCotizar(filas = []) {
  const limpias = filas.filter((f) => num(f.hsUnitarias) !== null)
  const refs = limpias.filter((f) => f.estado === 'REFERENCIA')
  const validadas = limpias.filter((f) => f.estado === 'VALIDADO')
  const candidatas = limpias.filter((f) => f.estado === 'CANDIDATO')
  // Las DESCARTADAS no participan: alguien ya dijo que ese caso no representa nada.

  const referencia = refs.length
    ? { hsUnitarias: mediana(refs.map((f) => f.hsUnitarias)), casos: refs.length, origen: 'referencia base (xlsm)' }
    : null

  const reales = validadas.length ? validadas : candidatas
  const experiencia = reales.length
    ? {
      hsUnitarias: mediana(reales.map((f) => f.hsUnitarias)),
      casos: reales.length,
      estado: validadas.length ? 'VALIDADO' : 'CANDIDATO',
      confianza: ['baja', 'media', 'alta'][Math.min(...reales.map((f) => PEOR[f.confianza] ?? 0))],
      obras: [...new Set(reales.map((f) => f.obraId).filter(Boolean))],
      origen: 'ejecución real de Echegaray',
    }
    : null

  let recomendado = null
  let porQue = 'no hay ni referencia ni experiencia propia para esta tarea'

  if (experiencia?.estado === 'VALIDADO') {
    recomendado = 'experiencia'
    porQue = `${experiencia.casos} casos reales comparables y consistentes (confianza ${experiencia.confianza})`
  } else if (referencia) {
    recomendado = 'referencia'
    porQue = experiencia
      ? `la experiencia propia todavía es ${experiencia.casos} caso(s) sin confirmar — se muestra, no se aplica`
      : 'no hay ejecución real medida de esta tarea todavía'
  } else if (experiencia && experiencia.confianza !== 'baja') {
    recomendado = 'experiencia'
    porQue = `sin referencia base: es lo único medido, y son ${experiencia.casos} caso(s) de confianza ${experiencia.confianza}`
  } else if (experiencia) {
    // UN CASO DE CONFIANZA BAJA NO SE RECOMIENDA, aunque sea lo único que hay. Confianza baja
    // significa que la actividad recién arrancó o que le falta un dato: cotizar con eso es peor que
    // cotizar sabiendo que no se sabe. El número se DEVUELVE igual —quien cotiza tiene derecho a
    // verlo— pero sin recomendación arriba.
    recomendado = null
    porQue = `hay ${experiencia.casos} caso(s) medido(s) pero de confianza baja (poco avance o falta un dato): se muestra, no se recomienda`
  }

  // El desvío entre lo que se venía usando y lo que la obra viene mostrando. Es el número que le
  // dice al dueño si la tabla con la que cotiza sigue sirviendo.
  const desvioPct = referencia?.hsUnitarias && experiencia?.hsUnitarias
    ? ((experiencia.hsUnitarias - referencia.hsUnitarias) / referencia.hsUnitarias) * 100
    : null

  return { referencia, experiencia, recomendado, porQue, desvioPct }
}

/** El borde: lee las filas de una tarea y devuelve la recomendación. Sólo lee. */
export async function rendimientoDeTarea({ query }, tareaTipoId) {
  const { rows } = await query(
    `select hs_unitarias, estado, confianza, obra_id, actividad_id, veces_confirmado
       from public.rendimiento_historico where tarea_tipo_id = $1`, [tareaTipoId])
  return rendimientoParaCotizar(rows.map((r) => ({
    hsUnitarias: r.hs_unitarias, estado: r.estado, confianza: r.confianza,
    obraId: r.obra_id, actividadId: r.actividad_id,
  })))
}

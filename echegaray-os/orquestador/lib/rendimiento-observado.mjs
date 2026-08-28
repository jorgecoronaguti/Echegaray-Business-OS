// DE LA OBSERVACIÓN DE OBRA A LA COMPOSICIÓN DE MANO DE OBRA DEL ANÁLISIS. Puro, sin base.
//
// ═══ POR QUÉ EXISTE ═══
//
// «Horas Hombre.xlsm» no midió tareas: midió PROCESOS. Cada fila dice cuántas horas costó UNA cosa
// —montar la columna, pintarla, armar la correa— con QUÉ cuadrilla. Convertir eso en el análisis de
// una partida exige dos operaciones que no son obvias y que, hechas a ojo, mienten:
//
//   1. **REPARTIR LAS HORAS ENTRE CATEGORÍAS.** El total de HH no dice cuántas fueron de oficial y
//      cuántas de ayudante, y las dos cuestan distinto (6.120 vs 4.452 $/h en el maestro de mayo).
//      El reparto sale de la cuadrilla que la observación anotó: si trabajaron 4 oficiales y 2
//      ayudantes durante los mismos días, dos tercios de las horas son de oficial. No es una
//      estimación: es la única lectura posible de «6 personas × 6 días × 8 h».
//
//   2. **PROMEDIAR SÓLO LO COMPARABLE.** Dos observaciones del MISMO proceso se promedian. Dos
//      observaciones de procesos distintos —armar la correa y colocarla— NO: su promedio no es
//      ningún rendimiento, es un número que no describe ningún trabajo. Por eso el agrupador que
//      importa es el proceso, y por eso cada proceso medido termina siendo su propia partida.
//
// ═══ LA REGLA QUE NO SE NEGOCIA ═══
//
// **SIN OBSERVACIONES NO HAY RENDIMIENTO, Y ESO SE DICE CON `null` — NUNCA CON CERO.** Un cero se
// suma, se promedia y se cotiza; un `null` obliga a preguntar. La diferencia entre las dos formas de
// decir «no sé» es la diferencia entre una partida sin precio y una partida gratis.

/** Redondeo a 3 decimales, que es la precisión con la que la Base Maestra escribe sus cantidades
 *  (0,167 caños por metro de cercha, 0,726 kg de hierro por m² de techo). PURA. */
const r3 = (x) => Math.round(x * 1000) / 1000

/** Total de personas de una cuadrilla anotada: {"oficial": 4, "ayudante": 2} → 6. PURA. */
export function personasDe(cuadrilla) {
  const vs = Object.values(cuadrilla ?? {}).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  return vs.reduce((a, b) => a + b, 0)
}

/**
 * LAS HORAS UNITARIAS DE UNA OBSERVACIÓN, REPARTIDAS POR CATEGORÍA. PURA.
 *
 * Devuelve `null` cuando la observación no trae cuadrilla: sin saber quién hizo las horas no se
 * puede escribir una línea de análisis, y repartirlas mitad y mitad sería inventar la cuadrilla.
 */
export function repartoDe(observacion) {
  const hs = Number(observacion?.hs_unitarias)
  const cuadrilla = observacion?.cuadrilla
  const personas = personasDe(cuadrilla)
  if (!Number.isFinite(hs) || hs <= 0 || personas <= 0) return null
  const reparto = {}
  for (const [categoria, n] of Object.entries(cuadrilla)) {
    if (!(Number(n) > 0)) continue
    reparto[categoria] = hs * (Number(n) / personas)
  }
  return reparto
}

/** La dispersión de una muestra como fracción: (máx − mín) / media. `null` con una sola
 *  observación, porque una observación no tiene dispersión — no tiene cero dispersión. PURA. */
export function dispersionDe(valores = []) {
  const vs = valores.map(Number).filter((n) => Number.isFinite(n))
  if (vs.length < 2) return null
  const media = vs.reduce((a, b) => a + b, 0) / vs.length
  if (!(media > 0)) return null
  return (Math.max(...vs) - Math.min(...vs)) / media
}

/**
 * EL RENDIMIENTO DE UN PROCESO A PARTIR DE SUS OBSERVACIONES. PURA.
 *
 * Promedio simple de las horas unitarias observadas —la misma agregación que usa
 * `rendimiento_contra_lo_cotizado` en la base, para que la partida y el control no lean el mismo
 * hecho de dos maneras—, con el reparto por categoría promediado del mismo modo.
 *
 * Devuelve `null` sin observaciones utilizables. Es el control que impide publicar un rendimiento
 * que nadie midió.
 */
export function rendimientoDeProceso(observaciones = []) {
  const utiles = (observaciones ?? []).map((o) => ({ obs: o, reparto: repartoDe(o) })).filter((x) => x.reparto)
  if (!utiles.length) return null
  const categorias = [...new Set(utiles.flatMap((x) => Object.keys(x.reparto)))]
  const porCategoria = {}
  for (const c of categorias) {
    porCategoria[c] = r3(utiles.reduce((a, x) => a + (x.reparto[c] ?? 0), 0) / utiles.length)
  }
  const unitarias = utiles.map((x) => Number(x.obs.hs_unitarias))
  return {
    muestras: utiles.length,
    // Las obras se cuentan distinto de las muestras a propósito: cinco filas de la misma obra siguen
    // siendo una obra, y el gate de promoción mira obras, no filas.
    obras: new Set(utiles.map((x) => x.obs.obra_id ?? 'sin-obra')).size,
    hsUnitarias: r3(unitarias.reduce((a, b) => a + b, 0) / unitarias.length),
    porCategoria,
    dispersion: dispersionDe(unitarias),
    origenes: utiles.map((x) => x.obs.origen ?? null),
  }
}

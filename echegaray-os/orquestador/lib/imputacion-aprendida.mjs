// IMPUTACIÓN QUE APRENDE DEL DUEÑO — sugerir rubro/obra/unidad de un comprobante nuevo, y pedir menos
// a medida que aprende.
//
// ═══ QUÉ ES (F8, sobre las fuentes que ya existen) ═══
//
// Cuando entra un comprobante a Compras hay que imputarlo: UNIDAD de negocio (col I), OBRA (col J) y —
// derivado de ambos— el RUBRO de caja (col AC, la línea del Cash Flow). Hoy lo hace el dueño a mano en
// cada fila. Cada fila que ya imputó es una decisión suya registrada: "este proveedor, este concepto →
// esta obra, esta unidad". Este módulo APRENDE de esa historia y, para un comprobante nuevo, SUGIERE la
// imputación con una confianza declarada. Si el dueño siempre imputa "Barcelo" a combustible de tal obra,
// lo sugiere; si es ambiguo (un proveedor que aparece en cinco obras distintas), baja la confianza y lo
// DICE — pregunta en vez de adivinar.
//
// ═══ DE DÓNDE SALE LA HISTORIA — SIN DUPLICAR NI RECALCULAR (una-fuente) ═══
//
// La dueña del dato de imputación es la pestaña Compras del Cash Flow, ya espejada en public.costos_obra
// (sync-compras.mjs, origen='compras_sheet'): proveedor, unidad_negocio, obra_texto, concepto, total. Ese
// espejo YA contiene sólo filas que el dueño asignó a una obra — es exactamente el historial de sus
// imputaciones. Este módulo NO crea una tabla nueva, NO copia Compras, NO reescribe una imputación: lee
// la historia y estima.
//
// DOS FEEDERS, UN SOLO QUE APRENDE (03/08). `perfilesDeImputacion(historia)` es PURA y no le importa
// de dónde salen las filas. Hoy la alimentan dos: `perfilesDeImputacionDesdeDB()` con el espejo
// public.costos_obra, y el bot de comprobantes con la pestaña Compras VIVA que ya lee para buscar
// duplicados (`historiaDeCompras`, en lib/comprobantes/compras-vivas.mjs). La viva es más completa
// para el DETALLE de la columna K: el espejo pega detalle y concepto en un solo campo y sólo guarda
// las filas que ya tienen obra. Por eso desde la DB el detalle sale `sin_historia`, y se declara —
// no se adivina con el campo pegado.
//
// El RUBRO no se aprende por separado: se COMPUTA con rubroDeCaja() (rubro-caja.mjs, la única definición
// del rubro en todo el sistema) a partir de la imputación sugerida. Aprender el rubro aparte sería una
// segunda versión del mismo concepto — justo lo que la arquitectura prohíbe. Su confianza cuelga de las
// dimensiones de las que el rubro realmente depende.
//
// ═══ GOBERNANZA (no negociable) ═══
//
// El clasificador SUGIERE, NO IMPONE. Toda sugerencia sale marcada tipo:'INFERIDO', impone:false, y con
// pide_confirmacion: el dueño siempre ve la sugerencia y puede corregirla. Baja confianza → pide_confirma-
// cion:true (pregunta, no adivina). Nunca escribe la imputación sola sin posibilidad de corrección. Y la
// corrección RE-ALIMENTA el aprendizaje: cuando el dueño confirma o corrige, esa fila vuelve a Compras →
// se espeja a costos_obra → entra a la historia de la próxima sugerencia. El ciclo se cierra por la MISMA
// fuente única, sin un canal paralelo. aplicarCorreccion() modela ese cierre para el núcleo puro.
//
// ═══ HONESTIDAD (el principio de confianza) ═══
//
// Un proveedor sin historia suficiente NO recibe una imputación inventada: baja confianza declarada y
// pregunta. La métrica declarada (tasaAcierto): el % de comprobantes bien auto-imputados debería SUBIR y
// las correcciones BAJAR a medida que se acumula historia. Hoy la historia recién arranca — se entrega la
// maquinaria y la medición, no una tasa ya lograda.
//
// ═══ NÚCLEO PURO vs. BORDE CON I/O ═══
//
//   perfilesDeImputacion / sugerirImputacion / aplicarCorreccion / tasaAcierto  → PUROS. Sin BD, sin
//     reloj, deterministas. Es lo que se testea.
//   perfilesDeImputacionDesdeDB(deps)  → BORDE. Lee public.costos_obra y arma los perfiles. No escribe,
//     no recalcula montos (Nivel D, reversible). Degrada a perfiles vacíos si no hay historia.

import { rubroDeCaja, SIN_CLASIFICAR, norm as normRubro } from './rubro-caja.mjs'

// n de comprobantes históricos de un proveedor para hablar con evidencia, y qué tan concentrada tiene que
// estar su historia en un solo valor. Conservador: preferimos declarar el hueco y preguntar a inventar.
export const MIN_FUERTE = 5
export const MIN_PARCIAL = 2
export const SHARE_FUERTE = 0.8
export const SHARE_PARCIAL = 0.6

/** Normaliza un proveedor para agrupar sin cruzarlo por espacios/mayúsculas. PURA. */
export const normProv = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
/** Palabras significativas de un concepto (≥4 letras), para refinar la obra por texto. PURA. */
export function palabrasConcepto(v) {
  return String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 4)
}
const redondear = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d)

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — de una lista de valores a la moda y su concentración
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la distribución de una lista de valores. Devuelve el valor más frecuente (moda), su
 * cantidad, el total no vacío, la proporción que representa y cuántos valores distintos hay. Ignora los
 * vacíos: una fila sin unidad no vota. Determinista: empate → gana el que aparece primero (orden estable).
 */
export function distribucion(valores = []) {
  const cuenta = new Map()
  let total = 0
  for (const v of valores) {
    const k = String(v ?? '').trim()
    if (!k) continue
    total++
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
  }
  let top = null; let topN = 0
  for (const [k, n] of cuenta) if (n > topN) { top = k; topN = n }
  // Las alternativas, de la más usada a la menos. Cuando la evidencia NO alcanza para sugerir, hay
  // que preguntar igual — pero preguntar con las opciones más probables adelante, no en blanco.
  const opciones = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([valor, n]) => ({ valor, n }))
  return { top, topN, total, share: total ? topN / total : 0, distintos: cuenta.size, opciones }
}

// La etiqueta de evidencia: gobierna si el perfil se usa como sugerencia firme o pide confirmación. No es
// decorativa. Necesita VOLUMEN (n) y CONCENTRACIÓN (share): mucha historia repartida entre diez obras no
// es evidencia de nada.
export function evidenciaDe(n, share) {
  if (n >= MIN_FUERTE && share >= SHARE_FUERTE) return 'inferido_fuerte'
  if (n >= MIN_PARCIAL && share >= SHARE_PARCIAL) return 'inferido_parcial'
  if (n === 0) return 'sin_historia'
  return 'ambiguo'
}
// Confianza en [0,1]: sube con n y con la concentración. Interpretable, no una fórmula mágica.
export function confianzaDe(n, share) {
  if (n === 0) return 0.1
  const base = n >= MIN_FUERTE ? 0.8 : n >= MIN_PARCIAL ? 0.5 : 0.25
  return redondear(Math.max(0.1, base * (0.4 + 0.6 * share)), 2)
}

/**
 * NÚCLEO PURO: el perfil de UNA dimensión (unidad u obra) a partir de sus valores históricos. Qué sugerir,
 * con cuánta evidencia, si pide confirmación. Un valor sugerido null (historia toda vacía) siempre pide.
 */
export function perfilDimension(valores = []) {
  const d = distribucion(valores)
  const evidencia = evidenciaDe(d.total, d.share)
  const confianza = confianzaDe(d.total, d.share)
  const firme = evidencia === 'inferido_fuerte'
  return {
    sugerido: d.top,
    n: d.total,
    distintos: d.distintos,
    opciones: d.opciones,
    share: redondear(d.share, 3),
    evidencia,
    confianza,
    // Pide confirmación salvo que la evidencia sea fuerte y haya un valor concreto que sugerir.
    pide_confirmacion: !(firme && d.top != null),
  }
}

/**
 * NÚCLEO PURO: el perfil de imputación de UN proveedor a partir de sus filas históricas. Distribución de
 * unidad y de obra, y el detalle por-obra guardando qué conceptos acompañan a cada obra (para refinar
 * cuando el proveedor aparece en varias). No toca BD ni reloj.
 *
 * @param {string} proveedor
 * @param {Array} regs filas {unidad_negocio|unidad, obra_texto|obra, concepto}
 */
export function perfilProveedor(proveedor, regs = []) {
  const unidades = regs.map((r) => r.unidad_negocio ?? r.unidad)
  const obras = regs.map((r) => r.obra_texto ?? r.obra)
  // Por cada obra, el bag de palabras de sus conceptos: permite desempatar por el concepto del comprobante.
  const conceptoPorObra = new Map()
  // Y por cada obra, qué DETALLE (col K) usó el dueño ahí con este proveedor. Ver `perfilDetalle`.
  const detallePorObra = new Map()
  for (const r of regs) {
    const obra = String(r.obra_texto ?? r.obra ?? '').trim()
    if (!obra) continue
    if (!conceptoPorObra.has(obra)) conceptoPorObra.set(obra, new Map())
    const bag = conceptoPorObra.get(obra)
    for (const w of palabrasConcepto(r.concepto)) bag.set(w, (bag.get(w) ?? 0) + 1)
    if (!detallePorObra.has(obra)) detallePorObra.set(obra, [])
    detallePorObra.get(obra).push(r.detalle)
  }
  return {
    proveedor: normProv(proveedor),
    n: regs.length,
    unidad: perfilDimension(unidades),
    obra: perfilDimension(obras),
    // El detalle del proveedor sin mirar la obra. Sirve cuando el proveedor hace siempre lo mismo
    // ("Combustible") y no cuando el detalle es del equipo o del frente, que es lo habitual.
    detalle: perfilDimension(regs.map((r) => r.detalle)),
    conceptoPorObra,
    detallePorObra: new Map([...detallePorObra].map(([obra, ds]) => [obra, perfilDimension(ds)])),
  }
}

/**
 * NÚCLEO PURO: agrupa la historia por proveedor y devuelve un perfil por cada uno. No toca BD ni reloj.
 *
 * @param {Array} historia filas {proveedor, unidad_negocio|unidad, obra_texto|obra, concepto}
 */
export function perfilesDeImputacion(historia = []) {
  const porProv = new Map()
  for (const r of historia) {
    const k = normProv(r.proveedor)
    if (!k) continue
    if (!porProv.has(k)) porProv.set(k, [])
    porProv.get(k).push(r)
  }
  const por_proveedor = {}
  for (const [k, regs] of porProv) por_proveedor[k] = perfilProveedor(k, regs)
  return {
    por_proveedor,
    n_proveedores: porProv.size,
    n_registros: historia.filter((r) => normProv(r.proveedor)).length,
    fuente: 'public.costos_obra (espejo fiel de la pestaña Compras) — cada fila es una imputación del dueño',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — sugerir la imputación de un comprobante nuevo (SIEMPRE inferida)
// ════════════════════════════════════════════════════════════════════════════

// Refina la obra sugerida por el concepto del comprobante: si el proveedor tiene varias obras, la que más
// comparte palabras con el concepto gana. Sólo pisa la moda si el solapamiento es claro; si no, deja la
// moda. Devuelve {obra, porConcepto:boolean} o null si no hay con qué refinar.
function refinarObraPorConcepto(perfilProv, concepto) {
  const palabras = new Set(palabrasConcepto(concepto))
  if (!palabras.size || !perfilProv.conceptoPorObra || perfilProv.conceptoPorObra.size < 2) return null
  let mejor = null; let mejorScore = 0
  for (const [obra, bag] of perfilProv.conceptoPorObra) {
    let score = 0
    for (const w of palabras) score += bag.get(w) ?? 0
    if (score > mejorScore) { mejor = obra; mejorScore = score }
  }
  return mejorScore > 0 ? { obra: mejor, porConcepto: true } : null
}

/**
 * NÚCLEO PURO: el DETALLE (columna K, "Detalles / Obra") que este proveedor tuvo antes.
 *
 * ═══ POR QUÉ EL DETALLE SE APRENDE ACÁ Y NO EN UN MÓDULO DEL BOT (03/08) ═══
 *
 * "Camion - BSA" no está en ningún desplegable: es texto libre, y su única definición legítima es lo
 * que el dueño ya escribió en esa obra. Es exactamente el mismo problema que este módulo resuelve
 * para la unidad y la obra —aprender de la historia y declarar la confianza— así que vive acá, con
 * los mismos umbrales, y lo aprovechan por igual el bot de Mattermost y el cargador de Claude Code.
 *
 * LA CLAVE ES (proveedor, OBRA), no el proveedor solo. El detalle casi nunca depende del proveedor:
 * depende del frente o del equipo al que se le carga el gasto. Combustibles Barcelo en MESSINA es
 * "Camion - BSA"; el mismo proveedor en otra obra es otra cosa. Por eso, con obra conocida se usa el
 * perfil de esa obra, y sólo sin obra se cae al perfil general del proveedor — declarando el alcance.
 *
 * @param {object} perfil  el de `perfilProveedor`
 * @param {string|null} obra
 */
export function perfilDetalle(perfil, obra = null) {
  const sinHist = { sugerido: null, n: 0, distintos: 0, share: 0, evidencia: 'sin_historia', confianza: 0.1, pide_confirmacion: true, alcance: 'sin_historia' }
  if (!perfil) return { ...sinHist }
  const k = String(obra ?? '').trim()
  const porObra = k ? perfil.detallePorObra?.get(k) : null
  if (porObra) return { ...porObra, alcance: 'proveedor+obra', obra: k }
  // Sin historia en ESA obra no se ofrece el detalle de otra: sería imputar el gasto a un frente que
  // nunca tuvo. Con obra desconocida sí vale el perfil general, declarado como tal.
  if (k) return { ...sinHist, alcance: 'proveedor+obra' }
  return { ...(perfil.detalle ?? sinHist), alcance: 'proveedor' }
}

/**
 * NÚCLEO PURO: sugiere la imputación (unidad, obra, rubro) de un comprobante nuevo a partir de los perfiles
 * aprendidos. SUGIERE, NO IMPONE: siempre impone:false y con pide_confirmacion por dimensión.
 *
 * Cascada de evidencia por dimensión: perfil del proveedor si tiene historia → si no, sin_historia, valor
 * null y pide confirmación. Un proveedor desconocido NUNCA recibe un valor inventado.
 *
 * El RUBRO se COMPUTA con rubroDeCaja() (fuente única) sobre la imputación sugerida. Su confianza declara
 * de qué depende: si el rubro sale igual con o sin la unidad/obra sugeridas, lo determina el proveedor/
 * concepto solo y es firme; si cambia según la imputación, hereda la (menor) confianza de esas dimensiones.
 *
 * @param {{proveedor?, concepto?, monto?}} comprobante
 * @param {{por_proveedor:object}} perfiles salida de perfilesDeImputacion
 * @param {{rubroFn?:Function}} [opts] inyectable para test; por defecto rubroDeCaja
 * @returns {object} sugerencia declarada
 */
export function sugerirImputacion(comprobante = {}, perfiles = {}, opts = {}) {
  const rubroFn = opts.rubroFn || rubroDeCaja
  const provKey = normProv(comprobante.proveedor)
  const perfil = perfiles?.por_proveedor?.[provKey] ?? null

  const sinHist = { sugerido: null, n: 0, distintos: 0, share: 0, evidencia: 'sin_historia', confianza: 0.1, pide_confirmacion: true }
  const unidad = perfil ? { ...perfil.unidad } : { ...sinHist }
  const obra = perfil ? { ...perfil.obra } : { ...sinHist }

  // Refinar la obra por el concepto del comprobante, si el proveedor trabaja en varias obras.
  let obraNota = null
  if (perfil) {
    const ref = refinarObraPorConcepto(perfil, comprobante.concepto)
    if (ref && ref.obra && ref.obra !== obra.sugerido) {
      obra.sugerido = ref.obra
      obraNota = 'obra elegida por coincidencia de concepto, no por la más frecuente del proveedor'
    }
  }

  // RUBRO: computado, no aprendido. Se evalúa con y sin la imputación sugerida para saber de qué depende.
  const filaConImput = { proveedor: comprobante.proveedor, unidad: unidad.sugerido ?? '', cliente: obra.sugerido ?? '', concepto: comprobante.concepto }
  const filaSinImput = { proveedor: comprobante.proveedor, unidad: '', cliente: '', concepto: comprobante.concepto }
  const rubroSug = rubroFn(filaConImput)
  const rubroBase = rubroFn(filaSinImput)
  const estableSinImput = normRubro(rubroSug) === normRubro(rubroBase)
  const rubroClasificado = rubroSug !== SIN_CLASIFICAR
  let rubroConf; let rubroEvid
  if (!rubroClasificado) { rubroConf = 0.1; rubroEvid = 'sin_clasificar' }
  else if (estableSinImput) { rubroConf = 0.9; rubroEvid = 'determinado_por_proveedor' }
  else { rubroConf = Math.min(unidad.confianza, obra.confianza); rubroEvid = 'depende_de_la_imputacion' }
  const rubro = {
    sugerido: rubroSug,
    confianza: redondear(rubroConf, 2),
    evidencia: rubroEvid,
    // El rubro sólo NO pide confirmación si está clasificado y o bien lo fija el proveedor, o bien las
    // dimensiones de las que depende son firmes.
    pide_confirmacion: !(rubroClasificado && (estableSinImput || (!unidad.pide_confirmacion && !obra.pide_confirmacion))),
  }

  // EL DETALLE SE SUGIERE CONTRA LA OBRA QUE VA A QUEDAR. Si quien llama ya sabe la obra —porque el
  // dueño la escribió a mano en el papel, que MANDA sobre cualquier historial— se usa ésa; si no, la
  // sugerida. Nunca se pisa lo que el comprobante ya declara.
  const obraElegida = String(comprobante.obra ?? '').trim() || obra.sugerido
  const detalle = perfilDetalle(perfil, obraElegida)

  // El detalle NO entra en el `pide_confirmacion` general a propósito: es texto libre de la columna K
  // y su ausencia no impide cargar la fila. Que se pregunte o no lo decide quien arma el mensaje,
  // mirando `detalle.pide_confirmacion`.
  const pide_confirmacion = unidad.pide_confirmacion || obra.pide_confirmacion || rubro.pide_confirmacion
  return {
    tipo: 'INFERIDO',
    impone: false, // GOBERNANZA: nunca escribe solo; el dueño siempre confirma o corrige
    proveedor: provKey || null,
    proveedor_conocido: !!perfil,
    n_historia: perfil?.n ?? 0,
    unidad,
    obra: obraNota ? { ...obra, nota: obraNota } : obra,
    detalle,
    rubro,
    pide_confirmacion,
    nota: notaSugerencia({ perfil, unidad, obra, rubro }),
  }
}

function notaSugerencia({ perfil, unidad, obra, rubro }) {
  if (!perfil) return 'proveedor sin historia de imputación: no sugiero valores, pregunto — el rubro se computa por sus reglas si el concepto alcanza'
  const partes = []
  partes.push(unidad.pide_confirmacion
    ? `unidad ambigua (${unidad.distintos} distintas en ${unidad.n})`
    : `unidad "${unidad.sugerido}" firme (${Math.round(unidad.share * 100)}% de ${unidad.n})`)
  partes.push(obra.pide_confirmacion
    ? `obra ambigua (${obra.distintos} distintas en ${obra.n})`
    : `obra "${obra.sugerido}" firme (${Math.round(obra.share * 100)}% de ${obra.n})`)
  if (!rubro.pide_confirmacion) partes.push(`rubro "${rubro.sugerido}" (${rubro.evidencia})`)
  return partes.join('; ')
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — el ciclo se cierra: la corrección del dueño re-alimenta el aprendizaje
// ════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: incorpora la imputación CONFIRMADA/CORREGIDA por el dueño a la historia y devuelve una
 * historia NUEVA (no muta). Modela el cierre del ciclo: en producción esa fila vuelve a Compras y se
 * espeja a costos_obra por la fuente única; acá se demuestra que la próxima sugerencia la tiene en cuenta.
 *
 * @param {Array} historia
 * @param {{proveedor, unidad?, obra?, concepto?}} correccion lo que el dueño dejó
 */
export function aplicarCorreccion(historia = [], correccion = {}) {
  if (!normProv(correccion.proveedor)) return historia.slice()
  return [...historia, {
    proveedor: correccion.proveedor,
    unidad_negocio: correccion.unidad ?? correccion.unidad_negocio ?? null,
    obra_texto: correccion.obra ?? correccion.obra_texto ?? null,
    concepto: correccion.concepto ?? null,
  }]
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — la medición: cuánto acierta, para ver si mejora con el tiempo
// ════════════════════════════════════════════════════════════════════════════

/** ¿La sugerencia de una dimensión coincidió con lo que el dueño terminó dejando? Comparación normalizada. */
function acerto(sugerido, real) {
  if (real == null || real === '') return null // sin verdad conocida: no cuenta ni a favor ni en contra
  return normProv(sugerido) === normProv(real)
}

/**
 * NÚCLEO PURO: tasa de acierto por dimensión sobre una lista de evaluaciones {sugerida, real}. Es la
 * MÉTRICA declarada de F8: debería subir a medida que se acumula historia. Sólo cuenta los casos donde
 * hay verdad conocida (el dueño dejó un valor). Honesto: sin evaluaciones devuelve nulls, no un 100%.
 *
 * @param {Array<{sugerida:object, real:object}>} evaluaciones
 */
export function tasaAcierto(evaluaciones = []) {
  const dims = ['unidad', 'obra', 'rubro']
  const acc = {}
  for (const dim of dims) acc[dim] = { aciertos: 0, evaluados: 0 }
  let autoImputables = 0
  for (const e of evaluaciones) {
    const s = e.sugerida ?? {}
    const r = e.real ?? {}
    // Auto-imputable = la sugerencia no pedía confirmación en ninguna dimensión.
    if (s.pide_confirmacion === false) autoImputables++
    for (const dim of dims) {
      const ok = acerto(s[dim]?.sugerido, r[dim])
      if (ok == null) continue
      acc[dim].evaluados++
      if (ok) acc[dim].aciertos++
    }
  }
  const tasa = {}
  for (const dim of dims) tasa[dim] = acc[dim].evaluados ? redondear(acc[dim].aciertos / acc[dim].evaluados, 3) : null
  return {
    n: evaluaciones.length,
    auto_imputables: autoImputables,
    tasa_auto: evaluaciones.length ? redondear(autoImputables / evaluaciones.length, 3) : null,
    aciertos: tasa,
    detalle: acc,
    nota: evaluaciones.length
      ? 'la tasa sube a medida que el dueño imputa y la historia crece; correcciones que bajan = aprendizaje'
      : 'sin evaluaciones todavía: la maquinaria mide, la historia recién arranca',
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O — leer la historia de public.costos_obra y armar los perfiles
// ════════════════════════════════════════════════════════════════════════════

/**
 * BORDE: lee la historia de imputaciones de public.costos_obra (espejo de Compras) y devuelve los perfiles
 * por proveedor. NO escribe, NO recalcula montos (Nivel D, reversible). Si la tabla no existe o está
 * vacía, degrada a perfiles vacíos y lo declara — nunca inventa historia.
 *
 * @param {object} deps {query?}
 */
export async function perfilesDeImputacionDesdeDB(deps = {}) {
  const query = deps.query || (await import('./db.mjs')).query
  let rows = []
  try {
    ({ rows } = await query(
      `select proveedor, unidad_negocio, obra_texto, concepto
         from public.costos_obra
        where origen = 'compras_sheet' and proveedor is not null and btrim(proveedor) <> ''`,
    ))
  } catch {
    return { ...perfilesDeImputacion([]), disponible: false, nota: 'no pude leer public.costos_obra; se entrega la maquinaria sin historia' }
  }
  const p = perfilesDeImputacion(rows)
  const conFuerte = Object.values(p.por_proveedor).filter((x) => x.unidad.evidencia === 'inferido_fuerte' || x.obra.evidencia === 'inferido_fuerte').length
  return {
    ...p,
    disponible: true,
    nota: p.n_registros === 0
      ? 'aún no hay historia de imputación espejada: la maquinaria mide, la historia recién arranca'
      : `${p.n_registros} imputaciones en ${p.n_proveedores} proveedores; ${conFuerte} con una dimensión ya firme`,
  }
}

/**
 * BORDE de conveniencia: los perfiles + la sugerencia para UN comprobante, en una sola llamada. Sólo lee.
 */
export async function sugerirImputacionDesdeDB(comprobante, deps = {}) {
  const perfiles = await perfilesDeImputacionDesdeDB(deps)
  return { sugerencia: sugerirImputacion(comprobante, perfiles), perfiles_disponibles: perfiles.disponible }
}

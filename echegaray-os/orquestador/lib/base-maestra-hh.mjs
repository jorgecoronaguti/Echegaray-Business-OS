// LAS HH POR CATEGORÍA SALEN DE LA COMPOSICIÓN, NUNCA DE `Análisis!M:N`. NÚCLEO PURO.
//
// ═══ LAS DOS FUENTES QUE EL LIBRO OFRECE, Y POR QUÉ UNA ESTÁ PODRIDA (28/08/2026) ═══
//
// `Análisis` trae dos columnas al final de cada cabecera de tarea: `M = «OF E - OF»` y
// `N = «AY»`. Parecen la respuesta directa a «¿cuántas horas de oficial y de ayudante lleva un
// metro cuadrado de esto?». No lo son.
//
// Su fórmula es POSICIONAL: `M7 = +E8` y `N7 = +E9`, o sea «la cantidad de la primera línea» y «la
// de la segunda», asumiendo que la primera línea es siempre el oficial y la segunda el ayudante.
// Es una referencia relativa, y alguien insertó y borró filas. Medido con
// `scripts/auditar-planilla-cotizar.mjs` sobre las 199 tareas del libro —173 de ellas con mano de
// obra—, la columna de resumen sirve en 57 y no sirve en 116:
//
//     COINCIDE con la composición ·······  57
//     DIFIERE ···························  16
//     SIN_RESUMEN (la celda está vacía) · 100
//     (26 tareas más no llevan mano de obra)
//
// Y no fallan al azar: están **corridas un bloque entero**. `M/N` de T1019 vale 18,5 / 18,0, que
// es exactamente la composición de T1020. Los de T1023 valen 0,9 / 0,8, que es la composición de
// T1024. La mayoría directamente están vacías.
//
// ═══ Y ADEMÁS QUIEN LAS CONSUME LEE OTRA COLUMNA ═══
//
// `DIAGRAMACION!I8` y `Costo MO!F9` —las dos hojas que calculan dotación y duración— dicen:
//
//     I8 = VLOOKUP(B8, Análisis!A:N, 10, FALSE)   rotulada «OF»
//     J8 = VLOOKUP(B8, Análisis!A:N, 11, FALSE)   rotulada «AY»
//
// En `Análisis!A:N` la columna 10 es `J` = «CS» —las cargas sociales, en PESOS— y la 11 es `K` =
// «FECHA», un serial de Excel. Las HH están en la 13 y la 14. Hoy las dos hojas están enteras en
// `#REF!` (74 y 62 celdas) porque perdieron sus referencias al `Presupuesto`, así que el error
// nunca se vio: si alguien las «arreglara» reconectando las fórmulas, dimensionaría la cuadrilla
// con pesos de cargas sociales y con un número de fecha tomados por horas.
//
// ═══ LA INTENCIÓN SE RECUPERA, EL ERROR NO SE MIGRA ═══
//
// La intención de `DIAGRAMACION` es buena y está escrita en sus propios rótulos: jornada efectiva
// 7,50 h (D4), HH necesarias por categoría (Tn of / Tn ay), tiempo de ejecución en jornadas y en
// horas, tiempo disponible, desperdicio horario y días por categoría. Es, con otros nombres, el
// método Navas/Ridl/Torés que ya vive en `lib/plano/cuadrilla.mjs` — y la jornada de 7,50 h
// coincide al decimal con la que ese módulo trae del paper.
//
// Entonces acá no se escribe un segundo motor de cuadrillas: se arregla la ENTRADA. Las HH por
// categoría se derivan de las líneas del análisis, sumando por lo que cada recurso ES y no por
// dónde está sentado, y el resultado se le pasa a `contenidosDesdeComposicion` / `planDeMano`,
// que ya existen y ya tienen sus tests.
//
// LO QUE ESTE MÓDULO NO HACE: no calcula cuadrillas, no calcula duraciones y no valida ningún
// rendimiento. Produce las HH por categoría de una partida y dice de dónde salió cada hora.

/** De dónde salió una hora. Sólo una de las dos es fuente; la otra existe para poder rechazarla. */
export const FUENTE_HH = Object.freeze({
  COMPOSICION: 'COMPOSICION',                 // se sumaron las líneas de mano de obra del análisis
  COLUMNA_RESUMEN_ANALISIS: 'COLUMNA_RESUMEN_ANALISIS', // `Análisis!M:N` — NO se usa
})

/**
 * Cómo se clasifica una hora. La regla vive acá y no en una lista de nombres porque el libro
 * escribe la misma categoría de cinco formas: OFICIAL, OFICIAL ESPECIALIZADO,
 * OFICIAL ESPECIALIZADO - EN DOLARES, y en `MO Lu-Vi 8 a 16` aparece «M. OFICIAL».
 *
 * El MEDIO OFICIAL cuenta como oficial: en obra hace tarea de oficial, que es lo que mide el
 * método de cuadrillas. Mezclarlo con el ayudante rompería la relación de la cuadrilla.
 */
const CATEGORIA = Object.freeze([
  ['oficial', /\bOFICIAL\b|\bOF\.?\s*ESP|ESPECIALIZAD|MEDIO\s*OFICIAL|\bM\.\s*OFICIAL\b/],
  ['ayudante', /\bAYUDANTE\b|\bAYUD\b|\bPEON\b/],
])

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase()

/** Redondeo a 4 decimales: 0,06 h/m² no necesita más, y el float sí necesita el corte. */
const r4 = (n) => Number(n.toFixed(4))

/**
 * LAS HH POR CATEGORÍA DE UNA PARTIDA, DESDE SUS LÍNEAS. PURA.
 *
 * Sólo entran las líneas cuyo `tipo` es `mano_obra` —el que produce `clasificarTipo()` de
 * `base-maestra-xlsm.mjs`—. Las cargas sociales NO son horas de trabajo: son el costo de esas
 * horas, y contarlas duplicaría la dotación. En este libro son cuatro recursos (255, 255.1, 256,
 * 257) que se cotizan por `hr` y por eso engañan a cualquier regla que mire la unidad.
 *
 * Una línea de mano de obra que no cae en ninguna categoría NO se reparte ni se promedia: sale
 * listada en `sinCategoria`. Un «MO varios» que se traga horas de las dos categorías rompe la
 * relación de la cuadrilla, y hay que verlo.
 *
 * @param {Array<{nombre?:string, cantidad?:number, tipo?:string, unidad?:string}>} lineas
 * @returns {{oficial_h_u:number, ayudante_h_u:number, total_h_u:number,
 *            sinCategoria:Array, fuente:string, lineasUsadas:number}}
 */
export function hhPorCategoria(lineas = []) {
  let oficial = 0
  let ayudante = 0
  let usadas = 0
  const sinCategoria = []
  for (const l of lineas) {
    if (String(l?.tipo ?? '').toLowerCase() !== 'mano_obra') continue
    const cantidad = typeof l?.cantidad === 'number' && Number.isFinite(l.cantidad) ? l.cantidad : null
    if (cantidad === null) { sinCategoria.push({ nombre: l?.nombre ?? null, cantidad: null, porque: 'la línea no tiene cantidad' }); continue }
    const nombre = normalizar(l?.nombre)
    const cat = CATEGORIA.find(([, re]) => re.test(nombre))?.[0] ?? null
    if (cat === 'oficial') { oficial += cantidad; usadas++ } else if (cat === 'ayudante') { ayudante += cantidad; usadas++ } else {
      sinCategoria.push({ nombre: l?.nombre ?? null, cantidad, porque: 'es mano de obra pero el nombre no dice la categoría' })
    }
  }
  return {
    oficial_h_u: r4(oficial),
    ayudante_h_u: r4(ayudante),
    total_h_u: r4(oficial + ayudante),
    sinCategoria,
    lineasUsadas: usadas,
    fuente: FUENTE_HH.COMPOSICION,
  }
}

/**
 * ¿`Análisis!M:N` dice lo mismo que la composición? PURA.
 *
 * No se usa para elegir —la composición gana siempre— sino para MEDIR el daño y poder decir
 * cuántas tareas del libro tenían el resumen podrido. Un `null` en M o en N no es un cero: es una
 * celda que perdió su referencia, y se informa como `SIN_RESUMEN`.
 *
 * @returns {{estado:'COINCIDE'|'DIFIERE'|'SIN_RESUMEN', porque:string, resumen:object, composicion:object}}
 */
export function contrastarConResumen(hh, { M = null, N = null } = {}, { tolerancia = 0.005 } = {}) {
  const resumen = { oficial_h_u: M, ayudante_h_u: N, fuente: FUENTE_HH.COLUMNA_RESUMEN_ANALISIS }
  if (M === null || N === null) {
    return { estado: 'SIN_RESUMEN', porque: 'la columna de resumen del análisis está vacía: perdió su referencia', resumen, composicion: hh }
  }
  const coincide = Math.abs(M - hh.oficial_h_u) <= tolerancia && Math.abs(N - hh.ayudante_h_u) <= tolerancia
  return {
    estado: coincide ? 'COINCIDE' : 'DIFIERE',
    porque: coincide
      ? 'el resumen del análisis coincide con la suma de las líneas'
      : `el resumen dice ${M}/${N} y las líneas suman ${hh.oficial_h_u}/${hh.ayudante_h_u}: la fórmula posicional del resumen apunta a otro bloque`,
    resumen,
    composicion: hh,
  }
}

/**
 * LAS COLUMNAS DE `Análisis` POR SU RÓTULO, PARA QUE NADIE VUELVA A CONTAR DESDE `A`.
 *
 * `DIAGRAMACION` y `Costo MO` piden la 10 y la 11 creyendo que son las HH. Son `CS` y `FECHA`.
 * Este mapa es el contrato: si alguien inserta una columna en el libro, `verificarColumnasHH()`
 * lo dice en vez de dejar que el sistema dimensione cuadrillas con pesos.
 */
export const COLUMNA_ANALISIS = Object.freeze({
  COD_T: 1, COD_R: 2, DESCRIPCION: 3, UN: 4, CANTIDAD: 5, COSTO: 6, TOTAL: 7,
  MO: 8, MA: 9, CS: 10, FECHA: 11, CONSIDERACIONES: 12, OF_E_OF: 13, AY: 14,
})

/** El índice que `DIAGRAMACION!I8` y `Costo MO!F9` usan hoy, y que NO son las HH. */
export const INDICE_ROTO_DIAGRAMACION = Object.freeze({ of: 10, ay: 11 })

/**
 * ¿El encabezado de `Análisis` sigue siendo el que estos índices asumen? PURA.
 *
 * @param {Record<string, unknown>} fila  la fila 5 del libro, `{A:'COD T', B:'COD R', …}`
 * @returns {string[]} los problemas; vacío = el layout es el esperado
 */
export function verificarColumnasHH(fila = {}) {
  const esperado = { M: /^OF ?E ?- ?OF$/i, N: /^AY$/i, J: /^CS$/i, K: /^FECHA$/i }
  const problemas = []
  for (const [col, re] of Object.entries(esperado)) {
    const visto = String(fila[col] ?? '').trim()
    if (!re.test(visto)) problemas.push(`columna ${col} dice "${visto || '∅'}" y se esperaba ${re}`)
  }
  return problemas
}

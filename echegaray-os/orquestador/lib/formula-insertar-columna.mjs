// QUÉ TIENE QUE DECIR CADA CELDA DESPUÉS DE INSERTAR UNA COLUMNA — el núcleo puro de la verificación de
// `scripts/sheet-insertar-columna-obra.mjs`.
//
// ═══ POR QUÉ NO ALCANZA CON COMPARAR VALORES (auditor, 15/09/2026) ═══
//
// Una fórmula mal corrida puede dar el MISMO número el día de la inserción: `=SUM(O4:O)` que quedó
// apuntando a la columna vieja cuando las dos suman lo mismo, o un rango que hoy está vacío. El valor pasa
// la comparación y la fórmula queda rota para siempre. Por eso cada celda se compara DOS veces: el valor
// (salvo las volátiles) y el texto de la fórmula contra la original con sus referencias corridas COMO LO
// HACE GOOGLE al insertar: toda referencia a una columna ≥ la insertada, en la propia pestaña o con
// prefijo `Compras!`/`'Cobranzas'!`, se corre una letra; lo que está dentro de un texto ("…") no se toca
// —Google tampoco lo toca, y si un INDIRECT queda roto lo delata el valor.
//
// La fórmula esperada NO se lee de Google: se calcula acá desde la foto previa. Un control que se valida
// contra lo que produce el mismo sistema no puede dar rojo.

const letraDe = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const indiceDe = (l) => [...String(l).toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1
export const letraDeColumna = letraDe

export const esFormula = (c) => typeof c === 'string' && c.startsWith('=')

/** Partes de código y de texto literal ("…" con "" como comilla escapada). */
function partes(formula) {
  const out = []
  let actual = ''
  let enTexto = false
  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i]
    if (ch === '"') {
      if (enTexto && formula[i + 1] === '"') { actual += '""'; i++; continue }
      if (!enTexto) { out.push({ codigo: true, t: actual }); actual = '"'; enTexto = true; continue }
      out.push({ codigo: false, t: `${actual}"` }); actual = ''; enTexto = false; continue
    }
    actual += ch
  }
  out.push({ codigo: !enTexto, t: actual })
  return out
}

/** Funciones cuyo valor cambia entre dos lecturas sin que nadie toque nada: se comparan sólo como fórmula. */
const RE_VOLATIL = /(^|[^\w.])(NOW|TODAY|RAND|RANDBETWEEN|RANDARRAY|GOOGLEFINANCE|IMPORTRANGE|IMPORTDATA|IMPORTHTML|IMPORTXML|IMPORTFEED)\s*\(/i
export const esVolatil = (c) => esFormula(c) && partes(c).some((p) => p.codigo && RE_VOLATIL.test(p.t))

// [prefijo!]REF[:REF]. Qué es referencia de verdad lo deciden los bordes, en `ajustarCodigo`.
const RE_REF = /(?:('(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Z]{1,3}\$?\d*)(?::(\$?[A-Z]{1,3}\$?\d*))?/g

const nombreDe = (prefijo) => (prefijo.startsWith("'") ? prefijo.slice(1, -1).replace(/''/g, "'") : prefijo)
const correrExtremo = (ref, desde) => ref.replace(/^(\$?)([A-Z]{1,3})/, (_, s, l) => s + (indiceDe(l) >= desde ? letraDe(indiceDe(l) + 1) : l))

function ajustarCodigo(codigo, propia, desde) {
  let out = ''
  let ultimo = 0
  RE_REF.lastIndex = 0
  for (let m = RE_REF.exec(codigo); m; m = RE_REF.exec(codigo)) {
    const [todo, prefijo, a, b] = m
    const ini = m.index
    const fin = ini + todo.length
    const bordeIzq = !/[\w.$'!:]/.test(codigo[ini - 1] ?? '')
    const bordeDer = !/[\w.$'!(\[]/.test(codigo[fin] ?? '')
    // «SUM», «TRUE» o «E5» calzan con la forma de una columna: sin fila y sin rango no son referencias.
    const esRef = /\d/.test(a) || b !== undefined
    if (!bordeIzq || !bordeDer || !esRef) { RE_REF.lastIndex = ini + 1; continue }
    const d = desde[prefijo ? nombreDe(prefijo) : propia]
    if (d === undefined) continue
    const nuevo = `${prefijo ? `${prefijo}!` : ''}${correrExtremo(a, d)}${b !== undefined ? `:${correrExtremo(b, d)}` : ''}`
    out += codigo.slice(ultimo, ini) + nuevo
    ultimo = fin
  }
  return out + codigo.slice(ultimo)
}

/**
 * La fórmula como la deja Google después de insertar.
 * @param {string} formula @param {string} propia la pestaña donde vive la celda
 * @param {Record<string, number>} desde pestaña → índice 0-based de la columna insertada
 */
export function ajustarFormula(formula, propia, desde) {
  if (!esFormula(formula)) return formula
  return partes(formula).map((p) => (p.codigo ? ajustarCodigo(p.t, propia, desde) : p.t)).join('')
}

/** ¿La fórmula nombra alguna de estas pestañas? Incluye textos: un INDIRECT("Compras!L:L") también depende. */
export function citaA(formula, pestanas) {
  if (!esFormula(formula)) return false
  return pestanas.some((p) => {
    const q = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''")
    return new RegExp(`(^|[^\\w.])('${q}'|${q})!`).test(formula)
  })
}

/** Las pestañas (fuera de las insertadas) que tienen al menos una fórmula que cita a las insertadas. */
export function pestanasQueCitan(formulasPorPestana = {}, insertadas = []) {
  return Object.entries(formulasPorPestana)
    .filter(([t, g]) => !insertadas.includes(t) && (g ?? []).some((f) => (f ?? []).some((c) => citaA(c, insertadas))))
    .map(([t]) => t)
}

/** Una grilla con una columna vacía insertada en `indice`. */
export function correrUnaColumna(grilla = [], indice) {
  return grilla.map((f) => {
    const fila = [...(f ?? [])]
    if (fila.length <= indice) return fila
    return [...fila.slice(0, indice), '', ...fila.slice(indice)]
  })
}

const vacio = (v) => v === undefined || v === null || v === ''

function comparar(esperado, real, { pestana, tipo, saltar }) {
  const out = []
  for (let i = 0; i < Math.max(esperado.length, real.length); i++) {
    const [e, r] = [esperado[i] ?? [], real[i] ?? []]
    for (let j = 0; j < Math.max(e.length, r.length); j++) {
      if (saltar(i, j) || (vacio(e[j]) && vacio(r[j])) || e[j] === r[j]) continue
      out.push(`${pestana}!${letraDe(j)}${i + 1} [${tipo}] ${JSON.stringify(e[j])} → ${JSON.stringify(r[j])}`)
    }
  }
  return out
}

/**
 * La relectura de UNA pestaña contra su foto previa. En la pestaña insertada todo se corre una columna y la
 * celda del rótulo nuevo se salta; en una pestaña que sólo la cita, las posiciones no se mueven pero sus
 * fórmulas sí cambian de texto.
 * @param {{pestana:string, antes:{valores:any[][],formulas:any[][]}, despues:{valores:any[][],formulas:any[][]},
 *   desde:Record<string,number>, insercion?:{indice:number, filaEncabezado:number}|null}} p
 * @returns {string[]} `Pestaña!A1 [fórmula|valor] esperado → leído`
 */
export function diferenciasDePestana({ pestana, antes, despues, desde, insercion = null }) {
  const correr = (g) => (insercion ? correrUnaColumna(g, insercion.indice) : g)
  const formulas = correr((antes?.formulas ?? []).map((f) => (f ?? []).map((c) => ajustarFormula(c, pestana, desde))))
  const valores = correr(antes?.valores ?? [])
  const rotulo = (i, j) => !!insercion && i === insercion.filaEncabezado - 1 && j === insercion.indice
  return [
    ...comparar(formulas, despues?.formulas ?? [], { pestana, tipo: 'fórmula', saltar: rotulo }),
    ...comparar(valores, despues?.valores ?? [], { pestana, tipo: 'valor', saltar: (i, j) => rotulo(i, j) || esVolatil(formulas[i]?.[j]) }),
  ]
}

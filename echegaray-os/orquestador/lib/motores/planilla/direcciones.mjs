// LA GRAMÁTICA DE UNA PLANILLA: workbook · hoja · rango · celda. NÚCLEO PURO, cero I/O.
//
// ═══ POR QUÉ ESTE ARCHIVO ES EL PRIMERO ═══
//
// Tratar una planilla como ESTRUCTURA empieza por poder NOMBRAR una posición sin ambigüedad. Hoy en
// este repo la dirección A1 se arma a mano en cada script (`${letraCol(c)}${f + 1}`, repetido en
// decenas de archivos) y se PARSEA en ninguno: los rangos se pasan como cadenas opacas hasta la API
// de Google, que es la primera que los mira. Por eso un rango mal armado sólo se descubre como un
// `400 Unable to parse range` después de haber escrito medio lote.
//
// ═══ LAS DOS REGLAS QUE ESTE ARCHIVO HACE CUMPLIR ═══
//
// 1. UN RANGO CERRADO, NUNCA ABIERTO. `A:A` o `A5:C` le delegan a Google decidir dónde termina el
//    bloque, y Google responde con lo que HOY tiene contenido. Un total sobre `A:A` cambia de
//    significado cada vez que alguien agrega una fila, y un bloque que se limpia con un rango
//    abierto barre lo que había más abajo. En este repo eso ya dejó plata afuera de un total.
//    `parsearRango` marca el rango abierto y el motor lo rechaza con `RANGO_ABIERTO`.
//
// 2. EL BLOQUE DECLARA TODO SU ANCHO Y TODO SU ALTO. Una escritura que declara un rango más chico
//    que la grilla que manda deja viva la capa de la corrida anterior en las filas/columnas que no
//    cubrió — el fósil que ya apareció en Estructura y en Recurrentes. `rangoDeGrilla` deriva el
//    rectángulo EXACTO de la grilla, en vez de dejar que cada llamador lo escriba de memoria.

import { CODIGOS, fallar } from './errores.mjs'

/** Índice 0 → letra de columna. 0 → 'A', 25 → 'Z', 26 → 'AA'. */
export function letraCol(i) {
  if (!Number.isInteger(i) || i < 0) fallar(CODIGOS.RANGO_INVALIDO, `columna inválida: ${i}`, { indice: i })
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/** Letra de columna → índice 0. 'A' → 0, 'AA' → 26. Case-insensitive. */
export function indiceCol(letra) {
  const s = String(letra || '').trim().toUpperCase()
  if (!/^[A-Z]+$/.test(s)) fallar(CODIGOS.RANGO_INVALIDO, `columna inválida: "${letra}"`, { letra })
  let n = 0
  for (const c of s) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/** Una celda A1 → { fila, col } con AMBOS índices en base 0. La fila de A1 es 0, no 1. */
export function parsearCelda(a1) {
  const m = /^\$?([A-Za-z]+)\$?([0-9]+)$/.exec(String(a1 || '').trim())
  if (!m) fallar(CODIGOS.RANGO_INVALIDO, `celda inválida: "${a1}"`, { celda: a1 })
  const fila = Number(m[2]) - 1
  if (fila < 0) fallar(CODIGOS.RANGO_INVALIDO, `la fila 0 no existe en A1: "${a1}"`, { celda: a1 })
  return { fila, col: indiceCol(m[1]) }
}

/** { fila, col } base 0 → 'B7'. */
export function formatearCelda({ fila, col }) {
  if (!Number.isInteger(fila) || fila < 0) fallar(CODIGOS.RANGO_INVALIDO, `fila inválida: ${fila}`, { fila })
  return `${letraCol(col)}${fila + 1}`
}

/**
 * El nombre de la hoja, citado si lo necesita.
 *
 * La comilla simple no es cosmética: sin ella `Panel Caja!A1` es un rango que Google no parsea, y
 * `Hoja.2!A1` se lee como otra cosa. Se cita ante cualquier cosa que no sea letras/números/guion
 * bajo, y la comilla interna se duplica (regla de Sheets, no de JS).
 */
export function citarHoja(nombre) {
  const s = String(nombre ?? '')
  if (!s) return s
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !/^[A-Za-z]+[0-9]+$/.test(s)) return s
  return `'${s.replace(/'/g, "''")}'`
}

/** Saca las comillas de un nombre de hoja citado. Inversa exacta de `citarHoja`. */
export function descitarHoja(nombre) {
  const s = String(nombre ?? '').trim()
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'")
  return s
}

/** Parte "'Panel Caja'!A1:C10" en el nombre de hoja y el resto. La hoja puede faltar. */
function partirHoja(ref) {
  const s = String(ref || '').trim()
  if (s.startsWith("'")) {
    // Una comilla duplicada es literal; el cierre es la comilla impar seguida de '!'.
    for (let i = 1; i < s.length; i++) {
      if (s[i] !== "'") continue
      if (s[i + 1] === "'") { i++; continue }
      if (s[i + 1] === '!') return { hoja: descitarHoja(s.slice(0, i + 1)), resto: s.slice(i + 2) }
      break
    }
    fallar(CODIGOS.RANGO_INVALIDO, `nombre de hoja sin cerrar: "${ref}"`, { rango: ref })
  }
  const i = s.lastIndexOf('!')
  return i < 0 ? { hoja: null, resto: s } : { hoja: s.slice(0, i), resto: s.slice(i + 1) }
}

/**
 * Un rango A1 → estructura. `{ hoja, desde:{fila,col}, hasta:{fila,col}, abierto, hojaEntera }`.
 *
 * `abierto` es la marca que hace cumplir la regla 1 del encabezado: `A:A`, `A5:C` y `Hoja!5:9` la
 * llevan puesta. NO se rechaza acá —parsear no es decidir—; el motor decide, y así un llamador que
 * de verdad quiera leer una columna entera (un diagnóstico, nunca una escritura) puede hacerlo
 * sabiendo lo que hace.
 */
export function parsearRango(ref) {
  const { hoja, resto } = partirHoja(ref)
  if (!resto) return { hoja, desde: null, hasta: null, abierto: true, hojaEntera: true }

  const [a, b] = resto.split(':')
  if (b === undefined) {
    const c = parsearCelda(a)
    return { hoja, desde: c, hasta: { ...c }, abierto: false, hojaEntera: false }
  }
  const soloCol = /^\$?[A-Za-z]+$/
  const soloFila = /^\$?[0-9]+$/
  if (soloCol.test(a) && soloCol.test(b)) {
    return { hoja, desde: { fila: null, col: indiceCol(a.replace('$', '')) }, hasta: { fila: null, col: indiceCol(b.replace('$', '')) }, abierto: true, hojaEntera: false }
  }
  if (soloFila.test(a) && soloFila.test(b)) {
    return { hoja, desde: { fila: Number(a.replace('$', '')) - 1, col: null }, hasta: { fila: Number(b.replace('$', '')) - 1, col: null }, abierto: true, hojaEntera: false }
  }
  // Mixtos tipo "A5:C" o "A:C10": una punta sin fila deja el rango abierto de ese lado.
  const abierto = soloCol.test(a) || soloCol.test(b) || soloFila.test(a) || soloFila.test(b)
  if (abierto) {
    return { hoja, desde: null, hasta: null, abierto: true, hojaEntera: false, crudo: resto }
  }
  const desde = parsearCelda(a)
  const hasta = parsearCelda(b)
  if (hasta.fila < desde.fila || hasta.col < desde.col) {
    fallar(CODIGOS.RANGO_INVALIDO, `rango al revés: "${ref}" (el fin es anterior al inicio)`, { rango: ref })
  }
  return { hoja, desde, hasta, abierto: false, hojaEntera: false }
}

/** Estructura → A1 (con la hoja citada si la hay). Inversa de `parsearRango` para rangos cerrados. */
export function formatearRango({ hoja, desde, hasta }) {
  if (!desde || !hasta) fallar(CODIGOS.RANGO_INVALIDO, 'no se puede formatear un rango sin puntas', { desde, hasta })
  const cuerpo = `${formatearCelda(desde)}:${formatearCelda(hasta)}`
  return hoja ? `${citarHoja(hoja)}!${cuerpo}` : cuerpo
}

/** Cuántas filas y columnas cubre un rango cerrado. */
export function dimensiones(r) {
  if (r.abierto) fallar(CODIGOS.RANGO_ABIERTO, 'un rango abierto no tiene dimensión conocida', { rango: r })
  return { filas: r.hasta.fila - r.desde.fila + 1, columnas: r.hasta.col - r.desde.col + 1 }
}

/**
 * EL RECTÁNGULO EXACTO QUE OCUPA UNA GRILLA ANCLADA EN UNA CELDA.
 *
 * Es la respuesta a la trampa del ancho: el alto sale de `grid.length` y el ancho de la fila MÁS
 * ANCHA, no de la primera. Una grilla con filas de largo distinto —lo más común cuando se arma a
 * mano— declaraba antes el ancho de la fila 0 y dejaba sin cubrir las columnas de las demás.
 *
 * @param {string|null} hoja
 * @param {string} ancla celda A1 donde arranca el bloque
 * @param {any[][]} grid
 */
export function rangoDeGrilla(hoja, ancla, grid) {
  const filas = Array.isArray(grid) ? grid.length : 0
  if (!filas) fallar(CODIGOS.RANGO_INVALIDO, 'una grilla vacía no tiene rango', { ancla })
  const ancho = Math.max(...grid.map((f) => (Array.isArray(f) ? f.length : 0)), 1)
  const d = parsearCelda(ancla)
  return {
    hoja,
    desde: d,
    hasta: { fila: d.fila + filas - 1, col: d.col + ancho - 1 },
    abierto: false,
    hojaEntera: false,
  }
}

/** ¿El rango `chico` está enteramente dentro de `grande`? Ambos cerrados. Para probar que una
 *  escritura no se sale del bloque que declaró ser suyo. */
export function contiene(grande, chico) {
  if (grande.abierto || chico.abierto) return false
  if ((grande.hoja ?? null) !== (chico.hoja ?? null)) return false
  return chico.desde.fila >= grande.desde.fila && chico.desde.col >= grande.desde.col
    && chico.hasta.fila <= grande.hasta.fila && chico.hasta.col <= grande.hasta.col
}

/** Normaliza una grilla al rectángulo completo del rango: rellena con `relleno` lo que falte.
 *  Sin esto, una fila corta deja columnas sin escribir y la comparación post-escritura compara
 *  contra un `undefined` que nunca se mandó. */
export function rectangular(grid, { filas, columnas }, relleno = '') {
  return Array.from({ length: filas }, (_, f) => Array.from({ length: columnas },
    (_, c) => (grid?.[f]?.[c] === undefined ? relleno : grid[f][c])))
}

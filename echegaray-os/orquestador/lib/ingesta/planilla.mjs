// LEER UNA PLANILLA SIN PERDER DÓNDE ESTABA CADA NÚMERO.
//
// ═══ QUÉ ESTABA ROTO ═══
//
// El único camino que tenía el circuito para abrir un Excel era `google.readExcel`, y ese camino
// aplana la planilla a un blob de texto: `rows.map(f => f.filter(Boolean).join(' | '))`. Con eso se
// pierden, en este orden, las cuatro cosas que hacen falta para defender una cantidad:
//
//   · la HOJA         — lee `SheetNames[0]` y descarta el resto en silencio. En el COMPUTO.xlsx de
//                       Quattropani la primera hoja es «Real» (lo ejecutado) y la que originó la
//                       cotización es «Presupuestado». Leer la primera es leer la hoja equivocada.
//   · la CELDA        — sin dirección A1 no hay evidencia citable: «9,9 m³» no se puede volver a
//                       encontrar en el archivo, y una cantidad que no se puede volver a encontrar
//                       es un número dicho de memoria.
//   · la FÓRMULA      — `sheet_to_json` devuelve el valor calculado. `H3 = C3*D3*E3*F3` deja de ser
//                       un cómputo con inputs auditables y pasa a ser la constante 9,9.
//   · el VACÍO        — `filter(Boolean)` borra los ceros y los huecos por igual. Una celda vacía y
//                       un 0 escrito a mano terminan siendo lo mismo, y NULL≠0.
//
// ═══ POR QUÉ SHEETJS Y NO UN PARSER PROPIO ═══
//
// `docx.mjs` sí parsea OOXML a mano sobre `zip.mjs`, y la coherencia pedía hacer lo mismo acá. No se
// hizo por una razón concreta: las FÓRMULAS COMPARTIDAS. En SpreadsheetML una celda puede llevar
// `<f t="shared" si="3"/>` sin cuerpo, y su fórmula real vive en otra celda que declaró el mismo
// `si` con un origen distinto — hay que trasladar las referencias por el delta de fila y columna.
// Un parser ingenuo devuelve fórmula vacía para esas celdas, o sea FALTA_DATO donde hay un cómputo
// perfectamente escrito, y el error es SILENCIOSO. SheetJS ya está en `package.json` (lo usa
// `google.mjs`) y resuelve ese caso. Este módulo es el ÚNICO que lo importa: el resto del OS ve el
// modelo canónico, igual que `pdf.mjs` es el único que ve pdfjs.
//
// ═══ LO QUE ESTE LECTOR NO PUEDE, LO DICE ═══
//
// Un `.xls` de 1997 es OLE2, no un ZIP, y un `.csv` no tiene ni hojas ni fórmulas. Los dos salen con
// `ok:false` y el motivo nombrado. Devolver `{hojas: []}` para un formato que no se sabe abrir es la
// forma más barata de que un proyecto entero se declare «sin cantidades» por una limitación del
// lector y nadie se entere.

import { createRequire } from 'node:module'
import { pareceZip } from './zip.mjs'

// `require` sobre ESM a propósito: mantiene `leerPlanilla` SÍNCRONA. Todo lo que la consume es puro
// y se prueba sin `await`; un `await import` obligaría a que el takeoff entero fuera asincrónico.
const require = createRequire(import.meta.url)

/** El tipo de lo que hay en una celda. `ERROR` y `VACIA` existen a propósito y no colapsan a 0. */
export const CELDA = Object.freeze({
  NUMERO: 'NUMERO',
  TEXTO: 'TEXTO',
  FECHA: 'FECHA',
  BOOL: 'BOOL',
  ERROR: 'ERROR',
  VACIA: 'VACIA',
})

/** La firma de un documento OLE2 (`.xls`, `.doc`, `.ppt` de Office 97-2003). */
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** Índice de columna (1 = A) a partir de su letra. PURA. */
export function columnaDeLetra(letra) {
  let n = 0
  for (const ch of String(letra ?? '').toUpperCase()) {
    const c = ch.charCodeAt(0) - 64
    if (c < 1 || c > 26) return null
    n = n * 26 + c
  }
  return n || null
}

/** La letra de una columna a partir de su índice (1 → A). PURA. */
export function letraDeColumna(n) {
  let x = Number(n)
  if (!Number.isInteger(x) || x < 1) return null
  let s = ''
  while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - r) / 26) }
  return s
}

/** Partir una dirección A1 en fila y columna. Devuelve `null` si no es una dirección. PURA. */
export function partirDireccion(celda) {
  const m = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(String(celda ?? '').trim())
  if (!m) return null
  const col = columnaDeLetra(m[1])
  return col ? { columna: col, letra: m[1].toUpperCase(), fila: Number(m[2]) } : null
}

/**
 * LAS CELDAS QUE UNA FÓRMULA LEE. PURA.
 *
 * Es lo que convierte `C3*D3*E3*F3` en inputs auditables: sin esta lista, la fórmula es una cadena
 * decorativa y el «de dónde salió 9,9» sigue sin respuesta. Los rangos (`SUMA(P3:P10)`) se devuelven
 * como rango y NO se expanden acá: expandir un rango abierto de 10.000 filas para guardar los
 * inputs de una suma es pagar memoria por una respuesta que nadie hace.
 *
 * Las referencias a OTRA hoja (`Presupuestado!H3`) conservan la hoja, porque un input que vive en
 * otra pestaña es exactamente el caso donde «citar la celda» sin decir la hoja miente.
 */
export function refsDeFormula(formula) {
  const f = String(formula ?? '')
  if (!f) return []
  // Se sacan primero los literales de texto: `SI(A1="m3";…)` no debe aportar `A1` dos veces ni
  // convertir un "B2" escrito adentro de una etiqueta en una referencia.
  const limpia = f.replace(/"(?:[^"]|"")*"/g, '""')
  const vistas = new Map()
  const re = /(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_.]*))?!?\$?([A-Za-z]{1,3})\$?(\d{1,7})(?::\$?([A-Za-z]{1,3})\$?(\d{1,7}))?/g
  for (const m of limpia.matchAll(re)) {
    const hoja = m[1] ?? (m[2] && limpia[m.index + m[0].indexOf(m[2]) + m[2].length] === '!' ? m[2] : null)
    // Sin `!` explícito, un identificador pegado a la referencia es un nombre de función (`LOG10`)
    // y no una hoja: se descarta el prefijo, no la referencia.
    const desde = `${m[3].toUpperCase()}${m[4]}`
    if (!partirDireccion(desde)) continue
    const hasta = m[5] ? `${m[5].toUpperCase()}${m[6]}` : null
    const clave = `${hoja ?? ''}!${desde}${hasta ? ':' + hasta : ''}`
    if (!vistas.has(clave)) vistas.set(clave, { hoja: hoja ?? null, desde, hasta, rango: Boolean(hasta) })
  }
  return [...vistas.values()]
}

/** El tipo canónico de una celda de SheetJS. PURA. */
export function tipoDeCelda(c) {
  if (!c || c.v === undefined || c.v === null) return CELDA.VACIA
  if (c.t === 'e') return CELDA.ERROR
  if (c.t === 'b') return CELDA.BOOL
  if (c.t === 'd' || c.v instanceof Date) return CELDA.FECHA
  if (c.t === 'n') return CELDA.NUMERO
  return CELDA.TEXTO
}

/** Una celda de SheetJS traducida al modelo canónico. PURA.
 *  Las de tipo ERROR conservan el texto del error (`#REF!`) y NO traen valor: ERROR≠0. */
export function normalizarCelda(direccion, c) {
  const d = partirDireccion(direccion)
  const tipo = tipoDeCelda(c)
  const formula = c?.f ? String(c.f) : null
  return {
    celda: direccion,
    fila: d?.fila ?? null,
    columna: d?.columna ?? null,
    letra: d?.letra ?? null,
    tipo,
    valor: tipo === CELDA.ERROR || tipo === CELDA.VACIA ? null : c.v,
    texto: c?.w != null ? String(c.w) : (tipo === CELDA.VACIA ? null : String(c.v)),
    formula,
    inputs: formula ? refsDeFormula(formula) : [],
  }
}

/** Por qué un buffer no se puede abrir como planilla OOXML. `null` si sí se puede. PURA. */
export function porQueNoAbre(bytes, nombre = '') {
  const n = String(nombre ?? '').toLowerCase()
  if (!bytes || !bytes.length) return 'el archivo llegó vacío (0 bytes): no hay nada que abrir'
  const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  if (b.subarray(0, 8).equals(OLE2)) {
    return 'es un archivo OLE2 de Office 97-2003 (.xls), no un OOXML: este lector abre .xlsx/.xlsm y ' +
      'para el formato viejo haría falta un lector de BIFF que todavía no existe'
  }
  if (/\.csv$/.test(n)) return 'un .csv no tiene hojas ni fórmulas: no se puede citar «hoja + celda» sobre él, hace falta otro lector'
  if (/\.ods$/.test(n)) return 'es un OpenDocument (.ods) y este lector abre OOXML: no se adivina la equivalencia'
  if (!pareceZip(b)) {
    return `no empieza con la firma «PK» de un ZIP ni con la de OLE2: los primeros bytes son ${[...b.subarray(0, 4)].map((x) => x.toString(16).padStart(2, '0')).join(' ')}`
  }
  return null
}

/**
 * LA PLANILLA ENTERA, HOJA POR HOJA Y CELDA POR CELDA. No lanza.
 *
 * TODAS las hojas, no la primera: cuál es la que vale es una decisión de negocio y no puede tomarla
 * el lector. Las celdas vacías NO entran al resultado —un hueco es ausencia, no un 0— y por eso
 * `valorDe` devuelve `undefined` para lo que no está.
 */
export function leerPlanilla(bytes, { nombre = '', maxCeldasPorHoja = 200000 } = {}) {
  const porQue = porQueNoAbre(bytes, nombre)
  if (porQue) return { ok: false, archivo: nombre, porQue }
  let XLSX
  try {
    // `createRequire` en vez de `await import` para que la función siga siendo síncrona: todo lo que
    // la consume es puro y se prueba sin `await`.
    XLSX = require('xlsx')
  } catch (e) {
    return { ok: false, archivo: nombre, porQue: `no se pudo cargar el lector de planillas: ${String(e?.message ?? e).slice(0, 120)}` }
  }
  let wb
  try {
    wb = XLSX.read(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), { type: 'buffer', cellFormula: true, cellDates: true, cellNF: false, cellHTML: false })
  } catch (e) {
    return { ok: false, archivo: nombre, porQue: `el lector abrió el ZIP pero no pudo interpretarlo como planilla: ${String(e?.message ?? e).slice(0, 160)}` }
  }
  const hojas = []
  for (const [indice, hoja] of (wb.SheetNames ?? []).entries()) {
    const ws = wb.Sheets[hoja]
    if (!ws) { hojas.push({ nombre: hoja, indice, rango: null, celdas: [], porQue: 'la hoja está declarada en el libro pero su parte no está en el archivo' }); continue }
    const celdas = []
    let truncada = false
    for (const dir of Object.keys(ws)) {
      if (dir.startsWith('!')) continue
      if (celdas.length >= maxCeldasPorHoja) { truncada = true; break }
      const c = normalizarCelda(dir, ws[dir])
      if (c.tipo === CELDA.VACIA && !c.formula) continue
      celdas.push(c)
    }
    celdas.sort((a, b) => (a.fila - b.fila) || (a.columna - b.columna))
    hojas.push({ nombre: hoja, indice, rango: ws['!ref'] ?? null, celdas, truncada, porQue: null })
  }
  return {
    ok: true,
    archivo: nombre,
    hojas,
    resumen: `${hojas.length} hoja(s): ${hojas.map((h) => `«${h.nombre}» ${h.celdas.length} celda(s) con contenido, ${h.celdas.filter((c) => c.formula).length} con fórmula`).join(' · ')}`,
  }
}

/** Las celdas de una fila, indexadas por letra de columna. PURA. */
export function filaDe(hoja, fila) {
  const m = new Map()
  for (const c of hoja?.celdas ?? []) if (c.fila === fila) m.set(c.letra, c)
  return m
}

/** Los números de fila que tienen al menos una celda con contenido, en orden. PURA. */
export function filasDe(hoja) {
  return [...new Set((hoja?.celdas ?? []).map((c) => c.fila))].sort((a, b) => a - b)
}

/** El valor de una celda, o `undefined` si NO ESTÁ. Nunca 0: NULL≠0 y el que llama tiene que poder
 *  distinguir «vacía» de «cero escrito». PURA. */
export function valorDe(hoja, direccion) {
  const c = (hoja?.celdas ?? []).find((x) => x.celda === direccion)
  return c ? c.valor ?? undefined : undefined
}

/** Una hoja por nombre exacto, sin adivinar. PURA. */
export const hojaDe = (planilla, nombre) => (planilla?.hojas ?? []).find((h) => h.nombre === nombre) ?? null

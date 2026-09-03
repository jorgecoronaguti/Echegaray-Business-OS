// LA MISMA PROPIEDAD POR CELDA, PARA `updateCells` — el escritor que se saltaba todo.
//
// ═══ POR QUÉ VIVE APARTE (03/09) ═══
//
// `updateCells` no manda un rango A1 con una matriz de strings: manda `rows[].values[].CellData` con
// una máscara `fields`, y su ancla puede venir como `start` (una esquina) o como `range` (un
// rectángulo). Traducir eso a la grilla que la huella entiende —y volver a armar los requests
// recortados sin perder ni el formato ni la máscara— es un vocabulario propio, y mezclarlo con el de
// `values` haría de `propiedad-celda.mjs` un archivo que nadie puede leer entero.
//
// LO QUE COMPARTE, Y ES TODO LO QUE DECIDE: `clasificarGrilla`, `bloquesEscribibles` y
// `decidirVentana`. Acá no se vuelve a decidir nada; se traduce a la ida y a la vuelta.
//
// ═══ EL RECORTE CONVIERTE `range` EN `start`, Y ESO ES DEL LADO SEGURO ═══
//
// Un `updateCells` con `range` y menos filas de las que el rango cubre LIMPIA el sobrante (según la
// máscara). Al recortar se emiten bloques con `start`, que escribe exactamente lo que manda y no
// limpia nada más. O sea: recortar sólo puede escribir MENOS, nunca más — la misma propiedad que
// tiene el recorte de `values`. Un pedido sin ninguna celda respetada sale TAL CUAL entró, con su
// `range` original: el camino feliz no cambia en nada.

import { a1De, bloquesEscribibles, citarTab, decidirVentana, detallarRespetadas, todoEscribible } from './propiedad-celda.mjs'

/** El texto comparable de un `ExtendedValue` de la API — lo mismo que devolvería una lectura FORMULA. */
export function textoDeValor(uev) {
  if (!uev || typeof uev !== 'object') return ''
  if (uev.formulaValue !== undefined) return String(uev.formulaValue)
  if (uev.stringValue !== undefined) return String(uev.stringValue)
  if (uev.numberValue !== undefined) return uev.numberValue
  if (uev.boolValue !== undefined) return uev.boolValue ? 'TRUE' : 'FALSE'
  return ''
}

/** ¿La máscara `fields` de este updateCells escribe VALOR? Si no, no hay propiedad de contenido que decidir. */
export function tocaValor(fields) {
  const f = String(fields ?? '')
  if (!f || f === '*') return true
  return /userEnteredValue/.test(f)
}

/**
 * La grilla de texto y la de CellData de un `updateCells`, con su ancla. Pura.
 * Devuelve null si no se puede ubicar (sin sheetId, sin ancla, sin filas).
 */
export function grillaDeUpdateCells(req) {
  const uc = req?.updateCells
  if (!uc) return null
  const anc = uc.start ?? (uc.range ? { sheetId: uc.range.sheetId, rowIndex: uc.range.startRowIndex, columnIndex: uc.range.startColumnIndex } : null)
  if (!anc || anc.sheetId === undefined || !Number.isInteger(anc.rowIndex) || !Number.isInteger(anc.columnIndex)) return null
  const rows = uc.rows
  if (!Array.isArray(rows) || !rows.length) return null
  const celdas = rows.map((r) => (r?.values ?? []))
  const texto = celdas.map((f) => f.map((c) => textoDeValor(c?.userEnteredValue)))
  const ancho = texto.reduce((mx, f) => Math.max(mx, f.length), 0)
  if (!ancho) return null
  return { sheetId: anc.sheetId, fila0: anc.rowIndex + 1, col0: anc.columnIndex, celdas, texto, alto: texto.length, ancho }
}

/** Arma los requests recortados: un `updateCells` con `start` por bloque escribible. Puro. */
export function recortarUpdateCells(req, g, escribible) {
  const fields = req.updateCells.fields
  return bloquesEscribibles(escribible, g.celdas).map((b) => ({
    updateCells: {
      start: { sheetId: g.sheetId, rowIndex: g.fila0 - 1 + b.i0, columnIndex: g.col0 + b.desde },
      rows: g.celdas.slice(b.i0, b.iFin + 1).map((f) => ({ values: (f || []).slice(b.desde, b.hasta + 1) })),
      fields,
    },
  }))
}

/**
 * Aplica la propiedad por celda a los `updateCells` de un lote. Impura (lee el destino y la base).
 *
 * Los requests que no son `updateCells`, los que no escriben valor y los de pestañas no protegibles
 * salen intactos: acá sólo se decide sobre CONTENIDO de celdas de pestañas del dueño.
 *
 * @param {Map<number,string>} id2tab sheetId → nombre de pestaña (de getSheetMeta)
 * @returns {Promise<{requests:any[], respetadas:Array, descartados:Array, sellar:()=>Promise<void>}>}
 */
export async function filtrarUpdateCells(cliente, fileId, requests = [], id2tab = new Map(), { esProtegible = (t) => Boolean(t) && !String(t).startsWith('_') } = {}) {
  const salida = []; const respetadas = []; const sellos = []; const descartados = []
  for (const req of requests) {
    const g = req?.updateCells ? grillaDeUpdateCells(req) : null
    const tab = g ? id2tab.get(g.sheetId) : null
    if (!g || !tocaValor(req.updateCells.fields) || !esProtegible(tab)) { salida.push(req); continue }
    const ventana = { tab, fila0: g.fila0, col0: g.col0, alto: g.alto, ancho: g.ancho }
    const r = await decidirVentana(cliente, fileId, ventana, g.texto)
    if (r.estado === 'sin-leer') {
      descartados.push({ tab, motivo: `NO ESCRITO: updateCells sobre ${tab}!${a1De(g.fila0, g.col0)} — lectura fallida del destino (${r.porQueNoLei}), fail-closed` })
      continue
    }
    // La decisión ya se tomó sobre la grilla de TEXTO (que es la que la huella entiende); el recorte
    // se aplica sobre los CellData originales, así el formato y la máscara viajan intactos.
    const escribible = r.escribible
    respetadas.push(...detallarRespetadas(ventana, r.respetadas))
    if (r.sellar) sellos.push(r.sellar)
    if (todoEscribible(escribible)) { salida.push(req); continue }
    salida.push(...recortarUpdateCells(req, g, escribible))
  }
  return { requests: salida, respetadas, descartados, sellar: async () => { for (const s of sellos) await s() }, citarTab }
}

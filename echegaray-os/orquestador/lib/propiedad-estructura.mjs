// LA ESTRUCTURA TAMBIÉN ES UNA EDICIÓN DEL DUEÑO — borrar, mover e insertar filas o columnas.
//
// ═══ POR QUÉ (03/09) ═══
//
// El dueño precisó qué quiere decir "respetar mis ediciones": *"todo lo que escribo, borro, modifico,
// agrego, saco, edito de diseño, cambio de lugar, copio y pego"*. La propiedad por celda cubre el
// CONTENIDO; un `deleteDimension` no escribe una sola celda y se lleva quince filas enteras. Hasta hoy
// la única defensa era el candado de la pestaña —o todo o nada—, que es justo lo que él no quiere.
//
// ═══ LA REGLA ═══
//
// Un request que BORRA o MUEVE un tramo pasa sólo si TODAS las celdas de ese tramo son mías por
// huella o están vacías. Una sola celda del dueño adentro frena el request entero: no se puede borrar
// "media fila". Si el mapa de huellas no alinea, no se puede afirmar nada → también frena, con el
// mismo criterio que el resto del módulo (lo que no se puede probar mío, se respeta).
//
// `insertDimension` es la excepción, y no por indulgencia: las celdas que INSERTA nacen vacías, así
// que el conjunto "celdas afectadas" está vacío por construcción y la regla se cumple sola. Lo que un
// insert hace es CORRER lo de abajo, y de eso ya se ocupa la huella: `mejorDesplazamiento` prueba los
// corrimientos en bloque y vuelve a encontrar cada celda en su lugar nuevo.

import { letraCol } from './preservar-anotaciones.mjs'
import { claveCelda, formaComparable, formaDe, hayContenido } from './huella-forma.mjs'
import { leerHuellas, mejorDesplazamiento } from './huella-celda.mjs'
import { citarTab } from './propiedad-celda.mjs'

/** Los tipos que mueven o borran tramos. `insertDimension` no está: ver el encabezado. */
export const TIPOS_ESTRUCTURA = ['deleteDimension', 'deleteRange', 'moveDimension']

/**
 * Qué tramo toca un request de estructura, como ventana leíble. Puro.
 * @returns {{tipo:string, sheetId:number, rangos:{a1:(tab:string)=>string, fila0:number, col0:number}[]}|null}
 */
export function tramosDe(req) {
  if (!req || typeof req !== 'object') return null
  const porDimension = (r) => {
    if (!r || r.sheetId === undefined || !Number.isInteger(r.startIndex) || !Number.isInteger(r.endIndex)) return null
    return r.dimension === 'COLUMNS'
      ? { a1: (t) => `${citarTab(t)}!${letraCol(r.startIndex)}:${letraCol(r.endIndex - 1)}`, fila0: 1, col0: r.startIndex }
      : { a1: (t) => `${citarTab(t)}!${r.startIndex + 1}:${r.endIndex}`, fila0: r.startIndex + 1, col0: 0 }
  }
  if (req.deleteDimension) {
    const t = porDimension(req.deleteDimension.range)
    return t ? { tipo: 'deleteDimension', sheetId: req.deleteDimension.range.sheetId, rangos: [t] } : null
  }
  if (req.moveDimension) {
    // El ORIGEN es lo que se levanta de su lugar; el destino recibe el desplazamiento. Se juzgan los
    // dos: mover un bloque mío sobre filas del dueño le corre el trabajo igual que borrárselo.
    const s = req.moveDimension.source
    const t = porDimension(s)
    if (!t) return null
    const largo = s.endIndex - s.startIndex
    const d = Number.isInteger(req.moveDimension.destinationIndex) ? req.moveDimension.destinationIndex : null
    const destino = d === null ? null : porDimension({ ...s, startIndex: Math.min(d, s.startIndex), endIndex: Math.max(d + largo, s.endIndex) })
    return { tipo: 'moveDimension', sheetId: s.sheetId, rangos: destino ? [destino] : [t] }
  }
  if (req.deleteRange) {
    const r = req.deleteRange.range
    if (!r || r.sheetId === undefined) return null
    const f0 = (r.startRowIndex ?? 0) + 1
    const c0 = r.startColumnIndex ?? 0
    if (!Number.isInteger(r.endRowIndex) || !Number.isInteger(r.endColumnIndex)) return null
    return {
      tipo: 'deleteRange',
      sheetId: r.sheetId,
      rangos: [{ a1: (t) => `${citarTab(t)}!${letraCol(c0)}${f0}:${letraCol(r.endColumnIndex - 1)}${r.endRowIndex}`, fila0: f0, col0: c0 }],
    }
  }
  return null
}

/**
 * NÚCLEO PURO: las celdas del tramo que NO se pueden probar mías. Vacía = ninguna, o sea pasa.
 *
 * Se exige huella ACTIVA (no borrada, no abandonada) en la coordenada Y forma coincidente, que es la
 * misma doble evidencia que pide `aplicarHuella` para reclamar una celda. Sin alineación no se
 * reclama nada: todas las celdas con contenido salen como ajenas.
 */
export function ajenasDelTramo(actual = [], huellas = new Map(), { fila0 = 1, col0 = 0 } = {}) {
  const alineacion = mejorDesplazamiento(actual, huellas, { fila0, col0 })
  const ajenas = []
  actual.forEach((f, i) => (f || []).forEach((v, j) => {
    if (!hayContenido(v)) return
    const fila = fila0 + i - (alineacion.alineada ? alineacion.off : 0)
    const h = huellas.get(claveCelda(fila, col0 + j))
    const mia = alineacion.alineada && h && !h.borrada && !h.abandonada
      && formaComparable(formaDe(v)) === formaComparable(h.forma)
    if (!mia) ajenas.push({ celda: `${letraCol(col0 + j)}${fila0 + i}`, valor: String(v).slice(0, 60) })
  }))
  return { ajenas, alineacion }
}

/**
 * Filtra los requests de estructura que se llevarían algo del dueño. Impura (lee el Sheet y la base).
 *
 * FAIL-CLOSED en las dos formas de la duda: si no se puede releer el tramo, o si la base no responde,
 * el request se frena. Borrar quince filas no se puede deshacer con una corrida más.
 */
export async function filtrarEstructura(cliente, fileId, requests = [], id2tab = new Map(), { esProtegible = (t) => Boolean(t) && !String(t).startsWith('_') } = {}) {
  const salida = []; const frenados = []; const respetadas = []
  for (const req of requests) {
    const t = tramosDe(req)
    const tab = t ? id2tab.get(t.sheetId) : null
    if (!t || !esProtegible(tab)) { salida.push(req); continue }
    let ajenas = null; let motivo = null
    for (const r of t.rangos) {
      const rango = r.a1(tab)
      let actual
      try { actual = await cliente.readSheetValues(fileId, rango, { render: 'FORMULA' }) } catch { actual = undefined }
      if (actual === undefined) { motivo = `no pude releer ${rango} para saber qué se llevaría (fail-closed)`; ajenas = []; break }
      const alto = actual.length
      const ancho = actual.reduce((mx, f) => Math.max(mx, (f || []).length), 0)
      if (!alto || !ancho) continue // tramo vacío: no hay nada que llevarse
      let huellas
      try { huellas = await leerHuellas(fileId, tab, { fila0: r.fila0, col0: r.col0, alto, ancho }) } catch { huellas = undefined }
      if (huellas === undefined) { motivo = 'sin base no puedo saber qué celdas de ese tramo son mías (fail-closed)'; ajenas = []; break }
      const v = ajenasDelTramo(actual, huellas, { fila0: r.fila0, col0: r.col0 })
      if (v.ajenas.length) {
        ajenas = v.ajenas
        motivo = `hay ${v.ajenas.length} celda(s) tuya(s) en el tramo (${v.ajenas.slice(0, 5).map((a) => a.celda).join(', ')})`
        break
      }
    }
    if (motivo === null) { salida.push(req); continue }
    frenados.push({ tipo: t.tipo, tab, motivo })
    for (const a of (ajenas ?? []).slice(0, 50)) {
      respetadas.push({ pestana: tab, celda: a.celda, valorDueno: a.valor, valorOs: null, causa: `${t.tipo} frenado: no borro un tramo con celdas tuyas` })
    }
    console.log(`  🔒 "${tab}": no aplico el ${t.tipo} — ${motivo}.`)
  }
  return { requests: salida, frenados, respetadas }
}

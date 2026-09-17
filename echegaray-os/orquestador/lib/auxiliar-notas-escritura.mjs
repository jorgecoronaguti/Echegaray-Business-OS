// ESCRIBIR «QUÉ HACER» EN LA AUXILIAR `_PROVEEDORES_OS` — con la fila confirmada justo antes y releída después.
//
// Dos escritores la usan y por eso vive una vez:
//
//   · EL PIPELINE, después de rescatar (auditoría 17/09/2026, R1). `proveedores-cuenta-corriente` (paso 143)
//     escribe la auxiliar desde la base ANTES de `proveedores-dos-cuadros` (paso 157). Lo que el rescate de
//     dos-cuadros acaba de guardar en la base no está en la auxiliar, y la fórmula que se repone en la D
//     mostraría la nota VIEJA hasta la corrida siguiente: el dueño ve desaparecer lo que escribió.
//   · EL WORKER, para VACIAR una nota (R3). La guarda no-borrar de `batchUpdateValues` no deja escribir ''
//     sobre una celda con contenido, así que borrar desde la app siempre terminaba rechazado — y el aviso
//     de conflicto le decía al dueño que la borrara desde la app.
//
// ═══ POR QUÉ `updateCells` CON `espejo` Y NO `vaciarPropio` ═══
//
// `vaciarPropio` es el barrido de RESIDUO de un generador: decide por huella y con tope qué celdas son
// suyas. Una nota del dueño no es residuo y no tiene huella. La auxiliar es del OS —la escribe entera su
// dueño declarado, `proveedores-cuenta-corriente`, con `updateCells` y `espejo`—, así que se escribe con el
// mismo mecanismo y la protección se pone acá, celda por celda: relectura de la A antes (la fila sigue
// siendo del proveedor) y relectura de la C después. El freno de mano sigue mandando: `spreadsheetBatchUpdate`
// lo respeta y no se levanta.

import { claveProv } from './proveedor-notas.mjs'
import { AUX } from './proveedores-notas-columna.mjs'
import { COL_NOTA_AUX } from './proveedores-auxiliar.mjs'

export const RANGO_AUX = `'${AUX}'!A1:C600`
const T = (v) => String(v ?? '').trim()

/** Las filas (base 1) de cada clave en la auxiliar leída. Todas las grafías: el VLOOKUP lee la primera. */
export function filasPorClave(aux = []) {
  const m = new Map()
  aux.forEach((f, i) => {
    if (i === 0) return
    const k = claveProv(f?.[0])
    if (k) m.set(k, [...(m.get(k) ?? []), i + 1])
  })
  return m
}

/** La primera fila vacía (A y C) después del encabezado, sin repetir las ya usadas. */
function filaLibre(aux, usadas) {
  for (let i = 1; i < aux.length; i++) if (!T(aux[i]?.[0]) && !T(aux[i]?.[2]) && !usadas.has(i + 1)) return i + 1
  let n = Math.max(aux.length, 1) + 1
  while (usadas.has(n)) n++
  return n
}

/**
 * EL PLAN, sin efectos: qué celda de la auxiliar recibe qué texto ('' = vaciar).
 * @param {{aux:any[][], guardar:Array<{clave,nota,proveedor}>, borrar:string[]}} o
 * @returns {Array<{fila:number, clave:string, proveedor:string|null, nota:string, agrega:boolean}>}
 */
export function planDeAuxiliar({ aux = [], guardar = [], borrar = [] }) {
  const porClave = filasPorClave(aux)
  const plan = []
  const usadas = new Set()
  for (const g of guardar) {
    const filas = porClave.get(g.clave)
    if (filas?.length) { for (const fila of filas) plan.push({ fila, clave: g.clave, proveedor: null, nota: g.nota, agrega: false }); continue }
    const fila = filaLibre(aux, usadas)
    usadas.add(fila)
    plan.push({ fila, clave: g.clave, proveedor: g.proveedor ?? g.clave, nota: g.nota, agrega: true })
  }
  for (const clave of borrar) for (const fila of porClave.get(clave) ?? []) plan.push({ fila, clave, proveedor: null, nota: '', agrega: false })
  return plan
}

/** Relee la A (y la C si se agrega) de cada fila del plan. Devuelve el motivo si alguna se movió. */
export async function filaMovida({ google, fileId, plan }) {
  for (const p of plan) {
    const v = await google.readSheetValues(fileId, `'${AUX}'!A${p.fila}:C${p.fila}`, { render: 'FORMATTED_VALUE' })
    const fila = v?.[0] ?? []
    if (p.agrega) { if (fila.some((x) => T(x))) return `la fila ${p.fila} de ${AUX} ya no está vacía`; continue }
    if (claveProv(fila[0]) !== p.clave) return `la fila ${p.fila} de ${AUX} ahora es de «${T(fila[0]) || '(vacía)'}»`
  }
  return null
}

/** Los requests `updateCells` del plan: texto o `null` (vaciar), y el nombre en la A si se agrega. */
export function requestsDeAuxiliar(sheetId, plan) {
  const celda = (fila, col, texto) => ({
    updateCells: {
      range: { sheetId, startRowIndex: fila - 1, endRowIndex: fila, startColumnIndex: col - 1, endColumnIndex: col },
      rows: [{ values: [{ userEnteredValue: texto ? { stringValue: texto } : null }] }],
      fields: 'userEnteredValue',
    },
  })
  return plan.flatMap((p) => [...(p.agrega ? [celda(p.fila, 1, p.proveedor)] : []), celda(p.fila, COL_NOTA_AUX, p.nota)])
}

/**
 * CONFIRMAR LA FILA → ESCRIBIR → RELEER. Devuelve `{estado}`: 'escrito' | 'movida' | 'congelado' | 'protegido' |
 * 'no_aterrizo', con el detalle. No tira: quien llama decide si eso frena (pipeline) o difiere (worker).
 */
export async function escribirEnLaAuxiliar({ google, fileId, plan }) {
  if (!plan.length) return { estado: 'escrito', detalle: 'nada que escribir' }
  const movida = await filaMovida({ google, fileId, plan })
  if (movida) return { estado: 'movida', detalle: movida }
  const hoja = (await google.getSheetMeta(fileId)).find((s) => s.title === AUX)
  if (!hoja) return { estado: 'protegido', detalle: `no encontré ${AUX}` }
  const r = await google.spreadsheetBatchUpdate(fileId, requestsDeAuxiliar(hoja.sheetId, plan), { espejo: true })
  if (r?.congelado) return { estado: 'congelado', detalle: 'el freno de mano de Sheets está puesto' }
  if (r?.protegido) return { estado: 'protegido', detalle: r.motivo ?? 'candado' }
  for (const p of plan) {
    const v = await google.readSheetValues(fileId, `'${AUX}'!C${p.fila}`, { render: 'FORMATTED_VALUE' })
    if (T(v?.[0]?.[0]) !== p.nota) return { estado: 'no_aterrizo', detalle: `${AUX}!C${p.fila} dice «${T(v?.[0]?.[0])}» y se escribió «${p.nota}»` }
  }
  return { estado: 'escrito', detalle: plan.map((p) => `C${p.fila}=«${p.nota}»`).join(' ') }
}

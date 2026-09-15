// LAS FÓRMULAS QUE SE ESCRIBEN ADENTRO DE COMPRAS, LLEVADAS A LA FILA DE RÓTULOS VIVA — y el portón.
//
// ═══ POR QUÉ (14/09/2026, inserción de «Obra» en Compras L) ═══
//
// Las ARRAYFORMULA que el OS ancla en Compras (`Rubro de caja`, `Fecha de caja`, `Saldo pendiente`,
// `Tramo de vencimiento`) citan columnas de su MISMA pestaña sin nombrarla: `$E$4:$E`, `$O$4:$O`. Su
// texto vive en reglas que además se evalúan en JavaScript y en SQL (`rubro-caja.mjs`, las tres caras),
// así que no se pueden volver funciones sin romper las otras dos. Se declaran en el layout de
// REFERENCIA (`encabezados-referencia.mjs`, el del 25/08) y se TRADUCEN antes de escribir: cada letra
// se convierte en su rótulo —con ocurrencia, por los dos «Rubro de caja»— y el rótulo se busca en la
// fila viva. Un rótulo que no está es un error con su nombre; no hay letra de respaldo.
//
// ═══ EL PORTÓN ═══
//
// Cada escritor declara QUÉ columna escribe, por clave de `COMPRAS`. Pedir otra, o que la resolución
// caiga en una columna del dueño que ese escritor no tiene declarada como propia, aborta antes de
// armar un solo request. Con letras, «AL» después de la inserción es «Rubro de caja»… de nadie.

import { COMPRAS, ubicarColumna } from './columnas-por-encabezado.mjs'
import { COLUMNAS_DEL_DUENO } from './comprobantes/contrato-columnas.mjs'
import { COMPRAS_2508 } from './encabezados-referencia.mjs'
import { letra, normalizarRotulo } from './compras-columnas.mjs'

const indiceDe = (l) => [...String(l).toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/** El rótulo y su ocurrencia de la columna `i` de un encabezado. */
function pedidoDe(encabezado, i) {
  const clave = normalizarRotulo(encabezado[i])
  if (!clave) throw new Error(`layout de referencia: la columna ${letra(i)} no tiene rótulo — no se puede traducir`)
  const ocurrencia = encabezado.slice(0, i + 1).filter((r) => normalizarRotulo(r) === clave).length
  const total = encabezado.filter((r) => normalizarRotulo(r) === clave).length
  return total > 1 ? { rotulo: encabezado[i], ocurrencia } : encabezado[i]
}

/**
 * Traduce las referencias ABSOLUTAS de una fórmula (`$O$4:$O`, `$Q$4`) del layout de referencia al vivo.
 * No toca lo que está entre comillas. Una referencia relativa (`O4`) no se traduce y se rechaza: en una
 * fórmula que se ancla una vez no hay por qué tenerla.
 * @param {string} formula
 * @param {{vivo:any[], referencia?:any[], pestana?:string}} o
 */
export function traducirAlLayoutVivo(formula, { vivo, referencia = COMPRAS_2508, pestana = 'Compras' }) {
  if (!Array.isArray(vivo) || !vivo.length) throw new Error(`${pestana}: falta la fila de rótulos viva para traducir la fórmula`)
  const cache = new Map()
  const destino = (l) => {
    if (!cache.has(l)) cache.set(l, ubicarColumna(vivo, pedidoDe(referencia, indiceDe(l)), pestana).letra)
    return cache.get(l)
  }
  // `$O$4` y la punta abierta `:$O`: las dos son la misma columna y se traducen las dos. Quedarse con
  // la primera dejaba `$P$4:$O` — un rango de dos columnas que suma la de al lado.
  const ABSOLUTA = /\$([A-Z]{1,3})(?:\$(\d+))?(?![A-Za-z0-9_(])/g
  const partes = String(formula).split(/("[^"]*")/)
  return partes.map((p, i) => {
    if (i % 2) return p
    if (/(?<![A-Za-z0-9_$])[A-Z]{1,3}\d+(?![A-Za-z0-9_(])/.test(p.replace(ABSOLUTA, ''))) {
      throw new Error(`${pestana}: la fórmula tiene una referencia relativa y no la puedo llevar al layout vivo: ${p.slice(0, 80)}`)
    }
    return p.replace(ABSOLUTA, (m, l, n) => `$${destino(l)}${n ? `$${n}` : ''}`)
  }).join('')
}

/**
 * Las filas leídas del layout vivo, reordenadas al de referencia POR RÓTULO. Es para las libs que
 * todavía indexan una fila por posición (`deuda-por-tramos.COL`): reciben la fila como la conocen y
 * la columna nueva, que no existe en la referencia, queda afuera.
 */
export function filasAlLayoutDeReferencia(filas = [], vivo, referencia = COMPRAS_2508) {
  const mapa = referencia.map((r, i) => (normalizarRotulo(r) ? ubicarColumna(vivo, pedidoDe(referencia, i), 'Compras').indice : -1))
  return filas.map((f) => mapa.map((j) => (j < 0 ? undefined : f?.[j])))
}

/**
 * QUÉ ESCRIBE CADA ESCRITOR DE COMPRAS. `propias` son las claves de `COMPRAS` que el escritor ancla;
 * las que además son del dueño (la regla «AC/AD/AE/AF/AJ nunca se tocan» del cargador) sólo las puede
 * escribir el generador que ancla su ARRAYFORMULA desde el 25/07 y el 07/09.
 */
export const ESCRITORES = Object.freeze({
  'rubro-caja-sheet': Object.freeze(['rubro', 'fechaCaja']),
  'estructura-pestana': Object.freeze(['subRubro']),
  'compras-saldo-pendiente': Object.freeze(['saldo']),
  'proveedores-aging-columna': Object.freeze(['tramo']),
  'proveedores-cuenta-corriente': Object.freeze(['cuit']),
})

const esDelDueno = (vivo, i) => COLUMNAS_DEL_DUENO.some((p) => ubicarColumna(vivo, p, 'Compras')?.indice === i)

/**
 * La columna que un escritor va a escribir, resuelta contra la fila viva y pasada por el portón.
 * @returns {{letra:string, indice:number, rotulo:string}}
 */
export function columnaParaEscribir(vivo, escritor, clave) {
  const propias = ESCRITORES[escritor]
  if (!propias) throw new Error(`portón de Compras: «${escritor}» no está declarado como escritor`)
  if (!propias.includes(clave)) throw new Error(`portón de Compras: «${escritor}» no escribe «${clave}» — declara ${propias.join(', ')}`)
  const pedido = COMPRAS[clave]
  const col = ubicarColumna(vivo, pedido, 'Compras')
  if (!col) throw new Error(`portón de Compras: falta «${pedido.rotulo ?? pedido}» en la fila de rótulos`)
  return { ...col, rotulo: pedido.rotulo ?? pedido }
}

/**
 * El último control antes de mandar requests: toda columna que tocan tiene que ser una de las que el
 * escritor resolvió. Una columna del dueño fuera de esa lista aborta con su nombre.
 * @param {object[]} requests de la Sheets API (`updateCells`, `repeatCell`, `updateDimensionProperties`)
 */
export function portonDeRequests(vivo, escritor, requests = []) {
  const permitidas = new Set((ESCRITORES[escritor] ?? []).map((k) => columnaParaEscribir(vivo, escritor, k).indice))
  const mal = []
  for (const q of requests) {
    const r = q.updateCells?.range ?? q.repeatCell?.range ?? q.updateDimensionProperties?.range
    if (!r) continue
    const [a, b] = q.updateDimensionProperties ? [r.startIndex, r.endIndex] : [r.startColumnIndex, r.endColumnIndex]
    for (let i = a; i < b; i++) {
      if (permitidas.has(i)) continue
      mal.push(`${letra(i)}${esDelDueno(vivo, i) ? ` («${vivo[i]}», del dueño)` : ` («${vivo[i] ?? ''}»)`}`)
    }
  }
  if (mal.length) throw new Error(`portón de Compras: «${escritor}» iba a escribir ${mal.join(', ')} — no escribo nada`)
  return requests
}

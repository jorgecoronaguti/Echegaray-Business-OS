// DÓNDE SE MIRA PARA SABER SI UNA ESCRITURA ATERRIZÓ.
//
// La guarda de aterrizaje (google.mjs, 05/08) hace lo correcto —releer el destino en vez de creerle
// a la respuesta de la API— pero releía EL RANGO QUE SE MANDÓ, y ese rango casi nunca es el rango
// que se escribió.
//
// ═══ EL FALSO POSITIVO MEDIDO (13/08/2026) ═══
//
// `escribirPreservando` manda el ancla, no el bloque: un solo lote con `range` = '_J_OBREROS!A201'
// y `values` = 200 filas × 34 columnas. La API expande el ancla y escribe
// A201:AH400. La guarda, en cambio, leía `_J_OBREROS!A201` — UNA celda — y buscaba ahí adentro el
// testigo, que es el primer texto plano de todo el bloque. En la corrida del pipeline ese testigo
// era "UOCRA", que vive en B202; A201 está vacía. Resultado: "⚠ LA ESCRITURA NO ATERRIZÓ en
// _J_OBREROS!A201" con el bloque perfectamente escrito (verificado leyendo el Sheet real: las filas
// 201 a 206 del espejo son idénticas a las de 'Obreros 26').
//
// El daño de un falso positivo acá no es el susto: es que la guarda existe para un caso real —una
// pestaña que descarta la escritura y contesta que sí— y una alarma que grita sin motivo se termina
// ignorando. Es la misma lección que ya se pagó el 05/08 con los números localizados.
//
// LA CORRECCIÓN: no se relee "el rango", se relee LA CELDA EXACTA donde tiene que haber quedado el
// testigo. Se calcula desde el ancla del rango más el desplazamiento del testigo dentro de la
// matriz. Es una sola celda: más barato que antes y sin ambigüedad. Si el rango no permite calcular
// el ancla (una referencia rara, un rango con nombre), se cae al comportamiento viejo —leer el
// rango entero—, que es correcto justamente cuando el rango sí cubre la matriz.

import { colLetra } from './sheet-formulas.mjs'

/**
 * ¿Sirve esta celda de testigo? Sólo un TEXTO plano hace el viaje de ida y vuelta sin
 * transformarse: un número vuelve localizado ("67.981,02"), una fecha vuelve como fecha y una
 * fórmula vuelve como su resultado. Con cualquiera de esos, la guarda gritaría en falso.
 */
export function sirveDeTestigo(c) {
  return typeof c === 'string' && c.trim() !== '' && c[0] !== '=' && !/^[\d.,/\-$\s%]+$/.test(c)
}

/**
 * NÚCLEO PURO: el primer texto plano de la matriz, CON SU POSICIÓN.
 * La posición es lo que faltaba: sin ella no se puede saber qué celda hay que releer.
 * @returns {{texto:string, fila:number, col:number}|null} desplazamiento 0-based, o null si no hay
 */
export function elegirTestigo(values = []) {
  for (let f = 0; f < values.length; f++) {
    const fila = values[f] || []
    for (let c = 0; c < fila.length; c++) {
      if (sirveDeTestigo(fila[c])) return { texto: fila[c], fila: f, col: c }
    }
  }
  return null
}

/**
 * NÚCLEO PURO: la esquina superior izquierda de un rango A1, separada de su pestaña.
 * "'Cheques Emitidos'!B7:D9" → { hoja: "'Cheques Emitidos'", fila0: 6, col0: 1 }
 * Devuelve null cuando no hay una celda de arranque que calcular (rangos de columnas enteras,
 * rangos con nombre, la pestaña sola): ahí no se adivina.
 */
export function anclaDelRango(range) {
  const s = String(range ?? '')
  const corte = s.lastIndexOf('!')
  if (corte < 0) return null
  const inicio = s.slice(corte + 1).split(':')[0].replace(/\$/g, '')
  const m = /^([A-Za-z]+)(\d+)$/.exec(inicio)
  if (!m) return null
  let col = 0
  for (const ch of m[1].toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { hoja: s.slice(0, corte), fila0: Number(m[2]) - 1, col0: col - 1 }
}

/**
 * NÚCLEO PURO: qué celda hay que releer para saber si este lote aterrizó, y qué tiene que decir.
 *
 * @param {string} range  el rango tal como se mandó (ancla o rango completo)
 * @param {any[][]} values la matriz que se mandó
 * @returns {{celda:string, texto:string, exacta:boolean}|null}
 *   null = el lote no tiene ningún testigo confiable: NO se verifica y no se miente diciendo que sí.
 *   `exacta:false` = no se pudo calcular el ancla y se relee el rango entero (comportamiento viejo).
 */
export function testigoDeLote(range, values) {
  const t = elegirTestigo(values)
  if (!t) return null
  const a = anclaDelRango(range)
  if (!a) return { celda: String(range), texto: t.texto, exacta: false }
  return { celda: `${a.hoja}!${colLetra(a.col0 + t.col)}${a.fila0 + t.fila + 1}`, texto: t.texto, exacta: true }
}

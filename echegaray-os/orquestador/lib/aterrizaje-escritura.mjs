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
  if (typeof c !== 'string' || c.trim() === '' || c[0] === '=') return false
  // ═══ EL APÓSTROFO DE ADELANTE ES UNA ORDEN PARA SHEETS, NO CONTENIDO (19/08/2026) ═══
  //
  // MEDIDO EN VIVO. `_F931_RAW` escribe los períodos como `'2026-01` —el apóstrofo obliga a Sheets a
  // tratarlos como TEXTO y no como fecha—, y Sheets devuelve `2026-01`, sin él. La comparación de
  // ida y vuelta daba distinto y el aviso decía **"LA ESCRITURA NO ATERRIZÓ en 7 rangos… NO des por
  // buena esta corrida"** sobre una réplica que estaba perfecta: las siete declaraciones, julio
  // incluido, escritas donde correspondía.
  //
  // Un control que grita en falso es peor que no tenerlo: la corrida siguiente ya nadie la mira. Es
  // la misma lección del auditor de ventana fija y del cruce de cobranzas contra una lista de ocho
  // echeqs, las dos ya pagadas en este repositorio.
  //
  // LA REGLA NO SE AFLOJA, SE APLICA AL CONTENIDO. Se juzga el texto SIN el apóstrofo, porque eso es
  // lo que va a volver del archivo. `'2026-01` queda descartado como testigo por la misma razón de
  // siempre —sólo dígitos y separadores no hace el viaje sin transformarse— y `'Total` sigue
  // sirviendo, que es texto de verdad.
  const contenido = c[0] === "'" ? c.slice(1) : c
  return contenido.trim() !== '' && !/^[\d.,/\-$\s%]+$/.test(contenido)
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
 * NÚCLEO PURO: HASTA `max` TESTIGOS REPARTIDOS POR TODA LA MATRIZ, con su posición.
 *
 * ═══ POR QUÉ NO ALCANZA CON UNO (14/08/2026) ═══
 *
 * `elegirTestigo` devuelve el PRIMERO. Para un lote de 106 filas x 16 columnas eso significa que se
 * verifica UNA celda —casi siempre A1 del bloque, el título— y las otras 1.695 se dan por buenas.
 *
 * Medido en "Proveedores": el bloque se escribe entero cada dos horas, la firma se sella, la guarda
 * de aterrizaje dice que sí, y en la pestaña conviven filas de la corrida nueva con filas de una de
 * hace diez días —rótulos que el generador dejó de producir el 04/08 y columnas de prosa que ya no
 * existen—. El título aterrizaba; el resto, no siempre. La guarda no podía verlo: miraba la celda que
 * sí llegaba. Un control que sólo mira donde nunca falla no controla nada.
 *
 * Los testigos se reparten por la matriz a paso regular en vez de tomar los primeros N: un lote que
 * aterriza la cabecera y descarta el cuerpo es exactamente el caso que hay que atrapar, y los
 * primeros N caen todos en la cabecera.
 *
 * @param {any[][]} values
 * @param {number} [max]
 * @returns {{texto:string, fila:number, col:number}[]}
 */
export function elegirTestigos(values = [], max = 8) {
  const todos = []
  for (let f = 0; f < values.length; f++) {
    const fila = values[f] || []
    for (let c = 0; c < fila.length; c++) if (sirveDeTestigo(fila[c])) { todos.push({ texto: fila[c], fila: f, col: c }); break }
  }
  if (todos.length <= max) return todos
  // Repartidos: primero, último y los intermedios a paso regular.
  const paso = (todos.length - 1) / (max - 1)
  const out = []
  for (let i = 0; i < max; i++) out.push(todos[Math.round(i * paso)])
  return [...new Map(out.map((t) => [`${t.fila}:${t.col}`, t])).values()]
}

/**
 * Los testigos de un lote, ya resueltos a celdas A1 de la pestaña.
 *
 * @returns {{celdas:{celda:string, texto:string, fila:number, col:number}[], rango:string|null}}
 *   `rango` es el rectángulo que los cubre a todos: se relee UNA vez y se comparan todos contra él,
 *   que sale más barato que una lectura por testigo y no gasta cuota extra del pipeline.
 */
export function testigosDeLote(range, values, { max = 8 } = {}) {
  const ts = elegirTestigos(values, max)
  const a = anclaDelRango(range)
  if (!ts.length || !a) return { celdas: [], rango: null }
  const celdas = ts.map((t) => ({
    celda: `${a.hoja}!${colLetra(a.col0 + t.col)}${a.fila0 + t.fila + 1}`,
    texto: t.texto, fila: a.fila0 + t.fila + 1, col: a.col0 + t.col,
  }))
  const f0 = Math.min(...celdas.map((c) => c.fila)); const f1 = Math.max(...celdas.map((c) => c.fila))
  const c0 = Math.min(...celdas.map((c) => c.col)); const c1 = Math.max(...celdas.map((c) => c.col))
  // Un solo testigo se relee como CELDA, no como rango de una celda: `B7` y `B7:B7` designan lo mismo
  // pero no son el mismo string, y el rango que se pide es lo que se compara contra el destino.
  const rango = (f0 === f1 && c0 === c1)
    ? `${a.hoja}!${colLetra(c0)}${f0}`
    : `${a.hoja}!${colLetra(c0)}${f0}:${colLetra(c1)}${f1}`
  return { celdas, rango, f0, c0 }
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

// EL RESIDUO QUE MIGRA — LA CUARTA EVIDENCIA DE PROPIEDAD, Y POR QUÉ LAS TRES ANTERIORES NO ALCANZAN.
//
// ═══ ANTES CREÍAMOS ═══
//
// «Una celda sin huella y con contenido nunca fue mía: no se pisa, jamás.» Es la regla que evitó seis
// pérdidas de trabajo del dueño y no está en discusión. Sobre ella se abrieron tres puertas, todas con
// evidencia positiva: la huella propia sobre celda vacía (no repongo), la huella propia sobre celda con
// MI forma (limpio lo mío), y el residuo de rediseño en una fila probada mía (`reescritos`, 14/08).
//
// ═══ EVIDENCIA NUEVA (14/08, medida en «Jornales por Quincena» sobre el archivo vivo) ═══
//
// Ese mismo día se repararon A MANO tres focos de residuo —`F33`/`F34`, `E88:E91`, `F91`— y el residuo
// **volvió a aparecer en otras coordenadas**: `G79` con "Banco" adentro de la fila de Diciembre del
// cuadro de Dirección (donde va plata), `G80` con "Básico convenio" en la fila de total, `G81:G84` con
// los cuatro básicos del convenio al costado de los títulos del cuadro 4, y `B140:B151` con una columna
// entera de seriales de fecha derramando debajo de la fila de total del registro.
//
// No son celdas distintas: es LA MISMA basura cambiando de domicilio. El cuadro que abre la pestaña
// pasó de 15 filas de persona a 3 de nómina —se acortó 13 filas— y todo lo que estaba debajo se corrió.
// En cada coordenada nueva quedó lo que el layout anterior tenía ahí.
//
// Y el generador la conserva por construcción, en un ciclo que no se cierra nunca:
//
//   el generador manda VACIO en esa celda (relleno de ancho, o cola de la pestaña)  ← ORDENA limpiarla
//   no hay huella suya en esa coordenada (nunca escribió ahí; y `guardarHuellas` barre las viejas)
//   → `!mia && ocupada` → `ajenas` → devuelve '' → `fusionar` preserva → no se sella huella
//   → la corrida siguiente repite el veredicto. Para siempre, y en una coordenada nueva cada rediseño.
//
// Las tres puertas existentes lo dejan pasar, cada una por una razón escrita:
//
//   · `formasDeTextoPropio` exige marca tipográfica o 23 caracteres → "Banco" (5) y "Básico convenio"
//     (15) quedan afuera, y descarta las fórmulas a propósito ("el dueño copia fórmulas");
//   · `textosPropiosDeLaGrilla` + `filaProbadaMia` sólo corre donde el generador escribe CONTENIDO
//     (`c !== VACIO`) → no llega a una celda que él declara vacía;
//   · la vía declarada (`jornales-residuo.mjs`) necesita que una persona nombre las celdas — y las
//     coordenadas cambian en cada rediseño, que es exactamente el problema.
//
// ═══ CAMBIO DE CRITERIO ═══
//
// «Los residuos numéricos y las fórmulas van por la vía declarada» pasa a valer sólo para las celdas
// que el generador NO declara suyas. Donde el generador **ordena limpiar SU propia celda** y lo que hay
// ahí es **una copia de algo que él mismo escribe hoy en esta misma grilla**, la celda es suya.
//
// LO QUE SE COMPARA, Y CÓMO. Fórmulas y textos por `formaComparable` —dos fórmulas que sólo difieren en
// el número de fila son la misma fórmula corrida de lugar, que es justo lo que un rediseño produce—;
// los números por su VALOR exacto y nunca por forma, porque `formaDe` enmascara todo número como `<n>`
// y con eso 46.081 y 46.249 serían "la misma cosa": ahí se borra una fecha del dueño. Es el mismo
// `igual()` que ya decide en `jornales-residuo.mjs`, y hay una sola definición.
//
// ═══ LOS TRES FRENOS, PORQUE ESTO BORRA DE VERDAD ═══
//
//   1. EL GENERADOR TIENE QUE ORDENAR LA LIMPIEZA (`VACIO`). Una celda al costado de su rectángulo
//      llega con `''` y no entra acá: se preserva como siempre.
//   2. LA RACHA. Un cuadro que se mudó deja un BLOQUE —una columna de doce meses, un encabezado con sus
//      cuatro valores—; una persona que copia una fórmula copia una. Por debajo de `MIN_RACHA_RESIDUO`
//      celdas contiguas en la misma columna, no se limpia nada. Éste es el freno que separa "un cuadro
//      se movió" de "el dueño escribió algo que se parece a lo mío".
//   3. EL TOPE, MEDIDO EN BLOQUES Y NO EN CELDAS. Un rediseño deja pocos bloques grandes; un veredicto
//      desbocado deja muchos chicos y dispersos. Contar celdas castigaría al bloque de doce filas
//      contiguas, que es la evidencia MÁS fuerte que hay acá. Por encima de `TOPE_RACHAS` no se limpia
//      NI UNA y se dice fuerte: ante duda entre conservar y borrar, este repo conserva.

import { formaDe, formaComparable } from './huella-forma.mjs'

/** Cuántas celdas contiguas de una columna hacen falta para que sea un cuadro que se mudó. */
export const MIN_RACHA_RESIDUO = 3
/** Cuántos bloques distintos se aceptan en una corrida antes de no decidir nada. */
export const TOPE_RACHAS = 6
/** Cuántas letras hace falta que tenga un texto para que su forma pruebe algo. */
export const MIN_LETRAS = 3

const LETRAS = /[a-záéíóúüñ]/gi

/** El texto crudo de una celda, sin el apóstrofo que Google agrega por su cuenta. */
const crudo = (v) => String(v ?? '').replace(/^'/, '').trim()

/**
 * ¿La celda es un número PURO? Una fórmula no lo es aunque rinda uno: acá se lee el contenido, que es
 * lo que devuelve la lectura FORMULA. Mismo criterio que `jornales-residuo.mjs`.
 */
export function esNumero(v) {
  const t = crudo(v)
  if (t === '' || t.startsWith('=')) return false
  return Number.isFinite(Number(t.replace(/\./g, '').replace(',', '.')))
}

const aNumero = (v) => Number(crudo(v).replace(/\./g, '').replace(',', '.'))

/**
 * LA CLAVE CON LA QUE UNA CELDA SE BUSCA EN EL ÍNDICE — o `null` si no puede probar nada.
 *
 * Un número viaja por su VALOR (`n:46081`) y todo lo demás por su forma (`f:=iferror(index(...`). Un
 * texto con menos de tres letras no entra: "—", "$" o "12 a" son marcas que aparecen en cualquier
 * cuadro y su coincidencia no significaría nada.
 */
export function claveDeCosa(v) {
  const t = crudo(v)
  if (!t) return null
  if (esNumero(t)) return `n:${aNumero(t)}`
  const f = formaComparable(formaDe(t))
  if (!f) return null
  if (!f.startsWith('=') && (f.match(LETRAS) || []).length < MIN_LETRAS) return null
  return `f:${f}`
}

/**
 * LO QUE EL GENERADOR ESCRIBE HOY, EN CUALQUIER PARTE DE SU GRILLA — el conjunto contra el que se
 * prueba que una celda es una copia.
 *
 * Los centinelas no entran: `VACIO` es una orden de limpiar y no contenido. Se filtran por
 * `claveDeCosa`, que los ve vacíos vía `formaDe`.
 */
export function cosasDeLaGrilla(generado = []) {
  const out = new Set()
  for (const f of generado || []) {
    for (const c of f || []) {
      const k = claveDeCosa(c)
      if (k) out.add(k)
    }
  }
  return out
}

/**
 * NÚCLEO PURO: las celdas candidatas, agrupadas por columna y en el orden en que caen.
 *
 * Candidata = el generador ORDENA limpiarla (`esOrdenDeLimpiar`), hoy tiene algo, y ese algo es una
 * copia de una cosa que el generador escribe en esta misma grilla. La contigüidad se resuelve después.
 */
function candidatasPorColumna(generado, actual, cosas, esOrdenDeLimpiar, exento) {
  const porCol = new Map()
  generado.forEach((fila, i) => (fila || []).forEach((c, j) => {
    if (!esOrdenDeLimpiar(c)) return
    if (exento && exento(i, j)) return
    const hoy = (actual[i] || [])[j]
    const k = claveDeCosa(hoy)
    if (!k || !cosas.has(k)) return
    if (!porCol.has(j)) porCol.set(j, [])
    porCol.get(j).push({ i, j, suyo: crudo(hoy).slice(0, 60) })
  }))
  return porCol
}

/** Las corridas de filas contiguas de una columna que llegan al mínimo. Devuelve las celdas, en bloques. */
function rachasDe(celdas = [], minimo = MIN_RACHA_RESIDUO) {
  const bloques = []
  let actual = []
  for (const c of celdas) {
    if (actual.length && c.i !== actual[actual.length - 1].i + 1) {
      if (actual.length >= minimo) bloques.push(actual)
      actual = []
    }
    actual.push(c)
  }
  if (actual.length >= minimo) bloques.push(actual)
  return bloques
}

/**
 * NÚCLEO PURO Y LA RESPUESTA COMPLETA: qué celdas son residuo migrante de un layout anterior.
 *
 * No mira la huella y no la necesita: las tres evidencias que usa —la orden de limpieza, la copia viva
 * y la racha— salen enteras del par (generado, actual). Por eso vale también cuando el mapa de
 * posición no alinea, que es justamente el estado en el que queda una pestaña recién rediseñada y el
 * momento en que el residuo nace.
 *
 * @param {any[][]} generado lo que el generador quiere escribir (con centinelas)
 * @param {any[][]} actual   el MISMO rectángulo leído con render FORMULA
 * @param {{esOrdenDeLimpiar:(c:any)=>boolean, fila0?:number, col0?:number,
 *          exento?:(i:number,j:number)=>boolean}} opts
 * @returns {{celdas:Array<{i,j,fila,col,suyo}>, claves:Set<string>, bloques:number, frenado:boolean,
 *            motivo:string}}
 */
export function residuosMigrantes(generado = [], actual = [], opts = {}) {
  const { esOrdenDeLimpiar, fila0 = 1, col0 = 0, exento = null } = opts
  const vacio = (motivo) => ({ celdas: [], claves: new Set(), bloques: 0, frenado: false, motivo })
  if (typeof esOrdenDeLimpiar !== 'function') return vacio('sin criterio de orden de limpieza: no decido')
  const cosas = cosasDeLaGrilla(generado)
  if (!cosas.size) return vacio('el generador no escribe nada comparable en esta grilla')

  const porCol = candidatasPorColumna(generado, actual, cosas, esOrdenDeLimpiar, exento)
  const bloques = []
  for (const celdas of porCol.values()) bloques.push(...rachasDe(celdas))
  if (!bloques.length) return vacio('ninguna copia mía forma un bloque: no hay residuo probado')

  // FRENO 3. Se mide en BLOQUES: un rediseño mueve unos pocos cuadros, y contar celdas dejaría afuera
  // justo al bloque grande —doce meses contiguos— que es la evidencia más fuerte de todas.
  if (bloques.length > TOPE_RACHAS) {
    return {
      ...vacio(`${bloques.length} bloques de residuo en una corrida (el tope es ${TOPE_RACHAS}): `
        + 'eso no parece un cuadro que se movió. No limpio ninguno.'),
      bloques: bloques.length,
      frenado: true,
    }
  }
  const celdas = bloques.flat().map((c) => ({ ...c, fila: fila0 + c.i, col: col0 + c.j }))
  return {
    celdas,
    claves: new Set(celdas.map((c) => `${c.i}:${c.j}`)),
    bloques: bloques.length,
    frenado: false,
    motivo: `${celdas.length} celda(s) en ${bloques.length} bloque(s): copias mías de un layout anterior`,
  }
}

// LAS HUELLAS POR CELDA SE CORREN CON LA COLUMNA — el núcleo puro de `huellas-correr-columna.mjs`.
//
// ═══ POR QUÉ (14/09/2026) ═══
//
// `sheet_huella_celda` guarda la posición (`fila`, `col`) de cada celda que escribió el OS. Es la
// prueba de propiedad: «tiene huella y hoy está vacía» se lee como «la vació el dueño y no se vuelve a
// escribir». Al insertar «Obra» en Compras L y Cobranzas H, cada celda a la derecha pasa a vivir una
// columna más allá y su huella se queda en la de antes. La corrida siguiente vería 22.398 celdas «de
// otro» con contenido y un hueco con huella en cada columna — la firma exacta de un borrado masivo.
//
// Y la huella también cambia de FORMA: una fórmula que citaba `$O$4:$O` ahora cita `$P$4:$P`, y
// `formaDe` enmascara números pero no letras. Por eso no alcanza con mover la posición: la huella se
// recalcula con la fórmula RELEÍDA del Sheet después de insertar, no con una copia transformada acá.
//
// `sheet_huella_formato` guarda rangos A1 y anchos por índice de columna: se corren con la misma regla.

import { formaDe, LARGO_FORMA } from './huella-forma.mjs'
import { huellaDe } from './huella-celda.mjs'

/** Desde qué índice 0-based se corre cada pestaña. Las dos grafías de Cobranzas conviven en la base. */
export const DESDE_COLUMNA = Object.freeze({ Compras: 11, Cobranzas: 7, COBRANZAS: 7 })

const letraDe = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }
const indiceDe = (l) => [...String(l).toUpperCase()].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1

/**
 * El plan de las huellas por celda: qué filas se corren y con qué huella nueva.
 *
 * @param {Array<{pestana:string, fila:number, col:number, forma:string, huella:string, valor:string|null}>} filas
 * @param {(pestana:string, fila:number, col:number)=>any} [releida] la celda en su posición NUEVA, ya
 *   insertada la columna. Sin ella (el --dry) se conserva la huella y se cuenta cuáles cambiarían.
 */
export function planDeCeldas(filas = [], releida = null) {
  const mover = []
  const quedan = []
  let sinContenido = 0
  let citanColumnas = 0
  for (const h of filas) {
    const desde = DESDE_COLUMNA[h.pestana]
    if (desde === undefined || h.col < desde) { quedan.push(h); continue }
    const col = h.col + 1
    if (String(h.valor ?? '').startsWith('=')) citanColumnas++
    let nueva = { forma: h.forma, huella: h.huella, valor: h.valor }
    if (releida) {
      const v = releida(h.pestana, h.fila, col)
      // UNA CELDA VACÍA AL RELEER NO FABRICA UNA HUELLA: se conserva la de antes, corrida de lugar. Si
      // el dueño la había vaciado, el generador lo tiene que seguir viendo así.
      if (formaDe(v) === '') sinContenido++
      else nueva = { forma: formaDe(v).slice(0, LARGO_FORMA), huella: huellaDe(v) ?? '', valor: String(v).slice(0, LARGO_FORMA) }
    }
    mover.push({ pestana: h.pestana, fila: h.fila, colAntes: h.col, col, ...nueva, cambio: nueva.huella !== h.huella })
  }
  return { mover, quedan: quedan.length, sinContenido, citanColumnas }
}

/** `AD4:AD3000` → `AE4:AE3000` si la columna está a la derecha de la inserción. `COLUMNS:28-30` → `29-31`. */
export function correrRangoFormato(rango, desde) {
  const col = /^COLUMNS:(\d+)-(\d+)$/.exec(rango)
  if (col) {
    const [a, b] = [Number(col[1]), Number(col[2])]
    return `COLUMNS:${a >= desde ? a + 1 : a}-${b > desde ? b + 1 : b}`
  }
  if (rango === '*') return rango
  return rango.replace(/([A-Z]{1,3})(\d*)/g, (m, l, n) => {
    const i = indiceDe(l)
    return `${i >= desde ? letraDe(i + 1) : l}${n}`
  })
}

/** La primera columna de un rango de formato, para ordenar. */
const primeraColumna = (rango) => {
  const c = /^COLUMNS:(\d+)/.exec(rango)
  return c ? Number(c[1]) : indiceDe(/^([A-Z]{1,3})/.exec(rango)?.[1] ?? 'A')
}

/**
 * El plan de las huellas de formato: sólo las que cambian de rango, DE DERECHA A IZQUIERDA.
 *
 * EL ORDEN ES LA CLAVE PRIMARIA. Medido en la base el 14/09: `BA5:BA200` pasa a `BB5:BB200`, que ya
 * existe y pasa a `BC5:BC200`; `COLUMNS:52-53` pasa a `53-54`, que también existe. Aplicadas de
 * izquierda a derecha, la segunda actualización choca con la fila que todavía no se movió y la
 * transacción entera cae. Moviendo primero la de más a la derecha, cada destino ya está libre.
 */
export function planDeFormato(filas = []) {
  return filas.flatMap((h) => {
    const desde = DESDE_COLUMNA[h.pestana]
    if (desde === undefined) return []
    const nuevo = correrRangoFormato(h.rango_a1, desde)
    return nuevo === h.rango_a1 ? [] : [{ ...h, rangoNuevo: nuevo }]
  }).sort((a, b) => primeraColumna(b.rango_a1) - primeraColumna(a.rango_a1))
}

/**
 * ¿La base quedó como el plan dice? Compara las filas releídas después de aplicar contra el plan.
 * @returns {string[]} las diferencias; vacío si cerró
 */
export function verificarAplicado(plan, releidas = []) {
  const clave = (p, f, c) => `${p}|${f}|${c}`
  const hay = new Map(releidas.map((r) => [clave(r.pestana, r.fila, r.col), r]))
  const mal = []
  for (const m of plan.mover) {
    const r = hay.get(clave(m.pestana, m.fila, m.col))
    if (!r) mal.push(`falta ${m.pestana} f${m.fila} c${m.col}`)
    else if (r.huella !== m.huella) mal.push(`huella distinta en ${m.pestana} f${m.fila} c${m.col}`)
  }
  return mal
}

// LOS DOS VALORES DE `Compras` QUE PASAN A TENER DUEÑO: el semáforo de `Z` y el cero de `U`.
//
// `Compras` es donde el dueño tipea todos los días, así que escribir un VALOR ahí no se parece en
// nada a reponer un formato: cada celda es plata del negocio. Todo lo que decide qué se escribe vive
// acá, en núcleo puro y con tests; los scripts de `scripts/` sólo son la puerta al archivo, releen y
// comparan. Es la misma partición que ya usa `compras-saldo-pendiente.mjs` con `deuda-por-tramos`.
//
// ═══ 1 · EL SEMÁFORO DE `Z · Estado pago` ═══
//
// Es una fórmula por fila, 1.136 de ellas, que traduce la columna `X · Estado` (el contrato del
// cargador: Pagado / Vencido / Pendiente / Proyectado) a un rótulo con señal. Estaba tipeada a mano
// y con los cuatro glifos en emoji: ver `SEMAFORO` en `glifos.mjs` para por qué eso es un defecto y
// por qué los reemplazos son los que son. Acá vive la FÓRMULA.
//
// LA LÓGICA NO SE TOCA, Y ES DELIBERADO. `Q<TODAY()` decide "vencido" contra la fecha prevista, y
// esa columna tiene filas con el TEXTO "Pendiente" en vez de una fecha — en Sheets un texto es mayor
// que cualquier número, así que esas filas dan "Por vencer" aunque hayan vencido (medido y publicado
// en `cuentas-por-pagar.mjs`: Hormiserv, DUPEC, Alumetal, Const-Sek, Alvarado). Arreglarlo cambia lo
// que el dueño ve en la pestaña y es una decisión suya, no de este paso: acá se cambia el GLIFO.
//
// LO ÚNICO QUE SÍ CAMBIA ADEMÁS DEL GLIFO: 38 de las 1.136 fórmulas tenían `#REF!` donde va `Q<fila>`
// —quedaron así de un corrimiento de columnas viejo—. Hoy no se ve porque ninguna de esas filas está
// "Pendiente" con total cargado; el día que una lo esté, la celda dibuja `#REF!`. Reescribir las
// 1.136 y dejar 38 minas puestas sería negligente, así que se regeneran todas apuntando a su `Q`.

import { SEMAFORO, SEMAFORO_HEREDADO } from './glifos.mjs'

/** Las columnas que intervienen, por letra. Los rótulos son los de la fila 3 del archivo real. */
export const COL = Object.freeze({ total: 'O', prevista: 'Q', estado: 'X', semaforo: 'Z', parcial1: 'U' })

/** El rótulo que tiene que decir la fila 3 de cada columna, o el script no la pisa. */
export const ROTULO = Object.freeze({ semaforo: 'Estado pago', parcial1: 'Monto Parcial 1' })

/** La primera fila de datos: arriba hay título (1), agrupador (2) y encabezado (3). */
export const FILA0 = 4

/**
 * NÚCLEO PURO: la fórmula del semáforo para una fila, con los glifos que el PDF dibuja.
 *
 * Los argumentos van separados por `;` porque el archivo está en locale es_AR, donde la coma es el
 * decimal. Una fórmula escrita por API con comas entra como texto roto (lección "Fórmula por API va
 * en locale").
 *
 * @param {number} fila número de fila 1-based, tal como se escribe en la referencia
 * @returns {string}
 */
export function formulaEstadoPago(fila) {
  return armarFormula(fila, SEMAFORO, `${COL.prevista}${fila}`)
}

/**
 * NÚCLEO PURO: la fórmula TAL COMO ESTÁ PUBLICADA HOY, para poder reconocerla antes de pisarla.
 *
 * Se reconoce por igualdad exacta y no por parecido: el script sólo escribe sobre una celda cuya
 * fórmula actual es una de las formas conocidas. Cualquier otra cosa —una fila que el dueño ajustó a
 * mano, una fórmula que no vimos— frena la corrida entera. Es el lado conservador: una pestaña donde
 * se tipea todos los días no se pisa "por patrón".
 *
 * @param {number} fila
 * @param {{refRota?:boolean}} [opts] `refRota` = la variante con `#REF!` en lugar de la fecha prevista
 */
export function formulaEstadoPagoHeredada(fila, { refRota = false } = {}) {
  return armarFormula(fila, SEMAFORO_HEREDADO, refRota ? '#REF!' : `${COL.prevista}${fila}`)
}

/** La forma, escrita una sola vez: lo único que cambia entre las variantes son los glifos y la ref. */
function armarFormula(fila, g, refPrevista) {
  const o = `${COL.total}${fila}`
  const x = `${COL.estado}${fila}`
  return `=IF(${o}="";"";IF(${x}="Pagado";"${g.pagado} Pagado";IF(${x}="Vencido";"${g.vencido} Vencido";`
    + `IF(${x}="Pendiente";IF(${refPrevista}<TODAY();"${g.vencido} Vencido";"${g.porVencer} Por vencer");`
    + `IF(${x}="Proyectado";"${g.vigente} Vigente";${x})))))`
}

/**
 * NÚCLEO PURO: ¿esta celda de `Z` es una de las formas que el OS sabe reconocer?
 *
 * Las tres: la vigente, la publicada con emoji, y la publicada con emoji y el `#REF!` adentro. Una
 * celda vacía cuenta como conocida —hay filas sin fórmula debajo del bloque— y no se escribe.
 *
 * @param {unknown} texto la fórmula leída con render FORMULA
 * @param {number} fila
 */
export function esSemaforoConocido(texto, fila) {
  const t = String(texto ?? '').trim()
  if (!t) return true
  return t === formulaEstadoPago(fila)
    || t === formulaEstadoPagoHeredada(fila)
    || t === formulaEstadoPagoHeredada(fila, { refRota: true })
}

// ═══ 2 · EL GUION TIPEADO DE `U · Monto Parcial 1` ═══
//
// 243 celdas de esa columna tienen el TEXTO `"$ -"` tipeado, no un número. Las 243 están en filas
// cuyo `S · Total o Parcial` dice "Total": o sea que la factura se pagó entera y no hubo parcial.
//
// ═══ POR QUÉ CERO Y NO VACÍO ═══
//
// Son dos afirmaciones distintas y sólo una es la que hizo el dueño. Vacío significa "nadie cargó
// este dato"; cero significa "se sabe, y es cero". Con `S = "Total"` el dato NO falta: la planilla
// declara positivamente que el pago fue total, así que el parcial es cero y eso es un hecho, no una
// ausencia. Escribir vacío degradaría un dato conocido a un dato faltante.
//
// Y lo confirma el formato que ya tiene la columna: `"$"#,##0.00;("$"#,##0.00);"—"`. Esa tercera
// sección existe para dibujar el cero como un guion — la columna fue diseñada esperando ceros
// numéricos, y el literal tipeado es justamente lo que le impide hacer su trabajo. Con un 0 la celda
// se sigue viendo casi igual (`—` en vez de `$ -`) y pasa a sumar, comparar y contar como número.
//
// EL TERCER MOTIVO ES OPERATIVO Y NO ES MENOR: `no-borrar.mjs` —la única guarda del repo sin bypass—
// revierte celda por celda toda escritura vacía sobre un destino con contenido. Normalizar a vacío
// exigiría un bypass de la guarda que protege al dueño. Una normalización que necesita apagar esa
// guarda es la normalización equivocada.

/** El guion tipeado a mano en una columna de plata, en sus variantes: `-`, `$ -`, `—`, `– `. */
export const GUION_TIPEADO = /^\s*\$?\s*[-—–]\s*$/

/**
 * LAS FILAS QUE NO SE NORMALIZAN NUNCA: las que este libro no sabe representar.
 *
 * 268 y 314 son dos compras a Google en DÓLARES (`M`/`O` dicen el texto "USD 25,20", `N` dice
 * "USD -"). No son basura: son un importe real en otra moneda metido en columnas que sólo saben de
 * pesos. Tocar cualquier celda de esas filas es opinar sobre a cuánto se convierten, y eso es
 * criterio contable con efecto en las sumas — lo firma el dueño, no un script.
 *
 * La 314 no estaba en el pedido: apareció midiendo. Se trata igual que la 268 porque es la misma
 * especie, y el lado para equivocarse es conservar.
 */
export const FILAS_EN_OTRA_MONEDA = Object.freeze([268, 314])

/**
 * NÚCLEO PURO: qué filas de una columna tienen el guion tipeado y se pueden normalizar.
 *
 * @param {Array<Array>} columna lo leído con render FORMULA, desde la fila 1
 * @param {{desde?:number, excluir?:number[]}} [opts]
 * @returns {{normalizar:number[], excluidas:number[]}} números de fila 1-based
 */
export function filasConGuion(columna = [], { desde = FILA0, excluir = FILAS_EN_OTRA_MONEDA } = {}) {
  const fuera = new Set(excluir)
  const normalizar = []
  const excluidas = []
  columna.forEach((f, i) => {
    const fila = i + 1
    if (fila < desde) return
    if (!GUION_TIPEADO.test(String(f?.[0] ?? ''))) return
    if (fuera.has(fila)) excluidas.push(fila)
    else normalizar.push(fila)
  })
  return { normalizar, excluidas }
}

/**
 * NÚCLEO PURO: ¿esta fórmula referencia esa columna de `Compras`?
 *
 * Es el control del que cuelga el borrado de una columna, así que su modo de falla peor no es gritar
 * de más: es no matchear NADA y decir siempre "nadie la lee". Por eso tiene test propio con las dos
 * mitades — lo que tiene que encontrar y lo que no.
 *
 * `propia` = la fórmula vive en la misma pestaña, así que la referencia va sin nombrarla. Desde otra
 * pestaña hace falta el `Compras!` adelante, o `AG4` sería una celda de la pestaña que la escribe.
 *
 * @param {unknown} texto la fórmula, leída con render FORMULA
 * @param {string} col la letra de columna
 * @param {{propia?:boolean}} [opts]
 */
export function referenciaAColumna(texto, col, { propia = false } = {}) {
  const t = String(texto ?? '')
  if (!t.startsWith('=')) return false
  const c = String(col).toUpperCase()
  // `\$?${c}\$?\d` cubre `AG4`, `$AG4`, `AG$4`; `\$${c}\b` cubre el rango abierto `$AG$4:$AG`. La
  // letra tiene que arrancar palabra: sin eso, `PAGO` y `RANGO` contarían como referencias a `AG`.
  const dentro = new RegExp(`\\b\\$?${c}\\$?\\d|\\$${c}\\b`)
  if (propia) return dentro.test(t)
  // Desde otra pestaña: `Compras!AG4`, `'Compras'!$AG$4`, `Compras!$AG:$AG`. El `(?![A-Za-z])` es
  // lo que evita que `AG` matchee dentro de `AGO`; un `\b` no sirve, porque entre `G` y `4` no hay
  // frontera de palabra y se perdía la referencia más común de todas.
  return new RegExp(`Compras'?!\\$?${c}(?![A-Za-z])`).test(t)
}

/**
 * NÚCLEO PURO: agrupa filas sueltas en tramos contiguos, para escribir en pocos rangos y no en 241.
 *
 * @param {number[]} filas ordenadas ascendente
 * @returns {Array<{desde:number, hasta:number}>}
 */
export function tramosContiguos(filas = []) {
  const out = []
  for (const f of filas) {
    const ult = out[out.length - 1]
    if (ult && f === ult.hasta + 1) ult.hasta = f
    else out.push({ desde: f, hasta: f })
  }
  return out
}

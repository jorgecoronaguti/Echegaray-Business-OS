// ¿ENTRA EL TITULAR EN LA COLUMNA QUE TIENE? — se mide, no se mira a ojo.
//
// ═══ EL DEFECTO, MEDIDO SOBRE EL PDF DE LA PESTAÑA REAL (28/08/2026) ═══
//
// "SALE EN EL AÑO" mostraba `$839.552.44(`: el último dígito CORTADO. "ENTRA EN EL AÑO" mostraba
// `$816.416.110incluye $ 319.686.218 todavía a cobrar`, el número pegado a su nota. Los otros dos
// titulares se veían bien, y no porque estuvieran mejor armados: porque sus cifras eran más cortas.
//
// LA CAUSA. `readSheetFormats` sobre `A4:N5` devuelve anchos `[260, 95×12, 110]`. El hero escribía el
// VALOR en la columna del slot (95 px) y la NOTA en la de al lado. `$839.552.440` en Arial bold 12
// mide ~98 px de glifos más el padding de la celda: no entra en 95. Con `wrapStrategy: CLIP` el número
// se corta; con `OVERFLOW_CELL` se derrama sobre la nota — y en ese rango convivían las dos
// estrategias, heredadas de corridas anteriores, así que cada titular se rompía a su manera.
//
// ESTO NO ES COSMÉTICA. La cifra más grande de la pestaña era ilegible, y es justo la que el dueño
// está tratando de entender. La empresa cruzó a importes de nueve cifras este año: el layout se
// diseñó cuando eran más cortos, y con cualquier cifra que siga creciendo vuelve a pasar. Un arreglo
// que dependa de que el número sea corto no es un arreglo, es una postergación.
//
// ═══ POR QUÉ MEDIR Y NO CONFIAR ═══
//
// El repo ya pagó esta lección en Slides: "«$ 84,2 M» a 28 pt entraba según la tabla y en la lámina
// renderizada por Google se partió en dos líneas y se comió la nota de abajo" (slides/layout.mjs). De
// ahí sale `anchoTexto`, que se reusa acá tal cual en vez de escribir una segunda tabla de anchos: su
// tabla es de una humanista y Arial es más angosta, así que la medida sale CONSERVADORA —da un poco
// más de lo que el glifo ocupa de verdad. Para un control de "entra o no entra" ese sesgo es el
// correcto: prefiere avisar de más antes que dejar pasar un número cortado.
//
// NÚCLEO PURO: no toca la red, no lee el Sheet, no sabe de Google.

import { anchoTexto } from './slides/layout.mjs'

/** De PT a PX a 96 dpi. Sheets declara la fuente en pt y las columnas en px. */
export const PT_A_PX = 4 / 3

/**
 * El padding horizontal que Sheets reserva dentro de una celda, en píxeles.
 *
 * Medido contra el caso real: `$839.552.440` mide ~98 px de glifos y se cortó en una columna de 95,
 * así que el texto útil es menos que el ancho declarado. Tres píxeles por lado es lo que muestra el
 * renderer; se descuenta siempre, también cuando el texto desborda sobre las celdas vacías de la
 * derecha —el padding de la primera celda no desaparece porque el texto siga.
 */
export const PADDING_CELDA = 6

/**
 * NÚCLEO PURO: hasta dónde llega cada slot del titular. Una sola definición para dos consumidores.
 *
 * La usa la PIEL para MERGEAR la celda del valor, y el auditor para medir contra esa misma celda. Si
 * las dos la calcularan por su cuenta, el auditor mediría un ancho que el Sheet no tiene — que es
 * exactamente lo que pasó: medía el slot entero confiando en el desborde, y el desborde no existe.
 *
 * @param {number[]} slots columnas donde arranca cada cifra
 * @param {number} cols ancho del footprint
 * @returns {Array<{desde:number, hasta:number}>} `hasta` es exclusivo
 */
export function spansDelHero(slots = [], cols = 0) {
  return slots.map((s, i) => ({ desde: s, hasta: i + 1 < slots.length ? slots[i + 1] : cols }))
}

/**
 * NÚCLEO PURO: los píxeles que tiene un slot del hero antes de chocar con el siguiente.
 *
 * El texto de una celda desborda sobre las celdas VACÍAS de su derecha y se corta contra la primera
 * ocupada. En el hero, la primera ocupada es la columna del slot siguiente: ahí arranca otro rótulo y
 * otro número. Por eso el ancho útil de un slot no es el de su columna, es el del BLOQUE que le toca.
 *
 * @param {number[]} slots columnas donde arranca cada cifra, en orden
 * @param {number} i índice del slot
 * @param {(col:number)=>number} anchoCol píxeles de una columna
 * @param {number} cols ancho del footprint de la pestaña
 */
export function anchoDeSlot(slots, i, anchoCol, cols) {
  const hasta = i + 1 < slots.length ? slots[i + 1] : cols
  let px = 0
  for (let c = slots[i]; c < hasta; c++) px += anchoCol(c)
  return px - PADDING_CELDA
}

/**
 * NÚCLEO PURO: ¿cuántos píxeles ocupa este texto?
 *
 * @param {string} texto
 * @param {{tamano:number, negrita?:boolean}} p tamaño en PT, como lo declara `textFormat.fontSize`
 */
export const anchoEnPx = (texto, { tamano, negrita = false }) =>
  anchoTexto(texto, tamano, { negrita }) * PT_A_PX

/**
 * NÚCLEO PURO: las piezas del titular que NO entran en su slot.
 *
 * Devuelve los desbordes CON SU MAGNITUD en píxeles, no un booleano: "el hero no entra" no le sirve a
 * nadie para decidir si hay que ensanchar la columna, bajar el cuerpo o acortar el texto.
 *
 * @param {object} p
 * @param {number[]} p.slots
 * @param {number} p.cols ancho del footprint
 * @param {(col:number)=>number} p.anchoCol
 * @param {Array<{slot:number, pieza:string, texto:string, tamano:number, negrita?:boolean}>} p.piezas
 *   `slot` es el ÍNDICE del slot (0..3), no su columna.
 * @returns {{ok:boolean, desbordes:Array<object>, medidas:Array<object>}}
 */
export function auditarHero({ slots = [], cols, anchoCol, piezas = [] }) {
  const medidas = piezas.map((p) => {
    const disponible = anchoDeSlot(slots, p.slot, anchoCol, cols)
    const ancho = anchoEnPx(p.texto, { tamano: p.tamano, negrita: p.negrita })
    return {
      slot: p.slot,
      pieza: p.pieza,
      texto: p.texto,
      anchoPx: Math.round(ancho),
      disponiblePx: disponible,
      sobraPx: Math.round(ancho - disponible),
    }
  })
  const desbordes = medidas.filter((m) => m.sobraPx > 0)
  return { ok: desbordes.length === 0, desbordes, medidas }
}

/**
 * ═══ EL DESBORDE NO EXISTE EN EL PDF, Y ESO SE MIDIÓ EN EL RENDER REAL (29/08/2026) ═══
 *
 * Las tres filas del hero se escriben con `wrapStrategy: OVERFLOW_CELL` y las celdas de la derecha
 * quedan vacías, así que el texto DEBERÍA correr sobre ellas. En la pantalla corre. **En el PDF que
 * exporta Google, no**: el dueño miró la pestaña aplicada y tres de los cuatro VALORES salieron
 * cortados en el borde exacto de su columna.
 *
 * Lo que se vio, contra lo que la celda tiene (leído por API):
 *
 *   `($31.332.233)` → se dibujó `($31.332.233`   · 119 px medidos, se cortó en 112
 *   `$125.306.590`  → se dibujó `$125.306.59`    · 116 px medidos, se cortó en 106
 *   `$153.612.775`  → se dibujó `$153.612.77`    · 116 px medidos, se cortó en 106
 *   `$28.306.185`   → COMPLETO                   · 106 px medidos
 *
 * El corte cae entre 112 y 116 px de los de este medidor, que sobre una columna de 95 px reales es el
 * ancho de la columna y nada más: CERO desborde. Por eso el valor ya no se mide contra el slot sino
 * contra SU PROPIA CELDA, y por eso la piel MERGEA esa celda a lo ancho del slot. Un titular que
 * depende de que la celda de al lado siga vacía es un titular que se rompe cuando alguien escribe al
 * lado — y encima ya se rompía sin que nadie escribiera nada.
 *
 * LOS RÓTULOS Y LAS GLOSAS SIGUEN MIDIÉNDOSE CONTRA EL SLOT y no se mergean: son texto de 9 px que
 * entra holgado en su propia columna más el desborde, y el PDF los mostró enteros. Si algún día uno
 * de ellos se corta, se mergea también — pero no se toca lo que se vio funcionando.
 *
 * EL IMPORTE MÁS LARGO QUE EL TITULAR TIENE QUE PODER MOSTRAR.
 *
 * No es un número real de la empresa: es la PRUEBA de que el layout no depende de que la cifra sea
 * corta. Diez dígitos con el paréntesis del negativo —el formato `MONEDA_TOTAL` escribe los negativos
 * entre paréntesis— es el peor caso razonable de una constructora que ya factura nueve cifras. Si el
 * hero deja de entrar con esto, el test se pone rojo ANTES de que el dueño lo vea cortado.
 */
export const IMPORTE_MAS_LARGO = '($1.234.567.890)'

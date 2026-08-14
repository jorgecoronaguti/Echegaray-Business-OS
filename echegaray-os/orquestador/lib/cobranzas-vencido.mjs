// CUÁNDO UNA COBRANZA ESTÁ VENCIDA — UNA SOLA DEFINICIÓN, Y EL RELOJ CORRECTO.
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO VIENE A ARREGLAR (14/08/2026) ═══
//
// La columna `Vencido` de la pestaña OBRAS publicaba "—" en sus 18 celdas. Una auditoría anterior lo
// dio por bueno: *"ninguna de las 44 pendientes tiene fecha anterior a hoy"*. El dato era cierto y la
// conclusión, falsa. El dueño: *"esta contemplando mal la columna de 'vencido' porque si hay
// cobranzas q estan vencidas"*.
//
// LO QUE MEDÍA LA FÓRMULA VIEJA: `Fecha cobro < TODAY()`. La `Fecha cobro` de una fila PENDIENTE no es
// un vencimiento: es la fecha en que se ESPERA cobrar, y se corre hacia adelante. Medido sobre las 44
// filas pendientes del archivo (14/08/2026): 37 la tienen tipeada a mano y 7 la derivan de la fecha
// de venta (`=P45+30`), que también se re-tipea. La fila ID 41 de MESSINA lo muestra entero: emitida
// el **31/12/2024**, su "Fecha de Venta" dice 07/08/2026 y su "Fecha cobro", 06/09/2026.
//
// O sea: la columna preguntaba *"¿ya pasó la fecha en la que dijimos que íbamos a cobrar?"*, y esa
// fecha se vuelve a escribir cada vez que pasa. Estaba condenada a cero por construcción, y encima se
// validaba contra la misma información que produce — la pestaña Cobranzas calcula su propio semáforo
// (`Estado cobro`) con ESA misma celda, así que también decía que no había nada vencido.
//
// ═══ EL RELOJ CORRECTO: LA EMISIÓN, QUE NO SE MUEVE ═══
//
// Una deuda se vence contra la fecha en que NACIÓ más el plazo acordado. Acá esa fecha es la
// `Fecha emisión` (col C de Cobranzas): es la única de las tres que no se re-escribe cuando el cobro
// se posterga —la fila ID 41 la conserva en 31/12/2024— y las 44 pendientes la tienen cargada.
//
// El resultado, contra el archivo vivo del 14/08/2026: **10 filas por $50.594.878** vencidas, sobre
// $357.487.078 pendientes. Con el reloj viejo: $0.
//
// ═══ EL PLAZO SON 30 DÍAS, Y NO ES UN NÚMERO ELEGIDO ═══
//
// Lo declara el propio archivo: 7 de las 44 filas pendientes calculan su fecha de cobro como
// `=P+30`. Y lo confirma el comportamiento real: de las 46 filas ya cobradas, 36 entraron dentro de
// los 30 días de su venta.
//
// LÍMITE CONOCIDO Y DECLARADO: el plazo es UNO para todos los clientes porque en ninguna fuente está
// declarado el plazo por cliente ni por contrato. ARCOR puede tener condiciones distintas de MESSINA
// y este archivo no tiene con qué saberlo. El día que exista una columna de condición de pago, el
// plazo se lee de ahí y esta constante se retira.
//
// ═══ POR QUÉ EL CRITERIO VIVE ACÁ Y NO ADENTRO DE LA GRILLA ═══
//
// Porque "vencido" ya significaba DOS cosas distintas en el mismo libro: acá, y la columna
// `▲ Vencido` de "Calendario de Cobros", que es otra cosa —lo pendiente que cae ANTES de la ventana
// de meses del calendario, para que no desaparezca de la grilla—. Esa columna es correcta en su
// pestaña y no se toca en este trabajo, pero mientras las dos se llamen igual el libro tiene dos
// definiciones del mismo concepto. Dejar la de crédito escrita UNA vez, con su nombre y sus pruebas,
// es el primer paso para poder unificarlas sin adivinar cuál era cuál.

/**
 * EL PLAZO DE COBRO ACORDADO, EN DÍAS DESDE LA EMISIÓN.
 *
 * Es el que el propio Cobranzas usa en sus fórmulas (`=P+30`). No es una política que este código
 * decida: es la que el archivo ya declara, leída y escrita una sola vez.
 */
export const PLAZO_COBRO_DIAS = 30

/**
 * LOS TRAMOS DE ANTIGÜEDAD DE LA CARTERA.
 *
 * Es el corte estándar del *accounts receivable aging*: se agrupa por **cuánto hace que la factura
 * está vencida**, no por cuánto hace que se emitió (Corporate Finance Institute, "Accounts Receivable
 * Aging": *"categorizes the receivables based on the length of time an invoice has been due"*, con
 * los cortes "due within 30 days, past due 31 to 60 days, past due 61 to 90 days"). Sirve para tres
 * decisiones concretas: a quién reclamar primero, a quién cambiarle las condiciones, y qué parte de
 * la cartera ya no es razonable proyectar como caja.
 *
 * `desde` es exclusivo y `hasta` inclusivo, medidos en días DESPUÉS del vencimiento. `hasta: null`
 * es el tramo abierto: nada puede caerse por el borde de arriba.
 */
export const TRAMOS_ANTIGUEDAD = Object.freeze([
  Object.freeze({ clave: '1–30', desde: 0, hasta: 30 }),
  Object.freeze({ clave: '31–60', desde: 30, hasta: 60 }),
  Object.freeze({ clave: '61–90', desde: 60, hasta: 90 }),
  Object.freeze({ clave: '+90', desde: 90, hasta: null }),
])

/**
 * DÍAS DE ATRASO de una cobranza: cuántos días pasaron desde que se venció.
 *
 * @param {number} emision serial de Sheets de la fecha de emisión
 * @param {number} hoy serial de Sheets de hoy
 * @param {number} plazo días acordados desde la emisión
 * @returns {number} positivo si está vencida, ≤0 si todavía no venció
 */
export const diasDeAtraso = (emision, hoy, plazo = PLAZO_COBRO_DIAS) =>
  Number(hoy) - (Number(emision) + Number(plazo))

/**
 * EN QUÉ TRAMO CAE UN ATRASO. `null` cuando todavía no venció.
 *
 * @param {number} dias días de atraso (salida de `diasDeAtraso`)
 * @returns {string|null} la clave del tramo
 */
export function tramoDe(dias) {
  if (!(Number(dias) > 0)) return null
  for (const t of TRAMOS_ANTIGUEDAD) {
    if (dias > t.desde && (t.hasta === null || dias <= t.hasta)) return t.clave
  }
  return TRAMOS_ANTIGUEDAD[TRAMOS_ANTIGUEDAD.length - 1].clave
}

/**
 * LA CARTERA PENDIENTE REPARTIDA EN SUS TRAMOS — el mismo cálculo que la pestaña, pero en JS.
 *
 * EXISTE PARA QUE EL TEST PUEDA CONTAR SIN UN SHEET DELANTE. Un test que compara la fórmula que emito
 * contra la fórmula que espero mira las dos puntas del mismo lado — así se publicó `#ERROR!` en siete
 * obras. Con esto, el test le da filas reales y verifica el REPARTO.
 *
 * UNA FILA SIN FECHA DE EMISIÓN NO CAE EN NINGÚN TRAMO Y SE CUENTA APARTE. No se la manda a "+90"
 * (afirmaría una antigüedad que nadie sabe) ni a "por vencer" (escondería el agujero): sale con
 * nombre para que el escritor pueda abortar. Es el mismo criterio con que la fórmula del Sheet exige
 * `emisión > 0`: una celda de fecha vacía vale 0 y entraría como vencida desde 1899.
 *
 * @param {Array<{emision:number, importe:number}>} filas las cobranzas PENDIENTES ya filtradas
 * @param {number} hoy serial de Sheets de hoy
 * @param {number} plazo días acordados
 * @returns {{porVencer:number, tramos:Record<string,number>, vencido:number, total:number, sinFecha:number}}
 */
export function repartirPorAntiguedad(filas = [], hoy, plazo = PLAZO_COBRO_DIAS) {
  const tramos = Object.fromEntries(TRAMOS_ANTIGUEDAD.map((t) => [t.clave, 0]))
  let porVencer = 0
  let sinFecha = 0
  let total = 0
  for (const f of filas) {
    const importe = Number(f?.importe) || 0
    total += importe
    const emision = Number(f?.emision) || 0
    if (!(emision > 0)) { sinFecha += importe; continue }
    const clave = tramoDe(diasDeAtraso(emision, hoy, plazo))
    if (clave === null) porVencer += importe
    else tramos[clave] += importe
  }
  const vencido = Object.values(tramos).reduce((s, x) => s + x, 0)
  return { porVencer, tramos, vencido, total, sinFecha }
}

// ═══ LOS CRITERIOS PARA LAS FÓRMULAS DEL SHEET ═══
//
// Salen de acá y no del generador de la pestaña por el mismo motivo que el resto del archivo: si el
// criterio de "vencido" se escribe en la grilla y el de los tramos en el bloque de cartera, el día
// que uno cambie el otro queda viejo y el cuadro deja de cerrar contra su propio total.
//
// Los tres devuelven el fragmento LISTO para pegar dentro de un SUMIFS, con el `;` inicial y en
// locale es-AR. `TODAY()` va adentro de la fórmula a propósito: si el corte se tipeara acá, la
// cartera envejecería sólo cuando alguien se acuerde de correr el generador — o sea, nunca el día
// que importa.

/** LO QUE TODAVÍA NO VENCIÓ: emitido hace menos que el plazo. */
export const critPorVencer = (rangoEmision, plazo = PLAZO_COBRO_DIAS) =>
  `;${rangoEmision};">="&(TODAY()-${plazo})`

/**
 * LO VENCIDO: emitido hace MÁS que el plazo y todavía sin cobrar.
 *
 * EL `>0` NO ES DECORATIVO y es la misma trampa que ya se pagó en el calendario: una celda de fecha
 * vacía se compara como 0, y 0 es menor que cualquier corte — la fila entraría como vencida desde
 * 1899 y sumaría su importe a la alarma sin dar un solo error.
 */
export const critVencido = (rangoEmision, plazo = PLAZO_COBRO_DIAS) =>
  `;${rangoEmision};">"&0;${rangoEmision};"<"&(TODAY()-${plazo})`

/**
 * UN TRAMO DE ANTIGÜEDAD. Los bordes son los mismos que `tramoDe`: `desde` exclusivo (el más viejo
 * queda del lado de arriba) y `hasta` inclusivo.
 *
 * @param {string} rangoEmision la referencia ya armada a la columna de fecha de emisión
 * @param {{desde:number, hasta:number|null}} tramo
 */
export function critTramo(rangoEmision, tramo, plazo = PLAZO_COBRO_DIAS) {
  const corte = (dias) => `(TODAY()-${plazo + dias})`
  const arriba = `;${rangoEmision};"<"&${corte(tramo.desde)}`
  // El tramo abierto no lleva piso de fecha, pero SÍ el `>0`: sin él, toda fila sin emisión caería
  // justo en el tramo más viejo, que es el que dispara el reclamo.
  const abajo = tramo.hasta === null ? `;${rangoEmision};">"&0` : `;${rangoEmision};">="&${corte(tramo.hasta)}`
  return `${arriba}${abajo}`
}

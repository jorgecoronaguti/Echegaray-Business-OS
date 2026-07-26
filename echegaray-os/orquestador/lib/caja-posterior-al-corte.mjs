// LA CAJA TIENE QUE MOVERSE CUANDO SE TOCA COBRANZAS.
//
// POR QUÉ EXISTE (21/07). El dueño: "estoy viendo que no se ajustan los saldos en caja a medida que
// toco cobranzas, revisá todo". Medido, tenía razón y era peor de lo que se veía: NINGUNA de las
// cinco cuentas del bloque de disponibilidades era una fórmula. Los tres saldos que importan
// —banco en pesos, banco en dólares, valores en cartera— eran números que el agente calculaba en
// JavaScript desde la réplica del extracto y pegaba en la celda. Se podía cargar un cobro de
// cincuenta millones en Cobranzas y el total de CAJA no se movía un peso.
//
// ═══ POR QUÉ NO ALCANZA CON "QUE LA CAJA SUME COBRANZAS" ═══
//
// Sumar Cobranzas al saldo del banco duplicaría casi todo: el extracto YA trae los cobros que
// entraron hasta su fecha de corte. La conciliación bancaria de toda la vida resuelve esto con una
// sola idea:
//
//     saldo según el extracto (al corte)  +  lo que se movió DESPUÉS del corte  =  saldo de hoy
//
// Así que la línea nueva mira exactamente la ventana que el extracto no cubre: del día después del
// corte en adelante. Nada de lo que ya está en el extracto se cuenta dos veces, y todo lo que se
// carga hoy en Cobranzas aparece en el total de CAJA en el momento.
//
// ═══ LOS DOS LADOS, PORQUE UN SOLO LADO INFLA LA CAJA ═══
//
// Si sólo se suman los cobros, la caja crece y nunca baja. El otro lado tiene un agujero que ya
// estaba y nadie veía: un cheque que se marca DEBITADO=SI sale de la línea "cheques emitidos, no
// debitados" —que resta— y el saldo del banco no lo refleja, porque el extracto quedó en su corte.
// La plata salió de la cuenta y la disponibilidad neta SUBÍA. Por eso la línea es NETA: cobros
// posteriores al corte menos cheques debitados después del corte.
//
// ═══ POR QUÉ SE EXCLUYEN LOS ECHEQ ═══
//
// Un echeq cobrado con fecha de acreditación futura ya está contado en "Valores a depositar
// (cheques de terceros en cartera)". Sumarlo otra vez acá sería contar el mismo cheque dos veces —
// el error que este archivo ya cometió al revés, cuando la cartera decía $30.000.000 y el banco
// $10.000.000 porque dos estaban endosados.

// La columna "Fecha de caja" NO se tipea acá: se importa de rubro-caja.mjs, que es quien la ESCRIBE
// en Compras. Escritor y lector comparten una sola definición, así el efecto Compras→CAJA no se
// rompe en silencio si la columna se mueve (lo verifica caja-posterior-al-corte.test.mjs).
import { COL_FECHA_CAJA } from './rubro-caja.mjs'

/** Las columnas de Cobranzas. Verificadas contra la fila de encabezado del 21/07. */
export const COB = { hoja: 'Cobranzas', total: 'M', forma: 'N', estado: 'O', fecha: 'Q', desde: 5, hasta: 400 }
/** Las columnas de Cheques Emitidos. I es la fecha en que se debita, K el SI/NO. */
export const CHQ = { hoja: 'Cheques Emitidos', importe: 'F', fechaPago: 'I', debitado: 'K', desde: 2, hasta: 400 }
/**
 * Las columnas de Compras. O=Total, P=Tipo pago, X=Estado, AD=Fecha de caja. Verificadas 24/07.
 * `tiposBanco`: los medios que pegan al banco EN EL DÍA y todavía no están cubiertos por otra línea —
 * Cheque ya lo resta "Cheques Emitidos", la Tarjeta de Crédito consume el cupo (no la cuenta), el
 * Efectivo no toca el banco (sale de la caja física). Sólo Transferencia y Débito faltan.
 */
export const CMP = { hoja: 'Compras', total: 'O', tipoPago: 'P', estado: 'X', fecha: COL_FECHA_CAJA, desde: 4, hasta: 1200, tiposBanco: ['Transferencia', 'Débito'] }

const rango = (h, col, d, f) => `'${h}'!$${col}$${d}:$${col}$${f}`

/**
 * NÚCLEO PURO: lo cobrado DESPUÉS de la fecha de corte del extracto.
 *
 * El estado tiene que ser "Cobrado": un proyectado o un pendiente no es plata que esté, y meterlo
 * acá convertiría el saldo de caja en una previsión disfrazada de hecho.
 *
 * @param {string} corte referencia a la celda que tiene la fecha de corte del extracto (ej. '$F$19')
 * @param {object} c columnas de Cobranzas
 * @returns {string} fórmula, separador es-AR
 */
export function formulaCobrosPosteriores(corte, c = COB) {
  return `SUMIFS(${rango(c.hoja, c.total, c.desde, c.hasta)};`
    + `${rango(c.hoja, c.estado, c.desde, c.hasta)};"Cobrado";`
    + `${rango(c.hoja, c.forma, c.desde, c.hasta)};"<>Echeq";`
    + `${rango(c.hoja, c.fecha, c.desde, c.hasta)};">"&${corte})`
}

/**
 * NÚCLEO PURO: los cheques propios que se debitaron DESPUÉS del corte.
 * Ya no están en la línea de compromisos —porque están debitados— y todavía no están en el saldo
 * del banco —porque el extracto es anterior—. Sin esta resta, la plata sale y la caja no baja.
 * @param {string} corte
 * @param {object} c columnas de Cheques Emitidos
 * @returns {string} fórmula
 */
export function formulaChequesDebitadosPosteriores(corte, c = CHQ) {
  return `SUMIFS(${rango(c.hoja, c.importe, c.desde, c.hasta)};`
    + `${rango(c.hoja, c.debitado, c.desde, c.hasta)};"SI";`
    + `${rango(c.hoja, c.fechaPago, c.desde, c.hasta)};">"&${corte})`
}

/**
 * NÚCLEO PURO: las compras PAGADAS por transferencia o débito DESPUÉS del corte.
 *
 * Cuando el dueño marca una compra como Pagada por un medio que sale del banco en el día
 * (transferencia, débito), la plata ya no está pero el extracto —anterior al corte— todavía no lo
 * muestra. Sin esta resta, la disponibilidad de CAJA queda inflada hasta la próxima carga del banco.
 * NO se cuentan Cheque (lo resta "Cheques Emitidos"), Tarjeta de Crédito (consume el cupo, se paga
 * después) ni Efectivo (sale de la caja física, no del banco): incluirlos sería doble conteo.
 * Un SUMIFS por tipo, porque SUMIFS no hace OR.
 *
 * @param {string} corte referencia a la celda con la fecha de corte del extracto
 * @param {object} c columnas de Compras
 * @returns {string} fórmula (sin `=`)
 */
export function formulaComprasPagadasPosteriores(corte, c = CMP) {
  return c.tiposBanco.map((tipo) => `SUMIFS(${rango(c.hoja, c.total, c.desde, c.hasta)};`
    + `${rango(c.hoja, c.estado, c.desde, c.hasta)};"Pagado";`
    + `${rango(c.hoja, c.tipoPago, c.desde, c.hasta)};"${tipo}";`
    + `${rango(c.hoja, c.fecha, c.desde, c.hasta)};">"&${corte})`).join('+')
}

/**
 * NÚCLEO PURO: la línea neta que va en el bloque de disponibilidades y suma al total.
 * Cobros posteriores al corte, menos cheques propios debitados, menos compras pagadas por
 * transferencia/débito — todo en la ventana que el extracto todavía no cubre.
 * @param {string} corte referencia a la celda con la fecha de corte del extracto
 * @returns {string} fórmula completa, con el `=` adelante
 */
export function formulaNetaPosterior(corte) {
  return `=${formulaCobrosPosteriores(corte)}-${formulaChequesDebitadosPosteriores(corte)}`
    + `-(${formulaComprasPagadasPosteriores(corte)})`
}

/**
 * NÚCLEO PURO: el último saldo de la réplica del extracto, sin depender de cuántos movimientos tenga.
 *
 * ME EQUIVOQUÉ CON LOOKUP Y QUEDÓ ESCRITO EN EL ARCHIVO (21/07). La primera versión usaba el
 * modismo clásico `LOOKUP(2;1/(rango<>"");rango)`. Sobre esta réplica devolvió −$1.433.113: un saldo
 * de la mitad del extracto, no el último. LOOKUP resuelve por búsqueda BINARIA y asume que su vector
 * está ordenado; con un rango abierto lleno de #DIV/0! al final, se planta en cualquier lado. El
 * saldo malo llegó al total de CAJA y de ahí a los dos cash flows, sin un solo error a la vista.
 *
 * Esta versión ubica la ÚLTIMA FILA CON DATO por su número de fila y no compara valores, así que no
 * asume ningún orden y un hueco en el medio no la mueve. Es más cara de calcular y no importa: son
 * mil filas una vez.
 *
 * ═══ EL ÚLTIMO SALDO ES EL ÚLTIMO NÚMERO DISTINTO DE CERO (23/07) ═══
 *
 * Se rompió en vivo y dejó la CAJA con liquidez neta FALSA de −$710.857. Los movimientos del día que
 * el extracto todavía no confirma —la compra con tarjeta, el depósito en clearing— se anexan a la
 * réplica SIN saldo corrido: el banco no lo publica hasta el cierre. El importador los escribe con
 * saldo 0. Y `<>""` es verdadero para un 0 —un cero no es una celda vacía—, así que la fórmula tomaba
 * esa última fila y devolvía 0: Santander aparecía en $0 y la caja mentía para abajo.
 *
 * Un saldo BANCARIO de exactamente 0,00 no existe en la práctica, y aunque existiera no es lo que se
 * busca: se busca el último saldo REAL que el banco confirmó. Por eso se exige `ISNUMBER` y `<>0`.
 * Así el arreglo no depende de que el importador escriba vacío en vez de 0 —que también se corrigió,
 * pero en otra capa—: la fórmula sola ya ignora los placeholders del día.
 *
 * @param {string} hoja la pestaña réplica
 * @param {string} col columna del saldo
 * @param {number} desde primera fila de datos
 * @returns {string}
 */
export function formulaUltimoSaldo(hoja = '_BANCO_RAW', col = 'D', desde = 4) {
  const r = `${hoja}!$${col}$${desde}:$${col}`
  return `=INDEX(${r};SUMPRODUCT(MAX(ISNUMBER(${r})*(${r}<>0)*ROW(${r})))-${desde - 1})`
}

/**
 * NÚCLEO PURO: la fecha de corte del extracto, leída de la propia réplica.
 *
 * NO SE ESCRIBE LA FECHA A MANO. Era un literal que salía de una constante de JavaScript: el día que
 * se carga un extracto más nuevo y alguien olvida tocar el código, CAJA declara un corte viejo y la
 * ventana de "movimientos posteriores" empieza a contar de más. La fecha del último movimiento ES el
 * corte, y siempre está en la réplica.
 *
 * @returns {string}
 */
export function formulaFechaCorte(hoja = '_BANCO_RAW', col = 'A', desde = 4) {
  return `=MAX(${hoja}!$${col}$${desde}:$${col})`
}

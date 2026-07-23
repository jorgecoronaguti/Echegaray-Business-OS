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

/** Las columnas de Cobranzas. Verificadas contra la fila de encabezado del 21/07. */
export const COB = { hoja: 'Cobranzas', total: 'M', forma: 'N', estado: 'O', fecha: 'Q', desde: 5, hasta: 400 }
/** Las columnas de Cheques Emitidos. I es la fecha en que se debita, K el SI/NO. */
export const CHQ = { hoja: 'Cheques Emitidos', importe: 'F', fechaPago: 'I', debitado: 'K', desde: 2, hasta: 400 }

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
 * NÚCLEO PURO: la línea neta que va en el bloque de disponibilidades y suma al total.
 * @param {string} corte referencia a la celda con la fecha de corte del extracto
 * @returns {string} fórmula completa, con el `=` adelante
 */
export function formulaNetaPosterior(corte) {
  return `=${formulaCobrosPosteriores(corte)}-${formulaChequesDebitadosPosteriores(corte)}`
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
 * @param {string} hoja la pestaña réplica
 * @param {string} col columna del saldo
 * @param {number} desde primera fila de datos
 * @returns {string}
 */
export function formulaUltimoSaldo(hoja = '_BANCO_RAW', col = 'D', desde = 4) {
  const r = `${hoja}!$${col}$${desde}:$${col}`
  return `=INDEX(${r};SUMPRODUCT(MAX((${r}<>"")*ROW(${r})))-${desde - 1})`
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// DEL SALDO CONFIRMADO AL SALDO DE HOY (23/07)
//
// EL DEFECTO. La disponibilidad del banco salía de `formulaUltimoSaldo`: la última celda NO VACÍA de
// la columna de saldos. Los movimientos del día llegan SIN saldo corrido —el banco todavía los está
// liquidando— así que esa fórmula devuelve el último saldo CONFIRMADO, que es el del día anterior.
// El 23/07 CAJA mostraba $4.982.191,63 y el banco declaraba $4.813.461,54: los $168.730,09 de la
// compra con tarjeta de débito ya habían salido de la cuenta y ninguna celda del archivo lo decía.
// Un dueño que mira $4,98M y tiene $4,81M decide con plata que no existe.
//
// LA SOLUCIÓN NO ES SUMARLE LOS MOVIMIENTOS DEL DÍA A MANO. El mismo 23/07 entró un depósito de
// e-cheq de otras plazas por $3.940.000 que el banco NO acreditó (48 hs de clearing): sumarlo haría
// mentir la caja para arriba, que es peor. Cuál de los dos impactó no se deduce — lo dice el propio
// extracto en su línea final, "Saldo al 23/07/2026 4.813.461,54", que ahora vive en el archivo
// (bloque del saldo declarado de _BANCO_RAW, rangos con nombre).
//
// Y LOS DOS NÚMEROS SE MUESTRAN, no se funden en uno: el CONFIRMADO por el banco y el DEL DÍA EN
// CURSO son cosas distintas, y el puente entre los dos —qué del día ya impactó y qué sigue en
// clearing— es exactamente la información que hace confiable al segundo.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * NÚCLEO PURO: la disponibilidad del banco = el saldo que el banco DECLARA, con el confirmado de
 * respaldo.
 *
 * Si todavía no hay saldo declarado cargado (un extracto sin la línea "Saldo al …"), cae al último
 * confirmado: mejor el saldo de ayer declarado como tal que una celda vacía en el total de CAJA.
 *
 * @param {string} rango nombre del rango con el saldo declarado
 */
export function formulaSaldoDelDia(rango, hoja = '_BANCO_RAW', col = 'D', desde = 4) {
  return `=IF(${rango}="";${formulaUltimoSaldo(hoja, col, desde).slice(1)};${rango})`
}

/** NÚCLEO PURO: la fecha del saldo que se está mostrando. Misma lógica y mismo respaldo. */
export function formulaFechaDelDia(rango, hoja = '_BANCO_RAW', col = 'A', desde = 4) {
  return `=IF(${rango}="";${formulaFechaCorte(hoja, col, desde).slice(1)};${rango})`
}

/**
 * NÚCLEO PURO: la fecha del último saldo que el banco CONFIRMA en el detalle.
 *
 * No es MAX de la columna de fechas: ésa incluye los movimientos del día, que son justamente los que
 * el banco todavía no confirmó. Es el máximo de las fechas de las filas que SÍ traen saldo corrido.
 */
export function formulaFechaConfirmada(hoja = '_BANCO_RAW', colFecha = 'A', colSaldo = 'D', desde = 4) {
  return `=SUMPRODUCT(MAX((${hoja}!$${colSaldo}$${desde}:$${colSaldo}<>"")*${hoja}!$${colFecha}$${desde}:$${colFecha}))`
}

/**
 * NÚCLEO PURO: lo que se movió hoy y el banco todavía lista sin saldo corrido.
 *
 * Son las filas con fecha y SIN saldo. Su suma con signo es todo lo que pasó en el día; cuánto de
 * eso ya impactó lo dice el saldo declarado, no esta fórmula.
 */
export function formulaMovimientosDelDia(hoja = '_BANCO_RAW', colFecha = 'A', colImporte = 'C', colSaldo = 'D', desde = 4) {
  const f = `${hoja}!$${colFecha}$${desde}:$${colFecha}`
  const c = `${hoja}!$${colImporte}$${desde}:$${colImporte}`
  const d = `${hoja}!$${colSaldo}$${desde}:$${colSaldo}`
  return `=SUMPRODUCT((${d}="")*ISNUMBER(${f})*IF(ISNUMBER(${c});${c};0))`
}

/** NÚCLEO PURO: el detalle escrito de esos movimientos, para que el puente no sea sólo un número. */
export function formulaDetalleDelDia(hoja = '_BANCO_RAW', colFecha = 'A', colConcepto = 'B', colImporte = 'C', colSaldo = 'D', desde = 4) {
  const f = `${hoja}!$${colFecha}$${desde}:$${colFecha}`
  const b = `${hoja}!$${colConcepto}$${desde}:$${colConcepto}`
  const c = `${hoja}!$${colImporte}$${desde}:$${colImporte}`
  const d = `${hoja}!$${colSaldo}$${desde}:$${colSaldo}`
  return `=IFERROR("   · "&TEXTJOIN("   ·   ";1;ARRAYFORMULA(IF((${d}="")*ISNUMBER(${f});TEXT(${f};"dd/mm")&"  "&LEFT(${b};44)&"  "&TEXT(${c};"$#,##0");"")));"")`
}

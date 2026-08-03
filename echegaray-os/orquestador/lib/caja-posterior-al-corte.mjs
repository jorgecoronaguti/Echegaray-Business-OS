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
//
// ═══ POR QUÉ SE EXCLUYE TAMBIÉN EL EFECTIVO — LA PARTICIÓN POR CANAL (T06) ═══
//
// Un cobro en efectivo NO entra al banco: entra a la caja física (el cajón). Si esta línea —que
// alimenta el saldo BANCARIO— lo contara, y además la caja física lo contara por su lado, el mismo
// peso quedaría dos veces en el total de disponibilidades. Por eso cada cobro cae en EXACTAMENTE UN
// canal según su forma de cobro, y los tres canales son una PARTICIÓN sin intersección:
//
//     Echeq       → "Valores a depositar" (cartera)        · excluido acá
//     Efectivo    → "Movimientos de efectivo posteriores al arqueo" (caja física, T06) · excluido acá
//     el resto    → esta línea (transferencia, depósito, débito: pegan al banco)
//
// La partición es la garantía anti-doble-conteo POR CONSTRUCCIÓN: no hay forma de cobro que caiga en
// dos canales, así que ningún cobro puede sumarse dos veces, sin importar en qué ventana esté cada
// uno. El lado de los PAGOS ya estaba particionado igual: formulaComprasPagadasPosteriores cuenta
// sólo Transferencia/Débito (banco) y deja el Efectivo para la caja física.

// La columna "Fecha de caja" NO se tipea acá: se importa de rubro-caja.mjs, que es quien la ESCRIBE
// en Compras. Escritor y lector comparten una sola definición, así el efecto Compras→CAJA no se
// rompe en silencio si la columna se mueve (lo verifica caja-posterior-al-corte.test.mjs).
import { COL_FECHA_CAJA } from './rubro-caja.mjs'
import { formulaUltimaFecha, formulaFrescuraDe } from './fecha-de-frescura.mjs'

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

// ═══ LA COLUMNA "FECHA DE CAJA" DE COMPRAS VIENE EN FORMATO MIXTO — POR QUÉ ESTAS FÓRMULAS NO USAN SUMIFS ═══
//
// EL BUG (verificado en vivo en la celda C13 de CAJA). La "Fecha de caja" (col AD de Compras) tiene
// unos valores como NÚMERO DE SERIE y otros como TEXTO "dd/mm/aaaa" —los que se cargaron tipeando la
// fecha—. Un SUMIFS con la condición ">"&corte compara numéricamente contra un texto y NO matchea:
// ignora en SILENCIO todos los pagos con fecha de texto. Efecto medido: los pagos por transferencia,
// débito y efectivo posteriores al corte NO restaban de la caja, y la disponibilidad quedaba inflada
// (transferencia+débito $217.370 + efectivo $1.104.000 que la SUMIFS vieja perdía).
//
// LA SOLUCIÓN. SUMPRODUCT con la fecha COACCIONADA a número: DATEVALUE parsea el texto (locale es-AR ⇒
// dd/mm/aaaa) y, para los que ya son serie, DATEVALUE("46000") falla y IFERROR cae a N() que devuelve
// el propio serial. Así los dos formatos entran en la misma comparación. El TOTAL también se envuelve
// en N(): SUMPRODUCT no tolera texto en la columna que suma (daría #VALUE! y tumbaría toda la fórmula),
// mientras que SUMIFS sí lo toleraba — por eso el cambio de función obliga a coaccionar el importe.

/** La "Fecha de caja" de Compras coaccionada a número, tolerante al formato mixto serie/texto. */
const fechaCajaCoerc = (c) => {
  const r = rango(c.hoja, c.fecha, c.desde, c.hasta)
  return `IFERROR(DATEVALUE(${r}&"");N(${r}))`
}
/** El total de Compras coaccionado con N(): SUMPRODUCT no suma texto, N() lo lleva a 0. */
const totalCoerc = (c) => `N(${rango(c.hoja, c.total, c.desde, c.hasta)})`

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
    // El efectivo va a la caja física (T06), no al banco: se excluye para que la partición por canal
    // no deje ningún cobro contado dos veces. Ver el encabezado de este archivo.
    + `${rango(c.hoja, c.forma, c.desde, c.hasta)};"<>Efectivo";`
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
 * Un solo SUMPRODUCT con los dos tipos sumados —(Transferencia)+(Débito)—, porque SUMPRODUCT sí hace
 * OR entre condiciones y además tolera la "Fecha de caja" guardada como texto (ver fechaCajaCoerc).
 *
 * @param {string} corte referencia a la celda con la fecha de corte del extracto
 * @param {object} c columnas de Compras
 * @returns {string} fórmula (sin `=`)
 */
export function formulaComprasPagadasPosteriores(corte, c = CMP) {
  const tipos = c.tiposBanco.map((t) => `(${rango(c.hoja, c.tipoPago, c.desde, c.hasta)}="${t}")`).join('+')
  return `SUMPRODUCT((${rango(c.hoja, c.estado, c.desde, c.hasta)}="Pagado")`
    + `*(${tipos})`
    + `*(${fechaCajaCoerc(c)}>${corte})`
    + `*${totalCoerc(c)})`
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CAJA FÍSICA (EFECTIVO): EL ARQUEO MANUAL COMO ANCLA + CARGA/DESCARGA AUTOMÁTICA (T06)
//
// DECISIÓN DEL DUEÑO: "permitir carga manual de efectivo, pero de ahí mismo se tiene que hacer carga
// y descarga de manera automática también". El arqueo manual de "Caja en pesos" es el ANCLA — el
// "corte" de la caja física, exactamente como el extracto es el corte del saldo bancario. De ese
// corte para adelante, el efectivo se mueve solo: se CARGAN los cobros en efectivo y se DESCARGAN los
// pagos en efectivo y los depósitos al banco.
//
// ES EL ESPEJO EXACTO DEL BANCO, DEL OTRO LADO DE LA PARTICIÓN. El banco excluye el efectivo (arriba);
// la caja física cuenta SÓLO el efectivo. Un cobro/pago cae en un único canal según su forma, así que
// el mismo peso no puede estar en el banco y en la caja a la vez: no hay doble conteo, por construcción.
//
// LA VENTANA ES EXCLUSIVA COMO LA DEL BANCO: fecha > arqueo. Un movimiento de efectivo está o DENTRO
// del arqueo (fecha ≤ arqueo, ya contado en el número que el dueño tipeó) o en la ventana posterior
// (fecha > arqueo), NUNCA en ambos. Cuando el dueño registra un arqueo NUEVO —con fecha más reciente—
// ese arqueo pasa a ser el corte y todo lo anterior COLAPSA dentro de él: sale de la ventana ">"
// automáticamente. El arqueo manual NUNCA se pisa: es la verdad ancla.
//
// POR QUÉ TAMBIÉN SE RESTAN LOS DEPÓSITOS. Un depósito de efectivo mueve plata del cajón al banco:
// baja la caja física y sube el saldo bancario (que el extracto ya trae, o traerá al actualizarse).
// Si el cobro en efectivo se sumó acá y después se deposita, sin restar el depósito el mismo peso
// quedaría en la caja física Y en el saldo del banco. Restarlo cierra la partición también cuando la
// plata cruza de canal. Es la misma "deposito de efectivo" que ya mira la alerta de CAJA (bloque 4.6).

/** La réplica del extracto y sus columnas para detectar depósitos de efectivo (mismo criterio que la
 *  alerta de trazabilidad del efectivo en CAJA): A=fecha, B=concepto, C=importe, E=entra/sale. */
export const DEP = { hoja: '_BANCO_RAW', fecha: 'A', concepto: 'B', importe: 'C', flujo: 'E', desde: 4 }

/**
 * NÚCLEO PURO: los cobros en EFECTIVO posteriores al arqueo. Auto-CARGA de la caja física.
 * El espejo de formulaCobrosPosteriores del lado del efectivo: acá se cuenta SÓLO "Efectivo" (que el
 * banco excluye), estado "Cobrado" (un proyectado no es plata que esté), y fecha POSTERIOR al arqueo.
 * @param {string} arqueo referencia a la celda con la fecha del arqueo (ej. '$F$4')
 * @param {object} c columnas de Cobranzas
 * @returns {string} fórmula, separador es-AR
 */
export function formulaCobrosEfectivoPosteriores(arqueo, c = COB) {
  return `SUMIFS(${rango(c.hoja, c.total, c.desde, c.hasta)};`
    + `${rango(c.hoja, c.estado, c.desde, c.hasta)};"Cobrado";`
    + `${rango(c.hoja, c.forma, c.desde, c.hasta)};"Efectivo";`
    + `${rango(c.hoja, c.fecha, c.desde, c.hasta)};">"&${arqueo})`
}

/**
 * NÚCLEO PURO: los pagos en EFECTIVO posteriores al arqueo. Auto-DESCARGA de la caja física.
 * El espejo de formulaComprasPagadasPosteriores del lado del efectivo: cuenta el tipo de pago que
 * aquélla deja afuera a propósito ("Efectivo"), con estado "Pagado" y fecha de caja POSTERIOR al
 * arqueo. SUMPRODUCT, no SUMIFS, por el mismo formato mixto de la "Fecha de caja" (ver fechaCajaCoerc):
 * un SUMIFS perdía en silencio los pagos en efectivo con fecha tipeada y la caja física no bajaba.
 * @param {string} arqueo referencia a la celda con la fecha del arqueo
 * @param {object} c columnas de Compras
 * @returns {string} fórmula
 */
export function formulaComprasEfectivoPosteriores(arqueo, c = CMP) {
  return `SUMPRODUCT((${rango(c.hoja, c.estado, c.desde, c.hasta)}="Pagado")`
    + `*(${rango(c.hoja, c.tipoPago, c.desde, c.hasta)}="Efectivo")`
    + `*(${fechaCajaCoerc(c)}>${arqueo})`
    + `*${totalCoerc(c)})`
}

/**
 * NÚCLEO PURO: los depósitos de efectivo al banco posteriores al arqueo. Auto-DESCARGA de la caja
 * física (la plata dejó el cajón). Sale de la réplica del extracto, con el MISMO criterio que la
 * alerta "efectivo cobrado que no se depositó" de CAJA: crédito ("entra") cuyo concepto dice
 * "deposito de efectivo" (tolerando la tilde). SUMPRODUCT porque necesita SEARCH sobre el texto.
 * ISNUMBER sobre la fecha: una fecha guardada como TEXTO compararía como mayor que cualquier arqueo
 * y metería un depósito viejo en la ventana — el mismo tropiezo que ya rompió el calendario de CAJA.
 * @param {string} arqueo referencia a la celda con la fecha del arqueo
 * @param {object} c columnas de la réplica del extracto
 * @returns {string} fórmula
 */
export function formulaDepositosEfectivoPosteriores(arqueo, c = DEP) {
  const col = (x) => `${c.hoja}!$${x}$${c.desde}:$${x}`
  return `SUMPRODUCT((${col(c.flujo)}="entra")`
    + `*ISNUMBER(SEARCH("deposito de efectivo";LOWER(SUBSTITUTE(${col(c.concepto)};"ó";"o"))))`
    + `*ISNUMBER(${col(c.fecha)})*(${col(c.fecha)}>${arqueo})`
    + `*IF(ISNUMBER(${col(c.importe)});${col(c.importe)};0))`
}

/**
 * NÚCLEO PURO: la línea neta de la caja física que va en el bloque de disponibilidades y suma al total.
 * Cobros en efectivo, menos pagos en efectivo, menos depósitos al banco — todo con fecha POSTERIOR al
 * arqueo. Si no hay arqueo con fecha, devuelve 0: sin ancla no hay ventana que acotar, y asumir que
 * todo el efectivo cobrado sigue en el cajón sería inventar plata que nadie contó. En ese caso la
 * pestaña pide un arqueo (y la alerta 4.6 marca el efectivo sin explicar).
 *
 * Los depósitos sólo se restan si hay réplica del extracto: sin _BANCO_RAW no se pueden detectar, y
 * mejor no restar que restar un cero disfrazado.
 * @param {string} arqueo referencia a la celda con la fecha del arqueo (ej. '$F$4')
 * @param {{bancoRaw?:string|null}} [opts]
 * @returns {string} fórmula completa, con el `=` adelante
 */
export function formulaNetaEfectivoPosterior(arqueo, { bancoRaw = DEP.hoja } = {}) {
  const depositos = bancoRaw
    ? `-${formulaDepositosEfectivoPosteriores(arqueo, { ...DEP, hoja: bancoRaw })}`
    : ''
  return `=IF(NOT(ISNUMBER(${arqueo}));0;`
    + `${formulaCobrosEfectivoPosteriores(arqueo)}-${formulaComprasEfectivoPosteriores(arqueo)}${depositos})`
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

/**
 * NÚCLEO PURO: hasta cuándo llega lo que CAJA sabe — LAS TRES PUERTAS, en una sola fecha.
 *
 * EL PEDIDO DEL DUEÑO (03/08): *"siempre q modifiques valores de caja con el extracto q te envio o se
 * haga modificaciones por compras pagas en efectivo o transferencias o cobranzas, las fechas que
 * aparecen se deben actualizar de manera automatica"*. Son exactamente tres puertas, y son las mismas
 * tres que este archivo ya usa para MOVER el saldo:
 *
 *     1. el extracto del banco       →  _BANCO_RAW!A   (la fecha del movimiento)
 *     2. una compra marcada pagada   →  Compras!AD     ("Fecha de caja", sólo estado "Pagado")
 *     3. una cobranza cobrada        →  Cobranzas!Q    (sólo estado "Cobrado")
 *
 * Se toma la MÁS NUEVA: cualquiera de las tres que se mueva tiene que mover el rótulo, porque
 * cualquiera de las tres mueve el número que está arriba. Si el rótulo sólo mirara el extracto,
 * cargar diez cobranzas no lo movería y el dueño leería "al 24/07" sobre una caja que ya cambió.
 *
 * POR QUÉ SE FILTRA POR ESTADO. Una compra con fecha de caja pero sin pagar, o una cobranza
 * proyectada, son PREVISIONES. Contarlas acá haría que el rótulo declarara frescura por un dato que
 * todavía no ocurrió — la Regla de Oro 2, presentar una estimación como un hecho.
 *
 * RANGOS ABIERTOS, no los cerrados que usan las fórmulas de importe de este archivo: un rótulo de
 * frescura que envejece porque el registro pasó la fila 1200 es el mismo defecto que se está
 * arreglando, sólo que más difícil de ver.
 *
 * @param {{bancoRaw?:string|null}} [refs] `bancoRaw` null = el libro no tiene la réplica del extracto
 * @returns {string} expresión sin `=`, separador es-AR
 */
export function formulaFrescuraCaja({ bancoRaw = '_BANCO_RAW' } = {}) {
  const abierto = (h, col, desde) => `'${h}'!$${col}$${desde}:$${col}`
  return formulaFrescuraDe([
    // El extracto: la puerta 1. Sin réplica en el libro esta puerta no existe y se omite — mejor una
    // frescura de dos fuentes que una referencia a una hoja que no está (#REF! en el subtítulo).
    bancoRaw ? formulaUltimaFecha(`'${bancoRaw}'!$A$4:$A`) : '',
    // La puerta 2. `mixto`: la "Fecha de caja" convive como serial y como texto "dd/mm/aaaa" — un MAX
    // crudo se queda con la última que entró como número y pierde las tipeadas EN SILENCIO.
    formulaUltimaFecha(abierto(CMP.hoja, CMP.fecha, CMP.desde), {
      mixto: true,
      cuando: `(${abierto(CMP.hoja, CMP.estado, CMP.desde)}="Pagado")`,
    }),
    // La puerta 3.
    formulaUltimaFecha(abierto(COB.hoja, COB.fecha, COB.desde), {
      cuando: `(${abierto(COB.hoja, COB.estado, COB.desde)}="Cobrado")`,
    }),
  ])
}

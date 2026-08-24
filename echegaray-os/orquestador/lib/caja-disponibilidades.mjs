// LAS CUENTAS DE DISPONIBILIDADES — CON NOMBRES DE PLAN DE CUENTAS, NO COLOQUIALES.
//
// POR QUÉ (20/07). El dueño pidió "banco, caja grande y caja chica, cupo restante de tarjeta de
// crédito, con nombres como corresponde no coloquial". Los rótulos de acá son los que usa cualquier
// contador argentino, así que el día que esto se cruce con la contabilidad los dos lados van a estar
// hablando del mismo concepto:
//   · "caja grande"  → Caja en pesos
//   · "caja chica"   → Fondo fijo
//   · cheques de terceros recibidos y todavía no depositados → Valores a depositar
//
// LA DISTINCIÓN QUE NO SE PUEDE PERDER: el margen disponible de la tarjeta NO es una disponibilidad.
// Es capacidad de endeudarse. Va en su propio bloque, debajo del total, y NO suma. Sumarlo sería
// contar como plata propia una deuda que todavía no se tomó — que es exactamente el error que hace
// que una empresa se crea líquida el día antes de no poder pagar sueldos. Por eso CUENTAS (que sí
// suman) y CARGA (que no) están separadas acá y no en el script.
//
// ═══ LA MONEDA EXTRANJERA (21/07) ═══
//
// El dueño: "en el banco se cuenta con un saldo en dólares, reubicar todo esto tiene que estar en
// consideración" y "la tarjeta tiene disponible en pesos y dólares".
//
// Un saldo en dólares metido a la fuerza en una columna de pesos es un dato falso, y en Argentina se
// vuelve falso más rápido que en ningún lado. Así que cada cuenta declara SU moneda y el cuadro
// guarda dos números distintos que no se pisan: el saldo en moneda de origen (lo que dice el
// extracto, y es el HECHO) y su equivalente en pesos (un CÁLCULO, que vale lo que valga el tipo de
// cambio del día). El total suma pesos, porque un total tiene que ser de una sola moneda.
//
// EL TIPO DE CAMBIO NO SE INVENTA NI SE PEGA: sale de GOOGLEFINANCE, que es una fuente viva y
// verificable, y el dueño puede declarar otro si opera a MEP o a dólar tarjeta. El que manda es el
// declarado cuando existe. Un tipo de cambio pegado a mano por mí envejecería en un día y nadie se
// enteraría.
//
// POR QUÉ EL MATCH ES POR PATRÓN Y NO POR NOMBRE EXACTO: el agente reescribe la pestaña cada 2 horas
// y tiene que devolver cada saldo cargado a mano a SU cuenta. Si el dueño completa el nombre del
// banco —"Banco Galicia — Cuenta corriente en pesos"— un match exacto perdería el saldo en silencio.
// El patrón sobrevive a que le pongan el nombre real, que es justamente lo que hay que hacer.

/** El nombre del rango con nombre donde vive el tipo de cambio en uso. Se define UNA vez, en CAJA,
 *  y cualquier otra fórmula del archivo que necesite convertir dólares lo referencia por este
 *  nombre. Un rango con nombre sobrevive a que la pestaña se reescriba y cambien las filas. */
export const RANGO_TC = 'TIPO_CAMBIO_USD'

/** Las tres filas del bloque de tipo de cambio. La de "uso" es la que se referencia. */
export const TIPO_CAMBIO = {
  referencia: {
    nombre: 'Dólar de referencia — cotización del día',
    formula: '=IFERROR(GOOGLEFINANCE("CURRENCY:USDARS");"")',
    origen: 'GOOGLEFINANCE, cotización de mercado. Se actualiza sola, no se carga a mano.',
  },
  declarado: {
    nombre: 'Dólar declarado por la empresa (opcional)',
    origen: 'Completar SÓLO si operás a otro tipo de cambio (MEP, tarjeta, contado con liqui). Anotar cuál al lado.',
  },
  uso: {
    nombre: '⇒ Tipo de cambio en uso',
    origen: 'Manda el declarado cuando está cargado; si no, la cotización del día.',
  },
}

/** Las cuentas que SUMAN al efectivo. En el orden en que se leen: de lo más líquido a lo menos. */
export const CUENTAS = [
  {
    // ═══ "EFECTIVO", NO "CAJA" (07/08). El dueño, sobre los rótulos viejos "Caja en pesos" /
    // "Caja en pesos — contado": "¿qué mierda es cada cosa?". Tenía razón: dos filas con casi el
    // mismo nombre parecen el mismo concepto duplicado. Ésta es LA VIVA (arqueo ± movimientos en
    // efectivo posteriores); la del conteo a mano se llama "Arqueo" y no vuelve a decir "caja".
    nombre: 'Efectivo en pesos',
    moneda: 'ARS',
    patron: /^efectivo en pesos/i,
    origenSugerido: 'Arqueo de caja',
    // La fecha de esta fila NUNCA sale del reloj de la corrida: fechar un conteo de caja con TODAY()
    // afirma que se contó hoy y deja la alarma de antigüedad clavada en 0 días.
    // Y DESDE EL 24/08/2026 TAMPOCO ES LA DEL CONTEO: es la del ÚLTIMO MOVIMIENTO de efectivo, porque
    // el número de esta fila es el conteo MÁS seis fuentes de movimientos posteriores. El dueño: *"me
    // confunde con la fecha del saldo... no me indica la fecha del ultimo movimiento de efectivo"*.
    // El día del conteo sigue a la vista en `_CAJA_ANEXO` (renglón "la fecha que CAJA publica para el
    // conteo en pesos" y la línea de estado del SELLO). Ver `formulaFechaUltimoEfectivo`.
    arqueo: 'CAJA_ARQUEO_ARS_FECHA',
  },
  {
    // ═══ EL CAJÓN TAMBIÉN TIENE DÓLARES (01/08) ═══
    //
    // El dueño: "tenemos una cobranza en dólares en efectivo dentro de esa pestaña". Es la fila 62 de
    // Cobranzas: U$S 15.000 de anticipo de Quattropani, cobrados en efectivo el 31/07. Hasta hoy ese
    // cobro entraba a la caja de PESOS como $15.000 — el importe correcto en la moneda equivocada.
    //
    // Se trata igual que la cuenta en dólares del banco, que ya existía: se lleva el saldo EN SU
    // MONEDA y se valúa con TIPO_CAMBIO_USD para poder sumarlo al total. No se convierte al cargarlo:
    // un cobro en dólares sigue siendo dólares hasta que se venda, y la exposición cambiaria tiene
    // que poder verse (por eso el bloque 4.8 la muestra aparte).
    nombre: 'Efectivo en dólares',
    moneda: 'USD',
    patron: /^efectivo en d[oó]lares/i,
    origenSugerido: 'Arqueo de caja',
    arqueo: 'CAJA_ARQUEO_USD_FECHA',
  },
  // FONDO FIJO — RETIRADO (01/08). El dueño: "quita la fila de fondo fijo, no la voy a usar, no la
  // consideres más". Vivía en el bloque desde el diseño original y nunca tuvo un peso cargado: una
  // fila permanentemente en "⚠ sin cargar" no es un control, es ruido que enseña a ignorar los avisos.
  // No se reemplaza por una fila vacía: se saca. Si algún día hay caja chica, se vuelve a agregar acá.
  {
    // Nombre terso, estilo statement de tesorería (el n° de cuenta va en la nota de origen, no en el
    // rótulo). El saldo lo trae el extracto (banco-santander.mjs), no depende del nombre de la fila.
    nombre: 'Santander · cta cte ARS',
    moneda: 'ARS',
    banco: 'saldoPesos',
    // Match por moneda explícita: separa ARS de USD sin ambigüedad. El nombre viejo está en ALIAS.
    patron: /^santander.*\bars\b/i,
    origenSugerido: 'Extracto bancario',
  },
  {
    // NUEVA (21/07). "En el banco se cuenta con un saldo en dólares."
    // Va en dólares y se convierte a pesos con el tipo de cambio de arriba. El saldo que se carga
    // es el del extracto, en dólares: convertirlo a mano al cargarlo perdería el dato original y
    // dejaría un número que envejece sin que se note.
    nombre: 'Santander · cta cte USD',
    moneda: 'USD',
    banco: 'saldoDolares',
    patron: /^santander.*\busd\b/i,
    origenSugerido: 'Santander, saldo total en dólares',
  },
  {
    // ═══ BALANZ — INVERTIDO, NO DISPONIBLE (06/08, orden del dueño) ═══
    //
    // El 05/08 salieron del banco $22.530.000 ("A balanz capital valores / inv") y U$S 15.000 de la
    // cuenta USD. Sin estas filas la plata desaparecía del total: el banco la descuenta y ninguna
    // línea la recibe. Es plata de la empresa en una cuenta comitente. El saldo es el APORTE probado
    // por extracto, no la posición total (gap declarado en banco-santander.mjs BALANZ): con el
    // extracto de Balanz se reemplaza.
    //
    // ═══ POR QUÉ `noSuma` (06/08) ═══
    //
    // El dueño, textual: *"el concepto de 'caja disponible' tiene que ser lo que se refleja
    // únicamente en el saldo bancario (ars y usd) como caja en efectivo (ars y usd), discriminar lo
    // que se encuentra en Balanz invertido, reflejarlo en las tarjetas de manera ordenada como se
    // vería y usaría en el JPMorgan"*. Es exactamente cómo un tesorero mira su posición en
    // J.P. Morgan Access Liquidity Solutions (jpmorgan.com/payments/solutions/access): el operating
    // cash —lo que puede pagar HOY— separado de los invested balances, que se muestran aparte con su
    // naturaleza, y la liquidez total es la suma de los dos. Una cuenta comitente no paga un cheque
    // mañana: sumarla al disponible infla el número con el que se decide qué se paga.
    //
    // El mecanismo es el MISMO del ‖ de "Valores a depositar": la fila se ve, se valúa, y el total
    // la resta. La tarjeta INVERTIDO de la portada referencia estas celdas — una sola fuente.
    nombre: 'Balanz · inversiones ARS ‖ invertido',
    moneda: 'ARS',
    banco: 'balanzArs',
    patron: /^balanz.*\bars\b/i,
    noSuma: true,
    origenSugerido: 'Transferencia del 05/08 (extracto Santander) — posición pendiente del extracto Balanz',
  },
  {
    nombre: 'Balanz · inversiones USD ‖ invertido',
    moneda: 'USD',
    banco: 'balanzUsd',
    patron: /^balanz.*\busd\b/i,
    noSuma: true,
    origenSugerido: 'Transferencia del 05/08 (base 25.413 de la cta USD) — posición pendiente del extracto Balanz',
  },
  {
    // SE CALCULA SOLA, y por eso es la única cuenta sin celda amarilla.
    //
    // POR QUÉ (20/07). El dueño: "en Cobranzas hay cheques que no se encuentran considerados, ¿dónde
    // los vamos a ubicar?". Estaban en la columna "Forma de Cobro", que el OS no leía. Son
    // $115.000.000 cobrados en echeq de LA ESTRELLA, con vencimientos escalonados. Un echeq todavía
    // no acreditado NO es plata en la cuenta: es un valor en cartera, y éste es su lugar.
    //
    // El corte es la fecha de acreditación: si todavía no llegó, el valor está en cartera. Los que ya
    // se acreditaron son saldo del banco y contarlos acá los duplicaría.
    // 02/08 — EL ‖ NO ES DECORACIÓN. El total de disponibilidades es `SUM(E10:E26)-E14`: RESTA esta
    // línea. El criterio es correcto —un ECHEQ en custodia no es plata disponible hoy, entra en su
    // fecha de pago y ya está contado en el calendario de vencimientos— pero la pestaña no lo decía
    // en ningún lado. El dueño sumaba la columna a ojo y le faltaban $10.290.000 contra el total, sin
    // nada que explicara la diferencia. Un cuadro cuyo total no cierra con sus propias líneas no se
    // puede auditar mirándolo, y eso es exactamente lo que él llamó "mal manejo de información".
    // El ‖ es la misma marca que usan las líneas memo de los dos Cash Flow: se lee igual en todos lados.
    nombre: 'Valores a depositar ‖ no suma al total',
    moneda: 'ARS',
    patron: /^valores a depositar/i,
    noSuma: true,
    // 21/07: DEJÓ DE SALIR DE COBRANZAS. La fórmula sobre Cobranzas daba $30.000.000 y la cartera
    // real es $10.000.000: dos de los tres echeq están ENDOSADOS a Alumetal. Cobranzas registra que
    // se cobró —y es cierto, el echeq entró— pero no puede saber qué pasó después con el valor. Eso
    // sólo lo sabe el banco. La fórmula vieja quedó como CONTROL, para que la diferencia se vea.
    origenSugerido: 'Santander · ECHEQs en custodia',
    banco: 'cartera',
    // El tope es 400, el mismo que el resto del archivo. Convivían tres (200, 300 y 400) sobre la
    // MISMA pestaña: el control de acá miraba hasta la 200 y la línea que lo compara hasta la 400,
    // así que el día que Cobranzas pasara esa fila la "diferencia contra el banco" iba a acusar un
    // desvío que no existe.
    // ═══ EL BORDE ES `>=`, Y ESE UN DÍA VALÍA $10.000.000 (15/08/2026) ═══
    //
    // Con `>` el control dejaba afuera al echeq que se acredita HOY, y la cartera contra la que se
    // compara —cheques "En custodia" de la réplica del banco— no tiene ventana de fecha ninguna: los
    // cuenta todos mientras no se hayan depositado. Dos poblaciones distintas no controlan nada.
    //
    // El día que se midió: `_CHEQUES_RAW` tenía DOS cheques de Alimentos Del Sur en estado Endosado
    // —90020100 por $10.000.000 que se acreditaba el 15/08 y 90020101 por $10.000.000 el 31/08— y
    // Cobranzas los tenía a los dos como "Cobrado" por Echeq en esas mismas dos fechas. El control
    // publicaba $10.000.000 de diferencia: el de hoy se le escapaba por el borde. La línea de al lado
    // de este mismo anexo ya decía en voz alta que eran "los $20.000.000 que el cuadro creía tener y
    // ya no tiene" — el control desmentía al comentario, y el comentario tenía razón.
    //
    // Un cheque que se acredita hoy TODAVÍA no se acreditó. Va adentro.
    control: '=SUMPRODUCT((Cobranzas!$N$5:$N$400="Echeq")*(Cobranzas!$Q$5:$Q$400>=TODAY())*IF(ISNUMBER(Cobranzas!$M$5:$M$400);Cobranzas!$M$5:$M$400;0))',
    // El dueño (21/07): "quiero un agrupar +/- con la información de esos cheques". Un total de
    // $30.000.000 no se puede verificar ni gestionar: hay que saber de quién es cada cheque y qué
    // día entra. El detalle se arma con REFERENCIAS a las filas de Cobranzas, no copiando importes.
    detalle: 'echeq_en_cartera',
  },
]

/** Lo que se carga a mano pero NO es una disponibilidad. Una línea por moneda: el resumen de la
 *  tarjeta trae dos límites distintos y mezclarlos daría un cupo que no existe en ninguna de las
 *  dos. */
/**
 * Lo que se carga a mano pero NO es una disponibilidad.
 *
 * ME CORRIJO SOBRE AYER: modelé la tarjeta como dos cupos, uno en pesos y otro en dólares. El
 * resumen dice que no. Hay UN cupo de $10.000.000 y los consumos en dólares (suscripciones, U$S
 * 193,25) se pagan contra ese mismo cupo. Dos cupos habrían mostrado un aire que no existe.
 */
export const CARGA = {
  limiteTarjeta: 'Tarjeta de crédito — límite acordado',
  acuerdo: 'Acuerdo en descubierto — importe acordado',
}

/** Nombres viejos → nombre actual, para no perder un dato ya cargado cuando se renombra una fila. */
export const ALIAS = new Map([
  ['Tarjeta de crédito — límite acordado en pesos', CARGA.limiteTarjeta],
  ['Banco — Cuenta corriente en pesos', 'Santander · cta cte ARS'],
  ['Banco — Cuenta corriente en dólares', 'Santander · cta cte USD'],
  // Nombres largos anteriores → nombre terso actual, para no perder un dato ya cargado al renombrar.
  ['Banco Santander — Cuenta corriente en pesos 179-091383/6', 'Santander · cta cte ARS'],
  ['Banco Santander — Cuenta corriente en dólares', 'Santander · cta cte USD'],
  ['Valores a depositar (cheques de terceros en cartera)', 'Valores a depositar'],
  // Los rótulos previos al ‖ (06/08): un dato cargado sobre el nombre viejo vuelve a su cuenta.
  ['Balanz · inversiones ARS', 'Balanz · inversiones ARS ‖ invertido'],
  ['Balanz · inversiones USD', 'Balanz · inversiones USD ‖ invertido'],
  // Los rótulos previos a la FUSIÓN del conteo en la fila viva (07/08, orden del dueño: "sacá una
  // de las dos celdas"). El conteo tipeado vive hoy bajo alguno de estos nombres — la fila del
  // arqueo que se eliminó o el rótulo "caja" anterior—: sin estas entradas el rescate no lo
  // encuentra y la primera corrida lo daría por ausente. OJO: el mapa es de UN salto, no cadena.
  ['Caja en pesos', 'Efectivo en pesos'],
  ['Caja en dólares', 'Efectivo en dólares'],
  ['Caja en pesos — contado', 'Efectivo en pesos'],
  ['Caja en dólares — contado', 'Efectivo en dólares'],
  ['Arqueo en pesos — conteo a mano', 'Efectivo en pesos'],
  ['Arqueo en dólares — conteo a mano', 'Efectivo en dólares'],
])

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TODAS = [
  ...CUENTAS.map((c) => c.patron),
  ...Object.values(CARGA).map((n) => new RegExp(`^${esc(n)}`, 'i')),
  ...[...ALIAS.keys()].map((n) => new RegExp(`^${esc(n)}$`, 'i')),
  ...Object.values(TIPO_CAMBIO).map((t) => new RegExp(`^${esc(t.nombre)}`, 'i')),
]

/**
 * NÚCLEO PURO: ¿este rótulo de la columna A es una fila donde se carga un dato a mano?
 * Se usa para rescatar los saldos antes de reescribir la pestaña, y para contar cuántas cuentas
 * siguen sin cargar.
 * @param {string} rotulo
 * @returns {boolean}
 */
export function filaDeCuenta(rotulo) {
  const t = String(rotulo ?? '').trim()
  return t.length > 0 && TODAS.some((p) => p.test(t))
}

/**
 * NÚCLEO PURO: la disponibilidad neta, que es el número con el que conviene decidir.
 * No es el saldo: es el saldo menos los cheques ya firmados que todavía no se debitaron. Esa plata
 * está en la cuenta y ya no es de la empresa.
 * @param {number} disponibilidades suma de CUENTAS
 * @param {number} chequesEmitidosSinDebitar
 * @returns {number}
 */
export function disponibilidadNeta(disponibilidades = 0, chequesEmitidosSinDebitar = 0) {
  return (Number(disponibilidades) || 0) - (Number(chequesEmitidosSinDebitar) || 0)
}

/**
 * NÚCLEO PURO: el margen de la tarjeta. Devuelve null si falta el límite — y null NO es cero:
 * mostrar $0 cuando el dato no se cargó haría creer que la tarjeta está agotada.
 * @returns {number|null}
 */
export function margenTarjeta(limiteAcordado, consumidoSinDebitar = 0) {
  const l = Number(limiteAcordado)
  if (!Number.isFinite(l) || l <= 0) return null
  return l - (Number(consumidoSinDebitar) || 0)
}

/**
 * NÚCLEO PURO: convierte a pesos declarando el criterio. Devuelve null —no cero— cuando falta el
 * tipo de cambio, porque un saldo en dólares valuado en $0 es peor que no mostrarlo.
 * @param {number} importe en moneda de origen
 * @param {'ARS'|'USD'} moneda
 * @param {number|null} tc
 * @returns {number|null}
 */
export function aPesos(importe, moneda = 'ARS', tc = null) {
  // Una celda vacía NO es un cero: es un saldo que nadie cargó, y sumarla como cero baja el total
  // sin que nada avise. Number('') da 0, así que el vacío se descarta antes.
  if (importe === '' || importe === null || importe === undefined) return null
  const i = Number(importe)
  if (!Number.isFinite(i)) return null
  if (moneda === 'ARS') return i
  const t = Number(tc)
  return Number.isFinite(t) && t > 0 ? i * t : null
}

const letraCol = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

/**
 * NÚCLEO PURO: dónde está el saldo dentro de la pestaña CAJA, leyendo sus rótulos.
 *
 * POR QUÉ NO SE PUEDE HARDCODEAR (21/07). El Cash Flow Mensual toma de acá su "Efectivo al inicio"
 * y apuntaba a la columna B fija. El día que la pestaña sumó la columna de moneda, el total pasó a
 * la E y el cuadro quedó sin saldo inicial: las dos líneas de cierre en blanco y un aviso de "sin
 * saldo cargado" que era mentira, porque el saldo estaba cargado. Ninguna suma cambió, así que
 * ningún control en $0 lo vio.
 *
 * EL RANGO DE FECHAS TERMINA EN LA ÚLTIMA CUENTA, no en el total: entre medio están los cheques del
 * detalle desplegable, con sus fechas de acreditación futuras. Un MAX que las incluya ancla el
 * cuadro dos meses adelante.
 *
 * @param {Array<Array<any>>} filas valores de la pestaña, desde A1
 * @returns {{filaCab:number, filaTotal:number, filaUltimaCuenta:number, colPesos:string, colFecha:string}|null}
 */
export function ubicarCaja(filas = []) {
  const txt = (f, i = 0) => String(f?.[i] ?? '').trim()
  const iCab = filas.findIndex((f) => txt(f) === 'Cuenta')
  // ═══ EL MATCH ES INSENSIBLE A MAYÚSCULAS, Y NO ES UN DETALLE (05/08) ═══
  //
  // Estaba escrito `startsWith('TOTAL DISPONIBILIDADES')` de cuando el rótulo iba en versales. La
  // pestaña pasó a escribirlo como "Total disponibilidades" y este localizador devolvió `null` desde
  // entonces: `cash-flow-rehacer` cayó a su respaldo por rango con nombre y nadie se enteró, porque
  // el respaldo funciona. Un localizador que no localiza y no rompe es la peor clase de defecto.
  const iTotal = filas.findIndex((f) => /^total disponibilidades/i.test(txt(f)))
  if (iCab < 0 || iTotal <= iCab) return null
  const cab = filas[iCab]
  const busca = (re) => cab.findIndex((c) => re.test(String(c ?? '').trim().toLowerCase()))
  const pesos = busca(/^saldo en pesos/)
  const fecha = busca(/^fecha del saldo/)
  if (pesos < 0 || fecha < 0) return null
  let ultima = -1
  for (let i = iCab + 1; i < iTotal; i++) if (filaDeCuenta(txt(filas[i]))) ultima = i
  if (ultima < 0) return null
  return {
    filaCab: iCab + 1,
    filaTotal: iTotal + 1,
    filaUltimaCuenta: ultima + 1,
    colPesos: letraCol(pesos),
    colFecha: letraCol(fecha),
  }
}

/**
 * NÚCLEO PURO: qué cheques de terceros siguen en cartera a una fecha dada.
 *
 * El corte es la fecha de acreditación, NO el estado: en Cobranzas hay echeqs marcados "Cobrado"
 * con fecha de acreditación futura (los rows 43 y 48 al 21/07). El estado lo escribe una persona y
 * se adelanta; la fecha es el hecho. Mientras no llegó el día, la plata no está en la cuenta.
 *
 * @param {Array<{fila:number, forma:string, fecha:Date|null, importe:number}>} filas de Cobranzas
 * @param {Date} hoy
 * @returns {Array} las filas en cartera, ordenadas por fecha de acreditación
 */
export function echeqsEnCartera(filas = [], hoy = new Date()) {
  return filas
    .filter((f) => /eche?q|cheque/i.test(String(f.forma ?? '')))
    .filter((f) => f.fecha instanceof Date && !Number.isNaN(+f.fecha) && f.fecha > hoy)
    .filter((f) => Number.isFinite(Number(f.importe)) && Number(f.importe) !== 0)
    .sort((a, b) => +a.fecha - +b.fecha)
}

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
    nombre: 'Caja en pesos',
    moneda: 'ARS',
    patron: /^caja en pesos/i,
    origenSugerido: 'Arqueo de caja',
  },
  {
    nombre: 'Fondo fijo',
    moneda: 'ARS',
    patron: /^fondo fijo/i,
    origenSugerido: 'Arqueo de caja',
  },
  {
    // El nombre del banco lo completa el dueño: no está en ningún dato del archivo y no se inventa.
    nombre: 'Banco Santander — Cuenta corriente en pesos 179-091383/6',
    moneda: 'ARS',
    // Desde el 21/07 lo trae el extracto, no una carga a mano. Ver banco-santander.mjs.
    banco: 'saldoPesos',
    // La negación importa: si el dueño le pone el nombre real al banco y le saca el "en pesos", la
    // fila tiene que seguir siendo la de pesos y no capturar la de dólares.
    patron: /^banco(?!.*d[oó]lar).*cuenta corriente/i,
    origenSugerido: 'Extracto bancario',
  },
  {
    // NUEVA (21/07). "En el banco se cuenta con un saldo en dólares."
    // Va en dólares y se convierte a pesos con el tipo de cambio de arriba. El saldo que se carga
    // es el del extracto, en dólares: convertirlo a mano al cargarlo perdería el dato original y
    // dejaría un número que envejece sin que se note.
    nombre: 'Banco Santander — Cuenta corriente en dólares',
    moneda: 'USD',
    banco: 'saldoDolares',
    patron: /^banco.*cuenta corriente en d[oó]lares/i,
    origenSugerido: 'Santander, saldo total en dólares',
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
    nombre: 'Valores a depositar (cheques de terceros en cartera)',
    moneda: 'ARS',
    patron: /^valores a depositar/i,
    // 21/07: DEJÓ DE SALIR DE COBRANZAS. La fórmula sobre Cobranzas daba $30.000.000 y la cartera
    // real es $10.000.000: dos de los tres echeq están ENDOSADOS a Alumetal. Cobranzas registra que
    // se cobró —y es cierto, el echeq entró— pero no puede saber qué pasó después con el valor. Eso
    // sólo lo sabe el banco. La fórmula vieja quedó como CONTROL, para que la diferencia se vea.
    origenSugerido: 'Santander · ECHEQs en custodia',
    banco: 'cartera',
    control: '=SUMPRODUCT((Cobranzas!$N$5:$N$200="Echeq")*(Cobranzas!$Q$5:$Q$200>TODAY())*IF(ISNUMBER(Cobranzas!$M$5:$M$200);Cobranzas!$M$5:$M$200;0))',
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
  ['Banco — Cuenta corriente en pesos', 'Banco Santander — Cuenta corriente en pesos 179-091383/6'],
  ['Banco — Cuenta corriente en dólares', 'Banco Santander — Cuenta corriente en dólares'],
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
  const iTotal = filas.findIndex((f) => txt(f).startsWith('TOTAL DISPONIBILIDADES'))
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

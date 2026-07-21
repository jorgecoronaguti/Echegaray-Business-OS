// LO QUE DICE EL BANCO, CON FECHA DE CORTE Y ORIGEN. NO ES UNA OPINIÓN NI UNA ESTIMACIÓN.
//
// POR QUÉ EXISTE (21/07). El dueño trajo la foto completa del Santander Empresas: saldos, extracto,
// acuerdo de descubierto, estado y detalle de la tarjeta, y los ECHEQs. Hasta hoy el OS no tenía NADA
// de eso: la caja se cargaba a mano y las líneas de crédito estaban vacías.
//
// ═══ EL HALLAZGO QUE PAGA TODO ESTE ARCHIVO ═══
//
// CAJA decía "Valores a depositar: $30.000.000" — tres echeq de LA ESTRELLA por $10M cada uno. El
// banco dice otra cosa:
//   · 90020099 · vence 31/07 · $10.000.000 · EN CUSTODIA  → sigue siendo nuestro
//   · 90020100 · vence 15/08 · $10.000.000 · ENDOSADO a ALUMETAL S.A. → ya no está
//   · 90020101 · vence 31/08 · $10.000.000 · ENDOSADO a ALUMETAL S.A. → ya no está
//
// Se usaron para pagarle a Alumetal. La cartera real es $10.000.000, no $30.000.000: la caja estaba
// sobrevaluada en VEINTE MILLONES. En Cobranzas los tres figuran igual porque esa pestaña registra
// que se cobró, y es cierto que se cobró — el echeq entró. Lo que Cobranzas no puede saber es qué
// pasó DESPUÉS con el valor. Eso sólo lo sabe el banco, y por eso este archivo existe.
//
// Y hay un segundo efecto, del mismo tamaño y en el otro sentido: esos $20.000.000 figuran en
// Cobranzas con fecha de cobro 15/08 y 31/08, así que el cash flow los espera como ingreso de agosto.
// No van a entrar: ya se entregaron. Endosar un echeq recibido no mueve la cuenta corriente —
// cancela un ingreso futuro y un egreso futuro al mismo tiempo.
//
// ═══ POR QUÉ ESTO SE PEGA Y NO SE CALCULA ═══
//
// No hay API de banca empresa contratada. El dato entra por captura o extracto, así que es una
// RÉPLICA con origen declarado, igual que los comprobantes de ARCA: la regla de oro pide "fórmulas o
// celdas con ORIGEN TRAZABLE", y esto es lo segundo. Lo que no puede pasar es que envejezca en
// silencio: por eso todo lleva CORTE y la pestaña muestra la antigüedad y avisa cuando pasa de una
// semana.

/** El día y la hora de la foto. Todo lo de abajo es verdad A ESTA FECHA, no hoy. */
export const CORTE = '2026-07-21'
export const ORIGEN = 'Santander Empresas · captura del 21/07/2026 09:19-09:25'

/** La cuenta operativa. Es la única del banco. */
export const CUENTA = {
  banco: 'Banco Santander',
  numero: '179-091383/6',
  sucursal: '0179 San Juan',
  saldoPesos: 5596330.74,
  saldoDolares: 581.39,
}

/**
 * El acuerdo de descubierto. NO ES CAJA: es capacidad de endeudarse, como la tarjeta.
 *
 * Y NO ES GRATIS NI TEÓRICO: el extracto muestra que la cuenta estuvo en descubierto casi todo
 * julio —hasta −$12.095.024 el 14/07— y que el 14/07 el banco cobró $252.340,32 de intereses del
 * 08/06 al 07/07, más IVA. A 62,78% de costo financiero total anual, usar el acuerdo tiene precio.
 */
export const ACUERDO = {
  numero: '00007',
  importe: 18200000,
  vence: '2026-12-03',
  tna: 0.55,
  tea: 0.6278,
  cft: 0.6278,
  estado: 'Activo',
}

/**
 * La tarjeta de crédito.
 *
 * UN SOLO CUPO, CON CONSUMOS EN DOS MONEDAS — y acá me corrijo. Ayer modelé "límite en pesos" y
 * "límite en dólares" como dos cupos distintos. El resumen dice que no: el límite es $10.000.000 y
 * los consumos en dólares (U$S 193,25 de suscripciones) se pagan contra ese mismo cupo.
 *
 * EL DISPONIBLE ES EL QUE DECLARA EL BANCO, no uno que yo calcule. $10.000.000 − $998.363,53 daría
 * $9.001.636,47 y el banco dice $9.062.069,50. No sé por qué difieren $60.433,03 y no lo voy a
 * inventar: el número que vale para decidir es el del banco.
 */
export const TARJETA = {
  cuenta: 'Visa 921127486 · Business',
  limite: 10000000,
  consumidoPesos: 998363.53,
  consumidoDolares: 193.25,
  disponible: 9062069.50,
  cierra: '2026-07-23',
  vence: '2026-08-03',
  debitoAutomatico: 'CC en pesos 179-000091383/6, por el total',
  // Los tres cupos internos que el resumen separa. El de cuotas es el que compromete meses futuros.
  adelantoEfectivo: { limite: 2000000, disponible: 2000000 },
  cuotas: { limite: 10000000, consumido: 4437174.47, disponible: 5562825.53 },
  cuotasPendientes: { proximoPeriodo: 965863.53, restante: 4783810.75 },
}

/**
 * Los ECHEQs de terceros y qué pasó con cada uno. El estado es del banco, no del Sheet.
 *
 * "custodia"  → sigue en cartera: es un valor de la empresa y suma a las disponibilidades.
 * "endosado"  → se entregó a un tercero para pagarle. Ya no es nuestro y NO va a entrar a la cuenta.
 * "cobrado"   → se acreditó. Ya está adentro del saldo del banco; contarlo otra vez lo duplicaría.
 */
export const ECHEQS_TERCEROS = [
  { numero: '90020099', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-06-11', pago: '2026-07-31', importe: 10000000, estado: 'custodia' },
  { numero: '90020100', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-06-11', pago: '2026-08-15', importe: 10000000, estado: 'endosado', beneficiario: 'ALUMETAL S.A' },
  { numero: '90020101', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-06-11', pago: '2026-08-31', importe: 10000000, estado: 'endosado', beneficiario: 'ALUMETAL S.A' },
  { numero: '90020098', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-06-11', pago: '2026-07-15', importe: 10000000, estado: 'cobrado' },
  { numero: '90019998', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-03-11', pago: '2026-06-30', importe: 15000000, estado: 'cobrado' },
  { numero: '90019997', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-03-11', pago: '2026-06-15', importe: 15000000, estado: 'cobrado' },
  { numero: '90019996', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-03-11', pago: '2026-05-30', importe: 15000000, estado: 'cobrado' },
  { numero: '90019995', emisor: 'Alimentos Del Sur SA', cuit: '30716490498', emision: '2026-03-11', pago: '2026-05-15', importe: 15000000, estado: 'cobrado' },
]

/**
 * NÚCLEO PURO: los valores que TODAVÍA son de la empresa, a una fecha.
 * Sólo los que están en custodia. Un endosado se entregó; un cobrado ya está en el saldo del banco.
 */
export function enCartera(echeqs = ECHEQS_TERCEROS) {
  return echeqs.filter((e) => e.estado === 'custodia')
}

/** NÚCLEO PURO: los que salieron de la cartera para pagarle a alguien. */
export function endosados(echeqs = ECHEQS_TERCEROS) {
  return echeqs.filter((e) => e.estado === 'endosado')
}

/** NÚCLEO PURO: total de una lista de echeqs. */
export const totalEcheqs = (l = []) => l.reduce((s, e) => s + (Number(e.importe) || 0), 0)

/**
 * NÚCLEO PURO: cuántos días tiene la foto. Arriba de una semana, el saldo se mira con desconfianza.
 * @param {Date} hoy
 */
export function antiguedadDias(hoy = new Date(), corte = CORTE) {
  const [a, m, d] = corte.split('-').map(Number)
  return Math.floor((+new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - +new Date(a, m - 1, d)) / 86400000)
}

/**
 * EL EXTRACTO, MOVIMIENTO POR MOVIMIENTO (03/07 al 21/07/2026).
 *
 * POR QUÉ VALE LA PENA TRANSCRIBIRLO. El extracto es la ÚNICA verdad de lo que se movió de verdad.
 * Compras dice lo que se compró y Cobranzas lo que se facturó; los dos son intenciones hasta que el
 * banco las confirma. Cruzarlos es la forma de encontrar lo que no está cargado en ningún lado.
 *
 * CÓMO SÉ QUE NO ME EQUIVOQUÉ AL TIPEAR. Cada fila trae su SALDO, y el extracto es una cadena:
 * saldo(n) = saldo(n−1) + importe(n). El test recorre la cadena entera y termina en $5.596.330,74,
 * el saldo que muestra el home del banco. Un dígito mal escrito rompe la cadena y el test falla. Sin
 * eso, esto sería una lista de números que parecen ciertos.
 *
 * Están en orden cronológico (el extracto los muestra al revés).
 */
export const SALDO_INICIAL = -540013.94 // después del último movimiento del 03/07

export const MOVIMIENTOS = [
  { fecha: '2026-07-06', concepto: 'Echeq Clearing Recibido 48hs', importe: -893098.79, saldo: -1433112.73 },
  { fecha: '2026-07-06', concepto: 'Cheque Debitado', importe: -200000, saldo: -1633112.73 },
  { fecha: '2026-07-06', concepto: 'Compra Con Tarjeta De Debito - Zabala Repuestos', importe: -310000, saldo: -1943112.73 },
  { fecha: '2026-07-06', concepto: 'Pago Tarjeta De Credito Visa - Deb. Automatico', importe: -1264991.58, saldo: -3208104.31 },
  { fecha: '2026-07-06', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -16008.54, saldo: -3224112.85 },
  { fecha: '2026-07-07', concepto: 'Echeq Clearing Recibido 48hs', importe: -317000, saldo: -3541112.85 },
  { fecha: '2026-07-07', concepto: 'Echeq Clearing Recibido 48hs', importe: -383175, saldo: -3924287.85 },
  { fecha: '2026-07-07', concepto: 'Echeq Clearing Recibido 48hs', importe: -383175, saldo: -4307462.85 },
  { fecha: '2026-07-07', concepto: 'Echeq Clearing Recibido 48hs', importe: -383175, saldo: -4690637.85 },
  { fecha: '2026-07-07', concepto: 'Echeq Clearing Recibido 48hs', importe: -383175, saldo: -5073812.85 },
  { fecha: '2026-07-07', concepto: 'Prestamos Prendarios - 0179-039101464204', importe: -1282810.54, saldo: -6356623.39 },
  { fecha: '2026-07-07', concepto: 'Canje Interno Recibido 24 Hs', importe: -300000, saldo: -6656623.39 },
  { fecha: '2026-07-07', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -20595.06, saldo: -6677218.45 },
  { fecha: '2026-07-08', concepto: 'Echeq Clearing Recibido 48hs', importe: -1854564.14, saldo: -8531782.59 },
  { fecha: '2026-07-08', concepto: 'Echeq Clearing Recibido 48hs', importe: -1964635.58, saldo: -10496418.17 },
  { fecha: '2026-07-08', concepto: 'Debito Automatico - Sancor Cooperati', importe: -33596, saldo: -10530014.17 },
  { fecha: '2026-07-08', concepto: 'Compra Con Tarjeta De Debito - Villa Del Pino Sa', importe: -174000, saldo: -10704014.17 },
  { fecha: '2026-07-08', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -24160.77, saldo: -10728174.94 },
  { fecha: '2026-07-13', concepto: 'Compra Con Tarjeta De Debito - Appypf 2660 Combustible', importe: -99999.96, saldo: -10828174.90 },
  { fecha: '2026-07-13', concepto: 'Transferencia Inmediata - A El Carpincho Construcci', importe: -69500, saldo: -10897674.90 },
  { fecha: '2026-07-13', concepto: 'Debito Transf. Online Banking Emp - A Pedro Ward', importe: -62600, saldo: -10960274.90 },
  { fecha: '2026-07-13', concepto: 'Compra Con Tarjeta De Debito - Merpago*movistarlineam', importe: -361964.30, saldo: -11322239.20 },
  { fecha: '2026-07-13', concepto: 'Compra Con Tarjeta De Debito - Merpago*movistarhogar', importe: -48718.74, saldo: -11370957.94 },
  { fecha: '2026-07-13', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -3856.70, saldo: -11374814.64 },
  { fecha: '2026-07-14', concepto: 'Cobro De Interes Por Descubierto - Del 08/06/26 Al 07/07/26', importe: -252340.32, saldo: -11627154.96 },
  { fecha: '2026-07-14', concepto: 'Iva 10,5% Reg Trans Fisc Ley 27743', importe: -26495.73, saldo: -11653650.69 },
  { fecha: '2026-07-14', concepto: 'Iva Percep Rg 2408 Alic Reducida', importe: -3785.10, saldo: -11657435.79 },
  { fecha: '2026-07-14', concepto: 'Debito Automatico - Federacion Patronal', importe: -63853.49, saldo: -11721289.28 },
  { fecha: '2026-07-14', concepto: 'Transferencia Realizada - A David Esteban Botas Mer', importe: -369440, saldo: -12090729.28 },
  { fecha: '2026-07-14', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -4295.48, saldo: -12095024.76 },
  { fecha: '2026-07-16', concepto: 'Deposito E-cheq Int Misma Plaza', importe: 10000000, saldo: -2095024.76 },
  { fecha: '2026-07-16', concepto: 'Cheque Debitado', importe: -200000, saldo: -2295024.76 },
  { fecha: '2026-07-16', concepto: 'Cheque Debitado', importe: -200000, saldo: -2495024.76 },
  { fecha: '2026-07-16', concepto: 'Debito Automatico - Afip -30716304643', importe: -1034931.85, saldo: -3529956.61 },
  { fecha: '2026-07-16', concepto: 'Debito Automatico - Afip -30716304643', importe: -473767.08, saldo: -4003723.69 },
  { fecha: '2026-07-16', concepto: 'Debito Automatico - Federacion Patronal', importe: -9339.75, saldo: -4013063.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia Inmediata - A El Carpincho Construcci', importe: -26000, saldo: -4039063.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia Recibida - Credin - Cuit 30710630670', importe: 11913568.24, saldo: 7874504.80 },
  { fecha: '2026-07-16', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -11664.23, saldo: 7862840.57 },
  { fecha: '2026-07-16', concepto: 'Impuesto Ley 25.413 Credito 0,6%', importe: -131481.41, saldo: 7731359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito De Efectivo', importe: 6440000, saldo: 14171359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito De Efectivo', importe: 1520000, saldo: 15691359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito De Efectivo', importe: 2000000, saldo: 17691359.16 },
  { fecha: '2026-07-17', concepto: 'Pago De Haberes Por Cci', importe: -252200, saldo: 17439159.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia Inmediata - A Sanitarios Od Sas / Alq', importe: -290400, saldo: 17148759.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia Inmediata - A Jose Maria Robles / Hon', importe: -666268.31, saldo: 16482490.85 },
  { fecha: '2026-07-17', concepto: 'Transferencia Inmediata - A Gisela Agostina D Amico / Hon', importe: -230000, saldo: 16252490.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -238600, saldo: 16013890.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -267500, saldo: 15746390.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -256000, saldo: 15490390.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -258000, saldo: 15232390.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -250000, saldo: 14982390.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -256000, saldo: 14726390.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -253400, saldo: 14472990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -251000, saldo: 14221990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -277000, saldo: 13944990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -258000, saldo: 13686990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -248000, saldo: 13438990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -240000, saldo: 13198990.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -252350, saldo: 12946640.85 },
  { fecha: '2026-07-17', concepto: 'Pago Haberes - 260717507', importe: -217100, saldo: 12729540.85 },
  { fecha: '2026-07-17', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -29770.91, saldo: 12699769.94 },
  { fecha: '2026-07-17', concepto: 'Impuesto Ley 25.413 Credito 0,6%', importe: -59760, saldo: 12640009.94 },
  { fecha: '2026-07-20', concepto: 'Pago De Servicios - Imp.afip', importe: -4859763.28, saldo: 7780246.66 },
  { fecha: '2026-07-20', concepto: 'Transferencia Realizada - A Herrajes San Juan / Fac', importe: -750000, saldo: 7030246.66 },
  { fecha: '2026-07-20', concepto: 'Compra Con Tarjeta De Debito - Appypf 2660 Combustible', importe: -99999.96, saldo: 6930246.70 },
  { fecha: '2026-07-20', concepto: 'Canje Interno Recibido 24 Hs', importe: -200000, saldo: 6730246.70 },
  { fecha: '2026-07-20', concepto: 'Echeq Canje Interno Recibido 24hs', importe: -893098.79, saldo: 5837147.91 },
  { fecha: '2026-07-20', concepto: 'Impuesto Ley 25.413 Debito 0,6%', importe: -40817.17, saldo: 5796330.74 },
  { fecha: '2026-07-21', concepto: 'Cheque Debitado', importe: -200000, saldo: 5596330.74 },
]

/**
 * NÚCLEO PURO: recorre la cadena de saldos del extracto. Devuelve las filas donde el saldo no
 * cierra, o sea donde me equivoqué al transcribir. Vacío = la transcripción es exacta.
 */
export function verificarCadena(movs = MOVIMIENTOS, inicial = SALDO_INICIAL) {
  const rotas = []
  let saldo = inicial
  for (const m of movs) {
    saldo = Math.round((saldo + m.importe) * 100) / 100
    if (Math.abs(saldo - m.saldo) > 0.01) rotas.push({ ...m, calculado: saldo })
  }
  return { rotas, saldoFinal: saldo }
}

/** NÚCLEO PURO: agrupa el extracto por tipo de movimiento, para poder cruzarlo contra el Sheet. */
export function porTipo(movs = MOVIMIENTOS) {
  const clas = (c) => {
    if (/impuesto ley 25\.413/i.test(c)) return 'Impuesto al cheque (Ley 25.413)'
    if (/interes por descubierto|iva 10,5%|iva percep/i.test(c)) return 'Costo financiero del descubierto'
    if (/pago haberes|pago de haberes/i.test(c)) return 'Sueldos'
    if (/e-?cheq|cheque debitado|canje interno/i.test(c)) return 'Cheques y echeq'
    if (/afip|imp\.afip/i.test(c)) return 'AFIP'
    if (/prestamos prendarios/i.test(c)) return 'Préstamo prendario'
    if (/tarjeta de credito/i.test(c)) return 'Pago de la tarjeta'
    if (/deposito de efectivo|transferencia recibida/i.test(c)) return 'Ingresos'
    if (/tarjeta de debito/i.test(c)) return 'Compras con tarjeta de débito'
    if (/debito automatico/i.test(c)) return 'Débitos automáticos (seguros)'
    return 'Transferencias a proveedores'
  }
  const acc = new Map()
  for (const m of movs) {
    const k = clas(m.concepto)
    const a = acc.get(k) ?? { tipo: k, cantidad: 0, monto: 0 }
    a.cantidad++; a.monto += m.importe
    acc.set(k, a)
  }
  return [...acc.values()].sort((a, b) => a.monto - b.monto)
}

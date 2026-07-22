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

import { extraer } from './cuit.mjs'

/** El día y la hora de la foto. Todo lo de abajo es verdad A ESTA FECHA, no hoy. */
export const CORTE = '2026-07-22'
export const ORIGEN = 'Santander Empresas · extracto 22/06→22/07/2026 (descarga del 22/07 11:20) + captura del 21/07 para tarjeta, acuerdo y saldo USD'

/** La cuenta operativa. Es la única del banco. */
export const CUENTA = {
  banco: 'Banco Santander',
  numero: '179-091383/6',
  sucursal: '0179 San Juan',
  // El saldo que el banco DECLARA. Es el que manda para la disponibilidad. Actualizado a la descarga
  // de las 15:50 del 22/07 (más fresca que la de las 11:20, que declaraba $5.251.630,74): entre las
  // dos, "Movimientos del Día" agregó dos operaciones nuevas —transf. recibida de Manufacturas
  // Químicas +$4.267,49 y transf. a Katsuda Gustavo −$270.000— y $5.251.630,74 + $4.267,49 − $270.000
  // = $4.985.898,23 EXACTO. El intradía cierra al peso contra el declarado anterior.
  saldoPesos: 4985898.23,
  // Dónde termina la cadena de saldos del detalle transcripto (último movimiento con saldo: la
  // compra Vono del 22/07). NO coincide con el declarado: contra el detalle, el día tuvo el cheque
  // Nº 221 (−$200.000), la transf. a Katsuda (−$270.000) y la recibida de Manufacturas (+$4.267,49)
  // —todos "Movimientos del Día" sin saldo corrido— y queda una diferencia de −$143.500 que ninguna
  // línea del extracto muestra (retención/hold intradía). Total a conciliar: −$609.232,51. No se
  // inventa el movimiento faltante: los $143.500 son el único tramo que el banco no explica.
  saldoUltimoMovimiento: 5595130.74,
  saldoPendienteConciliar: -609232.51,
  saldoDolares: 581.39, // de la captura del 21/07; no se recapturó el 22/07
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
// EL EXTRACTO, MOVIMIENTO POR MOVIMIENTO (22/06 al 22/07/2026). Reescrito el 22/07 desde el extracto
// descargado del Santander (reemplaza la transcripción parcial 06→21/07): más largo, más detallado y
// con la ventana que captura los costos bancarios de fin de junio. Sigue siendo una RÉPLICA con
// origen y corte. La cadena de saldos (saldo(n)=saldo(n−1)+importe(n)) la verifica el test y termina
// en $5.595.130,74 — el último saldo que el detalle del extracto muestra.
export const SALDO_INICIAL = -169586.65

export const MOVIMIENTOS = [
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A gisela agostina d amico / - fac / 27326890397', importe: -230000, saldo: -399586.65 },
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A sanitarios od sas / - fac / 33716650249', importe: -580800, saldo: -980386.65 },
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -63503.22, saldo: -1043889.87 },
  { fecha: '2026-06-22', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -5245.82, saldo: -1049135.69 },
  { fecha: '2026-06-23', concepto: 'Compra con tarjeta de debito - Merpago*cpcesj - tarj nro. 6077', importe: -865000, saldo: -1914135.69 },
  { fecha: '2026-06-23', concepto: 'Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077', importe: -47670, saldo: -1961805.69 },
  { fecha: '2026-06-23', concepto: 'Transferencia inmediata - A francisco adan alvarez / - var / 20256865913', importe: -55500, saldo: -2017305.69 },
  { fecha: '2026-06-23', concepto: 'Transferencia inmediata - A matias ivan cobos / - var / 24365438826', importe: -55057.26, saldo: -2072362.95 },
  { fecha: '2026-06-23', concepto: 'Transferencia realizada - A montoya claudio daniel / - var / 24358530598', importe: -185000, saldo: -2257362.95 },
  { fecha: '2026-06-23', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -7249.36, saldo: -2264612.31 },
  { fecha: '2026-06-24', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -161626, saldo: -2426238.31 },
  { fecha: '2026-06-24', concepto: 'Compra con tarjeta de debito - Merpago*esteticaericapala - tarj nro. 2871', importe: -150000, saldo: -2576238.31 },
  { fecha: '2026-06-24', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1869.76, saldo: -2578108.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -2778108.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -2978108.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -3178108.07 },
  { fecha: '2026-06-25', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.99, saldo: -3278108.06 },
  { fecha: '2026-06-25', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -4200, saldo: -3282308.06 },
  { fecha: '2026-06-29', concepto: 'Echeq clearing recibido 48hs', importe: -3500000, saldo: -6782308.06 },
  { fecha: '2026-06-29', concepto: 'Comision por servicio de cuenta', importe: -69000, saldo: -6851308.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -14490, saldo: -6865798.06 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -2070, saldo: -6867868.06 },
  { fecha: '2026-06-29', concepto: 'Comision mensual de movs clearing', importe: -8000, saldo: -6875868.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -1680, saldo: -6877548.06 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -240, saldo: -6877788.06 },
  { fecha: '2026-06-29', concepto: 'Comision servicio cuenta dolares', importe: -14770, saldo: -6892558.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -3101.7, saldo: -6895659.76 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -443.1, saldo: -6896102.86 },
  { fecha: '2026-06-29', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -54043.44, saldo: -6950146.3 },
  { fecha: '2026-06-29', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -22007.03, saldo: -6972153.33 },
  { fecha: '2026-06-30', concepto: 'Pago haberes - 260630507', importe: -344401.2, saldo: -7316554.53 },
  { fecha: '2026-06-30', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -2066.41, saldo: -7318620.94 },
  { fecha: '2026-07-01', concepto: 'Deposito e-cheq int misma plaza', importe: 15000000, saldo: 7681379.06 },
  { fecha: '2026-07-01', concepto: 'Compra con tarjeta de debito - Mercpago*appypfcomb - tarj nro. 6077', importe: -143802.01, saldo: 7537577.05 },
  { fecha: '2026-07-01', concepto: 'Compra con tarjeta de debito - Appypf 31155 tienda - tarj nro. 6077', importe: -7800, saldo: 7529777.05 },
  { fecha: '2026-07-01', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -37000, saldo: 7492777.05 },
  { fecha: '2026-07-01', concepto: 'Transferencia inmediata - A yuliana cintia fernande / - var / 27484157214', importe: -325000, saldo: 7167777.05 },
  { fecha: '2026-07-01', concepto: 'Compra en el exterior - Google workspace ecsas.co - tarj nro. 6077', importe: -37926, saldo: 7129851.05 },
  { fecha: '2026-07-01', concepto: 'Percep perc rg 5617 30% o suj - Google workspace ecsas.co - tarj nro. 6077', importe: -11203.92, saldo: 7118647.13 },
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1807057.16, saldo: 5311589.97 },
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1938254.35, saldo: 3373335.62 },
  { fecha: '2026-07-01', concepto: 'Anul imp ley 25.413 debito 0,6%', importe: 294.78, saldo: 3373630.4 },
  { fecha: '2026-07-01', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -90000, saldo: 3283630.4 },
  { fecha: '2026-07-01', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -26143.04, saldo: 3257487.36 },
  { fecha: '2026-07-02', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -63503.22, saldo: 3193984.14 },
  { fecha: '2026-07-02', concepto: 'Debito transf. online banking emp', importe: -1000000, saldo: 2193984.14 },
  { fecha: '2026-07-02', concepto: 'Pago de honorarios - 260702507', importe: -2000000, saldo: 193984.14 },
  { fecha: '2026-07-02', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -18381.02, saldo: 175603.12 },
  { fecha: '2026-07-03', concepto: 'Debito automatico - Sancor cooperati', importe: -31737, saldo: 143866.12 },
  { fecha: '2026-07-03', concepto: 'Debito automatico - Federacion patro', importe: -536967.83, saldo: -393101.71 },
  { fecha: '2026-07-03', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3412.23, saldo: -396513.94 },
  { fecha: '2026-07-06', concepto: 'Echeq clearing recibido 48hs', importe: -893098.79, saldo: -1289612.73 },
  { fecha: '2026-07-06', concepto: 'Cheque debitado', importe: -200000, saldo: -1489612.73 },
  { fecha: '2026-07-06', concepto: 'Compra con tarjeta de debito - Zabala repuestos - tarj nro. 6077', importe: -310000, saldo: -1799612.73 },
  { fecha: '2026-07-06', concepto: 'Pago tarjeta de credito visa - Deb. automatico 06/07/2026', importe: -1264991.58, saldo: -3064604.31 },
  { fecha: '2026-07-06', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -16008.54, saldo: -3080612.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -317000, saldo: -3397612.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -3780787.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -4163962.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -4547137.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -4930312.85 },
  { fecha: '2026-07-07', concepto: 'Prestamos prendarios - 0179-039101464204', importe: -1282810.54, saldo: -6213123.39 },
  { fecha: '2026-07-07', concepto: 'Canje interno recibido 24 hs', importe: -300000, saldo: -6513123.39 },
  { fecha: '2026-07-07', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -20595.06, saldo: -6533718.45 },
  { fecha: '2026-07-08', concepto: 'Echeq clearing recibido 48hs', importe: -1854564.14, saldo: -8388282.59 },
  { fecha: '2026-07-08', concepto: 'Echeq clearing recibido 48hs', importe: -1964635.58, saldo: -10352918.17 },
  { fecha: '2026-07-08', concepto: 'Debito automatico - Sancor cooperati', importe: -33596, saldo: -10386514.17 },
  { fecha: '2026-07-08', concepto: 'Compra con tarjeta de debito - Villa del pino sa - tarj nro. 8866', importe: -174000, saldo: -10560514.17 },
  { fecha: '2026-07-08', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -24160.77, saldo: -10584674.94 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.96, saldo: -10684674.9 },
  { fecha: '2026-07-13', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -69500, saldo: -10754174.9 },
  { fecha: '2026-07-13', concepto: 'Debito transf. online banking emp - A pedro ward / - var / 23280102199', importe: -62600, saldo: -10816774.9 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Merpago*movistarlineam - tarj nro. 6077', importe: -361964.3, saldo: -11178739.2 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Merpago*movistarhogar - tarj nro. 6077', importe: -48718.74, saldo: -11227457.94 },
  { fecha: '2026-07-13', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3856.7, saldo: -11231314.64 },
  { fecha: '2026-07-14', concepto: 'Cobro de interes por descubierto - Del 08/06/26 al 07/07/26', importe: -252340.32, saldo: -11483654.96 },
  { fecha: '2026-07-14', concepto: 'Iva 10,5% reg trans fisc ley 27743', importe: -26495.73, saldo: -11510150.69 },
  { fecha: '2026-07-14', concepto: 'Iva percep rg 2408 alic reducida', importe: -3785.1, saldo: -11513935.79 },
  { fecha: '2026-07-14', concepto: 'Debito automatico - Federacion patro', importe: -63853.49, saldo: -11577789.28 },
  { fecha: '2026-07-14', concepto: 'Transferencia realizada - A david esteban botas mer / - var / 20353186877', importe: -369440, saldo: -11947229.28 },
  { fecha: '2026-07-14', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -4295.48, saldo: -11951524.76 },
  { fecha: '2026-07-16', concepto: 'Deposito e-cheq int misma plaza', importe: 10000000, saldo: -1951524.76 },
  { fecha: '2026-07-16', concepto: 'Cheque debitado', importe: -200000, saldo: -2151524.76 },
  { fecha: '2026-07-16', concepto: 'Cheque debitado', importe: -200000, saldo: -2351524.76 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Afip -30716304643', importe: -1034931.85, saldo: -3386456.61 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Afip -30716304643', importe: -473767.08, saldo: -3860223.69 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Federacion patro', importe: -9339.75, saldo: -3869563.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -26000, saldo: -3895563.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia recibida - credin - Id debin cuit 30710630670', importe: 11913568.24, saldo: 8018004.8 },
  { fecha: '2026-07-16', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -11664.23, saldo: 8006340.57 },
  { fecha: '2026-07-16', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -131481.41, saldo: 7874859.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 6440000, saldo: 14314859.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 1520000, saldo: 15834859.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 2000000, saldo: 17834859.16 },
  { fecha: '2026-07-17', concepto: 'Pago de haberes por cci - &&000000000000001', importe: -252200, saldo: 17582659.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A sanitarios od sas / - alq / 33716650249', importe: -290400, saldo: 17292259.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A jose maria robles / - hon / 20379240195', importe: -666268.31, saldo: 16625990.85 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A gisela agostina d amico / - hon / 27326890397', importe: -230000, saldo: 16395990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -238600, saldo: 16157390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -267500, saldo: 15889890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -256000, saldo: 15633890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -258000, saldo: 15375890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -250000, saldo: 15125890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -256000, saldo: 14869890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -253400, saldo: 14616490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -251000, saldo: 14365490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -277000, saldo: 14088490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -258000, saldo: 13830490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -248000, saldo: 13582490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -240000, saldo: 13342490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -252350, saldo: 13090140.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -217100, saldo: 12873040.85 },
  { fecha: '2026-07-17', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -29770.91, saldo: 12843269.94 },
  { fecha: '2026-07-17', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -59760, saldo: 12783509.94 },
  { fecha: '2026-07-20', concepto: 'Pago de servicios - Imp.afip: 3071630464311793242 - tarj nro. 3537', importe: -4859763.28, saldo: 7923746.66 },
  { fecha: '2026-07-20', concepto: 'Transferencia realizada - A herrajes san juan / - fac / 30718775406', importe: -750000, saldo: 7173746.66 },
  { fecha: '2026-07-20', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.96, saldo: 7073746.7 },
  { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, saldo: 6873746.7 },
  { fecha: '2026-07-20', concepto: 'Echeq canje interno recibido 24hs', importe: -893098.79, saldo: 5980647.91 },
  { fecha: '2026-07-20', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -40817.17, saldo: 5939830.74 },
  { fecha: '2026-07-21', concepto: 'Cheque debitado', importe: -200000, saldo: 5739830.74 },
  { fecha: '2026-07-21', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1200, saldo: 5738630.74 },
  { fecha: '2026-07-22', concepto: 'Compra con tarjeta de debito - Vono - tarj nro. 6077', importe: -143500, saldo: 5595130.74 },
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

/**
 * NÚCLEO PURO: la naturaleza de UN movimiento, por su concepto.
 *
 * SE EXTRAJO DE `porTipo` (21/07) para poder escribirla en la réplica. Estaba adentro de una función
 * que agrupa, así que la clasificación existía sólo en memoria y en un total: el cuadro de CAJA no
 * podía preguntarle a _BANCO_RAW "cuánto salió en cheques" sin que alguien lo calculara afuera y lo
 * pegara. Con la naturaleza escrita en su columna, ese cuadro pasa a ser un SUMIF.
 *
 * Es la pregunta que ninguna búsqueda contesta: el banco dice "Transferencia Realizada - A Herrajes
 * S" y de eso hay que deducir que es un pago a proveedor y que tiene que estar en Compras.
 */
export function clasificarMovimiento(concepto = '') {
  const c = String(concepto)
  if (/impuesto ley 25\.413/i.test(c)) return 'Impuesto al cheque (Ley 25.413)'
  if (/interes por descubierto|iva 10,5%|iva percep/i.test(c)) return 'Costo financiero del descubierto'
  if (/pago haberes|pago de haberes/i.test(c)) return 'Sueldos'
  if (/e-?cheq|cheque debitado|canje interno/i.test(c)) return 'Cheques y echeq'
  if (/afip|imp\.afip/i.test(c)) return 'AFIP'
  if (/prestamos prendarios/i.test(c)) return 'Préstamo prendario'
  if (/tarjeta de credito/i.test(c)) return 'Pago de la tarjeta'
  if (/deposito de efectivo|transferencia recibida/i.test(c)) {
    const n = naturalezaIngreso({ concepto: c })
    return n === 'cobranza' ? 'Cobranzas de clientes'
      : n === 'financiero' ? 'Rescates de inversión y financiero'
      : 'Traslados de fondos propios (no es ingreso)'
  }
  if (/tarjeta de debito/i.test(c)) return 'Compras con tarjeta de débito'
  if (/debito automatico/i.test(c)) return 'Débitos automáticos (seguros)'
  return 'Transferencias a proveedores'
}

/** NÚCLEO PURO: agrupa el extracto por tipo de movimiento, para poder cruzarlo contra el Sheet. */
export function porTipo(movs = MOVIMIENTOS) {
  const clas = (c) => clasificarMovimiento(c)
  const _viejo = (c) => {
    if (/impuesto ley 25\.413/i.test(c)) return 'Impuesto al cheque (Ley 25.413)'
    if (/interes por descubierto|iva 10,5%|iva percep/i.test(c)) return 'Costo financiero del descubierto'
    if (/pago haberes|pago de haberes/i.test(c)) return 'Sueldos'
    if (/e-?cheq|cheque debitado|canje interno/i.test(c)) return 'Cheques y echeq'
    if (/afip|imp\.afip/i.test(c)) return 'AFIP'
    if (/prestamos prendarios/i.test(c)) return 'Préstamo prendario'
    if (/tarjeta de credito/i.test(c)) return 'Pago de la tarjeta'
    // Un crédito NO es automáticamente un ingreso: puede ser plata propia cambiando de lugar.
    if (/deposito de efectivo|transferencia recibida/i.test(c)) {
      const n = naturalezaIngreso({ concepto: c })
      return n === 'cobranza' ? 'Cobranzas de clientes'
        : n === 'financiero' ? 'Rescates de inversión y financiero'
        : 'Traslados de fondos propios (no es ingreso)'
    }
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

/**
 * LOS ECHEQ QUE LA EMPRESA EMITIÓ, según el banco.
 *
 * POR QUÉ HACEN FALTA (21/07). El dueño: "¿toda la información bancaria en referencia a cheques fue
 * cruzada con las deudas a los proveedores?". No lo estaba: se cruzaban los cheques de la pestaña
 * contra Compras por número de comprobante —o sea, si el pago tenía factura— pero nadie miraba lo
 * contrario, que es la pregunta de tesorería: a quién le debo y con qué instrumento.
 *
 * Un cheque emitido y no debitado es una deuda con ese proveedor que YA tiene instrumento entregado.
 * No es lo mismo que una deuda sin cheque: la primera tiene fecha cierta y no se puede negociar, la
 * segunda sí. Cruzarlas es la única forma de saber cuál de las dos es cada peso que se debe.
 *
 * ALCANCE: lista COMPLETA de la consulta de echeq emitidos (captura del 22/07). 38 echeq. Los únicos
 * que todavía no salieron de la cuenta son los tres de NEUMAGOM en estado "Aceptado" (vencen ago/sep/
 * oct) — el resto está Pagado. Dos casos muertos: el 228 Anulado y el 281 Repudiado (ese 281 es un
 * duplicado del 282, misma fecha e importe: se emitió dos veces y uno se rechazó).
 */
export const ECHEQS_EMITIDOS = [
  { numero: '00000309', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-10-03', importe: 317000, estado: 'Aceptado' },
  { numero: '00000308', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-09-03', importe: 317000, estado: 'Aceptado' },
  { numero: '00000307', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-08-03', importe: 317000, estado: 'Aceptado' },
  { numero: '00000305', beneficiario: 'ALUMETAL S.A', cuit: '30567363372', pago: '2026-07-18', importe: 893098.79, estado: 'Pagado' },
  { numero: '00000299', beneficiario: 'ACEROLATINA SA', cuit: '30712167986', pago: '2026-07-07', importe: 1964635.58, estado: 'Pagado' },
  { numero: '00000295', beneficiario: 'FRIOLATINA SA', cuit: '30679777986', pago: '2026-07-07', importe: 1854564.14, estado: 'Pagado' },
  { numero: '00000361', beneficiario: 'MADERAS LLITERAS S.R.L', cuit: '30708390557', pago: '2026-07-04', importe: 383175, estado: 'Pagado' },
  { numero: '00000362', beneficiario: 'MADERAS LLITERAS S.R.L', cuit: '30708390557', pago: '2026-07-04', importe: 383175, estado: 'Pagado' },
  { numero: '00000360', beneficiario: 'MADERAS LLITERAS S.R.L', cuit: '30708390557', pago: '2026-07-04', importe: 383175, estado: 'Pagado' },
  { numero: '00000363', beneficiario: 'MADERAS LLITERAS S.R.L', cuit: '30708390557', pago: '2026-07-04', importe: 383175, estado: 'Pagado' },
  { numero: '00000304', beneficiario: 'ALUMETAL S.A', cuit: '30567363372', pago: '2026-07-03', importe: 893098.79, estado: 'Pagado' },
  { numero: '00000306', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-07-03', importe: 317000, estado: 'Pagado' },
  { numero: '00000302', beneficiario: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20287737824', pago: '2026-06-26', importe: 3500000, estado: 'Pagado' },
  { numero: '00000303', beneficiario: 'ALUMETAL S.A', cuit: '30567363372', pago: '2026-06-18', importe: 893098.79, estado: 'Pagado' },
  { numero: '00000294', beneficiario: 'FRIOLATINA SA', cuit: '30679777986', pago: '2026-06-07', importe: 1854564.14, estado: 'Pagado' },
  { numero: '00000298', beneficiario: 'ACEROLATINA SA', cuit: '30712167986', pago: '2026-06-07', importe: 1964635.58, estado: 'Pagado' },
  { numero: '00000301', beneficiario: 'PANEL NOW S.A.S', cuit: '30716236338', pago: '2026-05-16', importe: 1058842.99, estado: 'Pagado' },
  { numero: '00000291', beneficiario: 'MARIANA SA', cuit: '30691852071', pago: '2026-05-08', importe: 201075.38, estado: 'Pagado' },
  { numero: '00000293', beneficiario: 'FRIOLATINA SA', cuit: '30679777986', pago: '2026-05-07', importe: 1854564.14, estado: 'Pagado' },
  { numero: '00000297', beneficiario: 'ACEROLATINA SA', cuit: '30712167986', pago: '2026-05-07', importe: 1964635.58, estado: 'Pagado' },
  { numero: '00000292', beneficiario: 'FRIOLATINA SA', cuit: '30679777986', pago: '2026-04-24', importe: 3709128.31, estado: 'Pagado' },
  { numero: '00000296', beneficiario: 'ACEROLATINA SA', cuit: '30712167986', pago: '2026-04-24', importe: 3929271.16, estado: 'Pagado' },
  { numero: '00000300', beneficiario: 'PANEL NOW S.A.S', cuit: '30716236338', pago: '2026-04-24', importe: 1058842.99, estado: 'Pagado' },
  { numero: '00000286', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-04-07', importe: 130486.67, estado: 'Pagado' },
  { numero: '00000290', beneficiario: 'JLF SAS', cuit: '30717023664', pago: '2026-03-25', importe: 826000, estado: 'Pagado' },
  { numero: '00000289', beneficiario: 'JORGE ROBERTO MARTINEZ', cuit: '20111183415', pago: '2026-03-13', importe: 1080100, estado: 'Pagado' },
  { numero: '00000285', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-03-07', importe: 130486.67, estado: 'Pagado' },
  { numero: '00000288', beneficiario: 'JORGE ROBERTO MARTINEZ', cuit: '20111183415', pago: '2026-02-27', importe: 1080100, estado: 'Pagado' },
  { numero: '00000287', beneficiario: 'JORGE ROBERTO MARTINEZ', cuit: '20111183415', pago: '2026-02-11', importe: 1080100, estado: 'Pagado' },
  { numero: '00000232', beneficiario: 'BULONERA RAWSON SRL', cuit: '30712540814', pago: '2026-02-08', importe: 265000, estado: 'Pagado' },
  { numero: '00000284', beneficiario: 'NEUMAGOM SAS', cuit: '30691853825', pago: '2026-02-07', importe: 130486.67, estado: 'Pagado' },
  { numero: '00000282', beneficiario: 'ROBLES PINTURERIAS', cuit: '30711355223', pago: '2026-02-06', importe: 255644.73, estado: 'Pagado' },
  { numero: '00000281', beneficiario: 'ROBLES PINTURERIAS', cuit: '30711355223', pago: '2026-02-06', importe: 255644.73, estado: 'Repudiado' },
  { numero: '00000283', beneficiario: 'ROBLES PINTURERIAS', cuit: '30711355223', pago: '2026-02-05', importe: 24143.13, estado: 'Pagado' },
  { numero: '00000280', beneficiario: 'SEGAL SERVICIOS INTEGRALES SAS', cuit: '30716912732', pago: '2026-01-31', importe: 321656.30, estado: 'Pagado' },
  { numero: '00000228', beneficiario: 'SOSTEN SA', cuit: '30711577390', pago: '2026-01-28', importe: 593734.25, estado: 'Anulado' },
  { numero: '00000174', beneficiario: 'HORMISERV SRL', cuit: '30681641730', pago: '2026-01-24', importe: 4600823.33, estado: 'Pagado' },
  { numero: '00000277', beneficiario: 'DUBOS UGARTE PEDRO LUIS RAUL', cuit: '20287737824', pago: '2026-01-22', importe: 1002330.72, estado: 'Pagado' },
]

/** Estados que significan "todavía no salió de la cuenta": es un compromiso vivo. */
const VIVOS = new Set(['emitido', 'aceptado'])

/** NÚCLEO PURO: los echeq emitidos que todavía hay que cubrir, por beneficiario. */
export function compromisosPorBeneficiario(echeqs = ECHEQS_EMITIDOS) {
  const acc = new Map()
  for (const e of echeqs) {
    if (!VIVOS.has(String(e.estado ?? '').toLowerCase())) continue
    const a = acc.get(e.beneficiario) ?? { beneficiario: e.beneficiario, cuit: e.cuit, cantidad: 0, monto: 0, proximo: null }
    a.cantidad++; a.monto += Number(e.importe) || 0
    if (!a.proximo || e.pago < a.proximo) a.proximo = e.pago
    acc.set(e.beneficiario, a)
  }
  return [...acc.values()].sort((a, b) => b.monto - a.monto)
}

/**
 * NÚCLEO PURO: dos nombres de proveedor, ¿son el mismo?
 * El banco escribe "NEUMAGOM SAS" y Compras "Neumagom". Sin normalizar, el cruce da cero y la
 * conclusión sería "no hay ningún cheque que corresponda a una deuda", que es falso.
 */
export const normProveedor = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/\bS\.?\s?A\.?\s?S\.?\b|\bS\.?\s?A\.?\b|\bS\.?R\.?L\.?\b|\bSAS\b/g, '')
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()

/**
 * NÚCLEO PURO: cuánto EFECTIVO se depositó, según el extracto.
 *
 * POR QUÉ IMPORTA (21/07). Un cobro en efectivo que no se deposita tiene que estar en la caja
 * física. Contrastar lo cobrado en efectivo contra lo depositado es lo único que dice si el
 * efectivo declarado es plausible — y al 21/07 no lo era: $58.615.646 cobrados en efectivo entre el
 * 06 y el 21/07 contra $9.960.000 depositados y $1.725.000 declarados en caja.
 *
 * ALCANCE DECLARADO: el extracto cubre del 06 al 21/07. Lo depositado ANTES de esa fecha no está
 * acá, así que la diferencia que se calcule con este número está SOBREESTIMADA. Se informa igual
 * porque el orden de magnitud ya dice algo; taparlo hasta tener el extracto completo sería esconder
 * un problema de $46M detrás de una precisión que no hace falta para verlo.
 */
export function depositosEfectivo(movs = MOVIMIENTOS) {
  return movs
    .filter((m) => m.importe > 0 && /dep[oó]sito\s+de\s+efectivo/i.test(String(m.concepto ?? '')))
    .reduce((s, m) => s + m.importe, 0)
}

/** NÚCLEO PURO: los créditos del extracto agrupados por concepto, para saber de dónde entró la plata. */
export function ingresosPorConcepto(movs = MOVIMIENTOS) {
  const acc = new Map()
  for (const m of movs.filter((x) => x.importe > 0)) {
    const k = String(m.concepto ?? '').trim()
    const a = acc.get(k) ?? { concepto: k, n: 0, total: 0 }
    a.n++; a.total += m.importe
    acc.set(k, a)
  }
  return [...acc.values()].sort((a, b) => b.total - a.total)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL BANCO NO DISTINGUE UN INGRESO DE UN TRASLADO DE PLATA PROPIA. ACÁ SE DISTINGUE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ (21/07). El OS reportó "una transferencia de $11.913.568 del 16/07 que Cobranzas no tiene
// y que no aparece en el libro de ventas de ARCA". El dueño contestó qué era: el RESCATE DE UNA
// INVERSIÓN en la plataforma Balanz. No es una venta ni un cobro — es plata de la empresa que estaba
// invertida y volvió a la cuenta corriente.
//
// Es exactamente el mismo error que el de los $16.200.000 de San Francisco, que se habían cargado
// dos veces en Cobranzas: al cobrarlos en efectivo y otra vez al depositarlos en el banco. Mover
// plata de un bolsillo propio a otro NO ES UN INGRESO. Contarlo como tal infla el cash flow con plata
// que ya estaba.
//
// El extracto tiene tres naturalezas distintas mezcladas en la columna de créditos:
//
//   COBRANZA  → un cliente pagó. Tiene que estar en Cobranzas con esta fecha.
//   TRASLADO  → plata propia que cambia de lugar (depósito de efectivo, acreditación de un echeq que
//               ya estaba en cartera). El ingreso económico ocurrió ANTES, con otra fecha, y ya está
//               registrado. Comparar esto contra Cobranzas de la misma ventana da una diferencia
//               falsa.
//   FINANCIERO → rescate de una inversión, desembolso de un préstamo. Nunca es ingreso operativo.
//
// ═══ EL HALLAZGO QUE DEJA ESTE CASO ═══
//
// Si hubo un rescate de $11.913.568 en Balanz, la empresa TIENE (o tenía) una cuenta de inversión
// que el cuadro de disponibilidades no muestra en ningún lado. Cuánto queda ahí es un dato que el OS
// no posee y que no se inventa: se pide. Y el rendimiento de esa inversión SÍ es un ingreso
// financiero real, que hoy no está en ninguna línea del P&L porque nadie sabe cuál fue el capital.

/** Contrapartes conocidas por CUIT. El nombre se resuelve con `cuit_razon_social`; lo que se declara
 *  acá es la NATURALEZA del movimiento, que ninguna búsqueda puede contestar. */
export const CONTRAPARTES = new Map([
  ['30710630670', {
    nombre: 'BALANZ CAPITAL VALORES S.A.U.',
    naturaleza: 'financiero',
    // Confirmado por el dueño el 21/07. Sin esa confirmación esto sería una inferencia.
    detalle: 'plataforma de inversión — un crédito de acá es el RESCATE de una inversión propia, no un cobro',
    origen: 'razón social por búsqueda en internet (21/07); naturaleza confirmada por el dueño',
  }],
])

/**
 * NÚCLEO PURO: ¿qué es este crédito del extracto?
 * @returns {'cobranza'|'traslado'|'financiero'}
 */
export function naturalezaIngreso(mov) {
  const c = String(mov?.concepto ?? '')
  // 1) Por CUIT: es lo único que identifica a la contraparte sin ambigüedad. `extraer` valida el
  //    dígito verificador, así que un número de lote de once cifras no puede hacerse pasar por uno.
  for (const cuit of extraer(c)) { const i = CONTRAPARTES.get(cuit); if (i) return i.naturaleza }
  // 2) Plata propia cambiando de lugar.
  if (/dep[oó]sito\s+de\s+efectivo/i.test(c)) return 'traslado'
  if (/dep[oó]sito\s+e-?cheq|acreditaci[oó]n\s+de\s+cheque/i.test(c)) return 'traslado'
  // 3) Un crédito que GENERA el banco (reversa de un impuesto, ajuste) no es un cobro de un cliente:
  //    contarlo como cobranza ensuciaría la comparación contra Cobranzas. Ej. "Anul imp ley 25.413".
  if (/impuesto ley 25\.413|anul imp\b|\biva\b|comision|percep/i.test(c)) return 'traslado'
  // 4) Todo lo demás que entra es, hasta prueba en contrario, un cobro de un cliente.
  return 'cobranza'
}

/**
 * NÚCLEO PURO: los créditos del extracto separados por naturaleza.
 *
 * `cobranza` es el ÚNICO grupo que se puede comparar contra Cobranzas en la misma ventana. Los otros
 * dos, comparados, inventan una diferencia: eso es lo que hizo que el OS reportara $11,9M
 * "faltantes" que nunca faltaron.
 */
export function ingresosPorNaturaleza(movs = MOVIMIENTOS) {
  const out = { cobranza: [], traslado: [], financiero: [] }
  for (const m of movs.filter((x) => x.importe > 0)) out[naturalezaIngreso(m)].push(m)
  const tot = (l) => l.reduce((s, m) => s + m.importe, 0)
  return {
    ...out,
    totales: { cobranza: tot(out.cobranza), traslado: tot(out.traslado), financiero: tot(out.financiero) },
  }
}

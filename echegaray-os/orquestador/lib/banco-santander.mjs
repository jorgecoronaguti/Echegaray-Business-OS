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
import { esMovimientoDeCheques } from './cheques-debito-banco.mjs'

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
  // 05/08/2026: el dueño depositó los U$S 15.400 de la caja física (arqueo USD quedó en 0) y el
  // mismo día salieron U$S 15.000 a Balanz. Las DOS patas están probadas por el extracto de pesos
  // del 06/08: el impuesto 25.413 de la cuenta 179-091384/3 declara "base impo. usd 15.400" (crédito)
  // y "base impo. usd 15.000" (débito), y la comisión del 06/08 confirma el depósito. El destino
  // Balanz lo confirmó el dueño. 581,39 + 15.400 − 15.000 = 981,39. Cuando llegue el extracto USD,
  // este número se verifica contra él.
  saldoDolares: 981.39,
  corteDolares: '2026-08-05',
}

/**
 * LA POSICIÓN EN BALANZ — LOS APORTES PROBADOS, NO EL TOTAL DE LA CUENTA.
 *
 * 05/08/2026, extracto Santander: "Transferencia inmediata - A balanz capital valores / inv /
 * 30710630670" por $22.530.000, y U$S 15.000 desde la cuenta USD (probado por la base imponible del
 * 25.413; destino confirmado por el dueño). Plata de la empresa que cambió de lugar: sacarla del
 * banco sin darle una fila la hacía desaparecer del total de disponibilidades.
 *
 * GAP DECLARADO: esto es el APORTE de ese día, no la posición total de Balanz — el 16/07 hubo un
 * rescate de $11.913.568, así que la cuenta existía antes y puede tener tenencias previas y
 * rendimientos que acá no están. Sin el extracto de Balanz no se inventan: cuando el dueño lo
 * traiga, estos números se reemplazan por la posición declarada por Balanz.
 */
export const BALANZ = {
  ars: 22530000,
  usd: 15000,
  corte: '2026-08-05',
  cuit: '30710630670',
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
// ═══ LA FOTO DEL 29/07 ESTABA EN LA PESTAÑA Y NO EN EL NÚCLEO (04/08) ═══
//
// Hasta hoy esto tenía la foto del 22/07 mientras la pestaña "Tarjeta de Credito" mostraba, escrita
// a mano en sus celdas, una LECTURA MÁS NUEVA: "Detalle de Tarjeta del Santander al 29/07/2026".
// Dos verdades del mismo concepto, y la del código era la vieja. El rediseño de la pestaña la iba a
// pisar con datos de una semana antes — o sea, iba a hacer retroceder la información.
//
// Se transcribe la del 29/07, que es la que el dueño tiene del banco. No se inventa nada: cada cifra
// sale de una celda suya y el `al` declara a qué día corresponde.
//
// EL NÚMERO DE TARJETA CAMBIA DE FORMA, NO DE TARJETA. El resumen del 22/07 la identificaba como
// "Visa 921127486 Business" (el número de contrato) y el del 29/07 como "Visa terminada en 3319"
// (los últimos cuatro dígitos del plástico), titular "Echegaray, Oviedo Ro". No son datos
// contradictorios sino dos formas de nombrar lo mismo, así que se conservan LAS DOS: perder una
// obliga a adivinar la próxima vez que el banco use la otra.
//
// SIGUE SIENDO UNA CONSTANTE CAPTURADA A MANO — el gap declarado. No hay puerta de carga para el
// resumen de la tarjeta como sí la hay para los movimientos (importar-banco.mjs). Por eso `al`:
// la pestaña muestra la antigüedad y avisa cuando la foto envejece.
export const TARJETA = {
  cuenta: 'Visa terminada en 3319 · Business',
  contrato: 'Visa 921127486',
  titular: 'Echegaray, Oviedo Ro',
  al: '2026-07-29',
  limite: 10000000,
  consumidoPesos: 24000,
  // EL RESUMEN DEL 29/07 NO TRAE LÍNEA EN DÓLARES, Y ESO NO ES UN CERO. El último dato que el banco
  // reportó es el del 22/07: U$S 193,25 sin debitar. Ponerlo en 0 sería afirmar que se pagó, que es
  // un hecho que nadie declaró — y de hecho hacía desaparecer la línea de la pestaña. Se conserva
  // con SU fecha, que es distinta de la del resto de la foto y por eso se declara aparte.
  consumidoDolares: 193.25,
  consumidoDolaresAl: '2026-07-22',
  // El resumen del 29/07 los separa: lo consumido y lo que todavía no confirmó el comercio.
  pendienteDeConfirmacion: 32500,
  disponible: 8693073.70,
  cierra: '2026-08-20',
  vence: '2026-09-01',
  debitoAutomatico: 'CC en pesos 179-000091383/6, por el total',
  // Los tres cupos internos que el resumen separa. El de cuotas es el que compromete meses futuros.
  adelantoEfectivo: { limite: 2000000, disponible: 2000000 },
  cuotas: { limite: 10000000, consumido: 3554133.30, disponible: 6445866.70 },
  // ═══ NO PONER ESTO EN CERO PORQUE LA CUOTA YA SE DEBITÓ (04/08) ═══
  //
  // Se probó y el control de la pestaña lo cazó en la primera corrida: `proximoPeriodo` en 0 dejaba
  // la diferencia en exactamente $965.864 y la pestaña marcaba "⚠ revisar la carga".
  //
  // El razonamiento equivocado era "la cuota de agosto se debitó el 03/08, así que ya no está
  // pendiente". Pero esta constante es LA FOTO DEL 29/07, y al 29/07 esa cuota SÍ estaba pendiente.
  // Una foto se transcribe con lo que decía el día que se sacó; corregirla con lo que pasó después
  // la convierte en otra cosa —ni la foto ni el hoy— y rompe el único control que la verifica.
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
 * MOVIMIENTOS DEL DÍA — lo que el extracto lista en "Movimientos del Día" (22/07, sin saldo corrido)
 * más el tramo que el banco no itemiza. La cadena principal (MOVIMIENTOS) cierra en $5.595.130,74
 * (Vono); estas cuatro filas la llevan al saldo DECLARADO $4.985.898,23 — el que manda para la
 * disponibilidad. Existen para que CAJA muestre lo que el banco realmente tiene HOY y no el último
 * saldo corrido del detalle, sin pegar un número: `_BANCO_RAW` las anexa y `formulaUltimoSaldo` toma
 * el último saldo. El −$143.500 es el hold intradía que ninguna línea del extracto explica: va
 * ROTULADO como "sin detalle", no disfrazado de operación real, y clasifica a su propio bucket para
 * no ensuciar la conciliación por naturaleza. El saldo de cada fila se encadena desde el cierre de
 * MOVIMIENTOS; sólo el último importa para la disponibilidad.
 */
export const MOVIMIENTOS_DIA = [
  { fecha: '2026-07-22', concepto: 'Transferencia recibida - De manufacturas quimicas', importe: 4267.49, saldo: 5599398.23 },
  { fecha: '2026-07-22', concepto: 'Transferencia realizada - A katsuda gustavo', importe: -270000, saldo: 5329398.23 },
  { fecha: '2026-07-22', concepto: 'Cheque debitado - Nº 221', importe: -200000, saldo: 5129398.23 },
  { fecha: '2026-07-22', concepto: 'Diferencia sin detalle del banco (hold intradia)', importe: -143500, saldo: 4985898.23 },
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
  // LA REVERSA DEL IMPUESTO AL CHEQUE VA AL MISMO BUCKET QUE EL IMPUESTO (31/07). El banco escribe
  // "Anul imp ley 25.413 debito 0,6%" —"imp", no "impuesto"— así que el regex de abajo no lo tomaba y
  // el crédito de +$294,78 caía en el cajón de sastre: un INGRESO sentado adentro de "Transferencias a
  // proveedores", el mismo síntoma que delató el bucket de cheques en positivo. Va con su impuesto, en
  // positivo, para que el bucket muestre el impuesto NETO. Ojo: la fórmula de Impuestos y Financieros
  // hacía ABS() de cada fila, así que sumaba la reversa en vez de restarla — ver impuestos-pestana.mjs.
  if (/impuesto ley 25\.413|anul imp ley 25\.413/i.test(c)) return 'Impuesto al cheque (Ley 25.413)'
  // ═══ EL DESCUBIERTO Y LA COMISIÓN DE CUENTA SON DOS COSAS QUE SE DECIDEN DISTINTO (31/07) ═══
  //
  // La regla que había —/interes por descubierto|iva 10,5%|iva percep/— metía TODAS las percepciones RG
  // 2408 en "Costo financiero del descubierto". Medido sobre el extracto real (170 movimientos,
  // 22/06→31/07): 7 de las 8 percepciones RG 2408 no acompañan al interés del descubierto sino a las
  // COMISIONES de servicio de cuenta, $9.233,46 atribuidos al bucket equivocado.
  //
  // Y no es un problema de prolijidad: el descubierto es una decisión de FINANCIAMIENTO (se evita
  // dejando de girar en rojo) y la comisión de mantenimiento de cuenta es un COSTO FIJO (se negocia con
  // el banco o se cambia de paquete). Mezcladas, ninguna de las dos acciones queda a la vista.
  //
  // LA EVIDENCIA QUE PERMITE SEPARARLAS ESTÁ EN EL PROPIO CONCEPTO, y se verifica con aritmética:
  //   · el interés del descubierto lleva IVA al 10,5% (tasa reducida de la ley de IVA para intereses de
  //     financiación) y su percepción dice literalmente "alic reducida" (1,5%):
  //     interés 252.340,32 → IVA 26.495,73 = 10,5% exacto · percep 3.785,10 = 1,5% exacto.
  //   · cada comisión lleva IVA al 21% (tasa general de un servicio bancario) y percepción RG 2408 al 3%:
  //     69.000 → 14.490 (21%) + 2.070 (3%) · 8.000 → 1.680 + 240 · 14.770 → 3.101,70 + 443,10 ·
  //     117.651,97 → 24.706,91 + 3.529,56 · 14.400 → 3.024 + 432 · 14.960 → 3.141,60 + 448,80.
  //     Los siete tripletes cierran al centavo — lo verifica verificarTripletesBancarios().
  //
  // O SEA: la ALÍCUOTA es la que dice de qué es el impuesto. 10,5% (y "alic reducida") = descubierto;
  // 21% (y RG 2408 a secas) = comisión. No es una inferencia sobre el texto: es la ley de IVA aplicada
  // al importe, y el importe la confirma.
  //
  // LO QUE ESTA REGLA NO PUEDE HACER, Y SE DECLARA: si el banco cobrara algún día un servicio gravado
  // al 21% que NO sea una comisión (un cargo por gestión de cobranza, por ejemplo), su IVA caería acá
  // como si fuera de una comisión. El control que lo detecta es la aritmética del triplete: si el IVA
  // 21% de un día no equivale al 21% de ninguna comisión de ese mismo día, verificarTripletesBancarios
  // lo devuelve como huérfano. No se inventa una regla más fina que la evidencia.
  if (/interes por descubierto|iva 10,5%|alic reducida/i.test(c)) return 'Costo financiero del descubierto'
  // LOS COSTOS BANCARIOS QUE NINGUNA PESTAÑA MIRABA. Antes caían en el cajón de sastre y se leían como
  // pagos a proveedores: $381.649,64 en el mes y medio del extracto ($113.794,80 en junio, $267.854,84
  // en julio) que inflaban Compras y hacían invisible lo que se lleva el banco por tener la cuenta
  // abierta. El bucket incluye el IVA y la percepción junto con la comisión, con el MISMO criterio que
  // el descubierto (costo-descubierto.mjs: "lo que sale de la cuenta = interés + IVA + percepción"):
  // esta pestaña es de CAJA, y lo que sale de la cuenta sale completo. La contracara —que el IVA 21% es
  // crédito fiscal y la percepción RG 2408 es pago a cuenta, o sea recuperables— es un asunto de la
  // posición fiscal, no del flujo: se declara en COBERTURA_NATURALEZA y no se descuenta acá.
  if (/comision|iva 21% reg de transfisc|iva percepcion rg 2408/i.test(c)) return 'Comisiones y gastos bancarios'
  // ═══ EL BANCO ESCRIBE "HABER" EN SINGULAR Y SE LLEVÓ $3.380.000 AL CAJÓN EQUIVOCADO (15/08) ═══
  //
  // La regla pedía "haberes" con ese literal, y el lote del 14/08 llega como *"Acreditacion en cta
  // pago de haber - 260814507 cuit 30716304643"*: singular y con otro prefijo. Trece de los catorce
  // movimientos de la quincena —$3.380.000— cayeron en «Transferencias a proveedores», y el
  // decimocuarto ("Pago de haberes por cci") sí matcheó: el MISMO lote, partido en dos naturalezas.
  //
  // Lo que eso rompe no es la prolijidad. `expresionSePagaEl` busca la fecha de pago filtrando por
  // Sueldos; el cuadro de estimado-contra-real suma el lote por la misma columna; la conciliación por
  // naturaleza compara sueldos contra sueldos. Los tres leían $260.000 donde el banco pagó $3.640.000,
  // sin un solo error a la vista, y los $3.380.000 inflaban los pagos a proveedores.
  //
  // La familia se ancla a la RAÍZ («haber» + su plural opcional) y admite el prefijo de acreditación,
  // que es como el banco rotula el mismo servicio de pago por lote cuando la contrapartida es la
  // cuenta sueldo del empleado. No se ancla al número de lote (260814507): ése cambia todos los días.
  // ═══ EL FONDO DE CESE LABORAL NO ES UN PAGO A PROVEEDORES (19/08/2026) ═══
  //
  // El 18/08 el banco debitó 36 acreditaciones *"Pagos personalizados acred cuenta - Acreditacion
  // fondo desempleo 000000 - cuit 30716304643"* por $2.481.098 — una por obrero, con el CUIT de la
  // empresa como ordenante. Es el FONDO DE CESE LABORAL de la construcción (ley 22.250), que UOCRA y
  // el banco siguen llamando "fondo de desempleo": la empresa deposita mensualmente un porcentaje de
  // la remuneración en la cuenta individual de cada trabajador, y el trabajador lo cobra al terminar
  // la obra. Es COSTO LABORAL, no un pago a un proveedor.
  //
  // Sin esta regla los 36 movimientos caían en «Transferencias a proveedores» —el cajón de sastre— y
  // ahí hacían dos daños a la vez: inflaban en $2,48M lo que el control cree que se le pagó a
  // proveedores, y dejaban el costo laboral del mes $2,48M por debajo de lo que realmente salió. Es
  // exactamente el defecto del 15/08 («haber» en singular se llevó $3,38M al cajón equivocado), sólo
  // que con otra familia de conceptos.
  //
  // NO VA CON `Sueldos`, Y ES A PROPÓSITO. Esa naturaleza se compara contra lo que liquida Jornales
  // por Quincena; el fondo de cese es un concepto aparte, se deposita aparte y no se paga con la
  // quincena. Sumarlo ahí haría que el control de "estimado contra real" de los jornales cerrara mal
  // todos los meses. Tiene su propia naturaleza porque es una decisión propia.
  //
  // LA RAÍZ ES «fondo de(sempleo|cese)», no el rótulo entero: el prefijo del banco («Pagos
  // personalizados acred cuenta») describe el SERVICIO de pago por lote —el mismo que usa para los
  // haberes— y cambia según cómo se ordene el pago. El número de lote (260818507) cambia todos los
  // días y por eso tampoco se ancla ahí.
  if (/fondo (?:de )?(?:desempleo|cese)/i.test(c)) return 'Cargas sociales (fondo de cese laboral)'
  if (/pago (?:de )?haberes?\b|acreditacion en cta pago de haber/i.test(c)) return 'Sueldos'
  // UN ECHEQ QUE ENTRA NO ES UN CHEQUE QUE SALE (28/07). "Deposito e-cheq int misma plaza" es un
  // echeq de TERCERO que se acreditó: es plata que ENTRA (crédito), la contracara del que ya estaba
  // en "Valores a depositar". El bucket de cheques es de SALIDAS (echeq propios que el banco debitó,
  // canje interno, cheque debitado) y su destino es la columna DEBITADO de Cheques Emitidos. Metido
  // ahí, un ingreso quedaba registrado como una salida: en la data real, $58.940.000 de echeq
  // acreditados dejaban ese bucket en +$38M —un grupo de egresos en positivo, la señal exacta de que
  // la clasificación está mal—. Por eso la detección de INGRESOS (depósito de efectivo, transferencia
  // recibida, depósito de e-cheq) va ANTES del bucket de cheques: un crédito se resuelve por su
  // naturaleza (cobranza / traslado / financiero) y nunca cae en cheques emitidos. Las salidas de
  // echeq —"Echeq clearing recibido", "Canje interno recibido", "Cheque debitado"— NO matchean esta
  // regla (no dicen "depósito" ni "transferencia recibida") y siguen cayendo en el bucket de cheques.
  if (/dep[oó]sito de efectivo|transferencia recibida|dep[oó]sito (?:de )?e-?cheq/i.test(c)) {
    const n = naturalezaIngreso({ concepto: c })
    return n === 'cobranza' ? 'Cobranzas de clientes'
      : n === 'financiero' ? 'Rescates de inversión y financiero'
      : 'Traslados de fondos propios (no es ingreso)'
  }
  // EL LITERAL SE MUDÓ (03/08). Acá vivía `/e-?cheq|cheque debitado|canje interno/i`, y cada variante
  // nueva del banco ("Canje interno recibido 24 hs" con doble espacio, "24hs" pegado, una tilde de
  // más) pedía otro literal. Un cheque que el banco debitó y este regex no reconoce se lee como
  // "vencido sin debitar": una alerta inventada. La familia de conceptos se define UNA vez, ya
  // normalizada, en cheques-debito-banco.mjs.
  if (esMovimientoDeCheques(c)) return 'Cheques y echeq'
  if (/afip|imp\.afip/i.test(c)) return 'AFIP'
  if (/prestamos prendarios/i.test(c)) return 'Préstamo prendario'
  if (/tarjeta de credito/i.test(c)) return 'Pago de la tarjeta'
  // "Compra en el exterior - Google workspace ... tarj nro. 6077" es un consumo con tarjeta (6077 es
  // la de débito), no un pago a proveedor por transferencia. Sin esto caía en "Transferencias a
  // proveedores" e inflaba los pagos a proveedores con un consumo de tarjeta. Va con las compras con
  // tarjeta de débito, cuyo destino es Compras.
  // LA PERCEPCIÓN DEL 30% VA CON LA COMPRA QUE LA GENERÓ (31/07). "Percep perc rg 5617 30% o suj -
  // Google workspace ecsas.co - tarj nro. 6077" es la percepción de Ganancias sobre un consumo en
  // moneda extranjera con tarjeta: el concepto trae la MISMA cola de comercio y tarjeta que la compra
  // ($37.926 el 01/07) y sale de la cuenta el mismo día. Antes caía en el cajón de sastre: $11.203,92
  // leídos como pago a proveedor. Va con su compra —mismo criterio que el IVA con su comisión— porque
  // esta pestaña es de caja y lo que salió por esa compra salió completo: $49.129,92, no $37.926.
  //
  // GAP DECLARADO, no tapado: esa percepción es PAGO A CUENTA de Ganancias, o sea recuperable en la
  // DDJJ, no un costo definitivo. Hoy ninguna pestaña la computa como crédito (Impuestos y Financieros
  // § 3 lee retenciones sólo de Cobranzas). Son $11.203,92 en el período del extracto: se informa, no
  // se le inventa una fila. La regla se ancla al número de RG para no capturar cualquier percepción.
  if (/percep perc rg 5617|tarjeta de debito|compra en el exterior/i.test(c)) return 'Compras con tarjeta de débito'
  if (/debito automatico/i.test(c)) return 'Débitos automáticos (seguros)'
  if (/sin detalle/i.test(c)) return 'Ajuste sin detalle del banco'
  // ═══ LOS DOS QUE REVISÉ Y SE QUEDAN DONDE ESTABAN, PERO AHORA POR DECISIÓN Y NO POR CAÍDA ═══
  //
  // "Pago de honorarios - 260702507" ($2.000.000 el 02/07). Es el servicio de pagos por lote del banco
  // —mismo formato de lote que "Pago haberes - 260630507"— usado para honorarios profesionales. NO es
  // Sueldos: un honorario no es una relación de dependencia, no lleva cargas sociales y su factura es
  // de un tercero. La pestaña dueña es la misma que la de un pago a proveedor de servicios (Compras,
  // donde se carga la factura de honorarios), así que comparte bucket y destino con las
  // transferencias. Se escribe la regla igual, explícita, para que quede como decisión revisable y no
  // como un movimiento de $2M que nadie miró. En el mismo período hay otros $896.268,31 de honorarios
  // pagados por transferencia con la etiqueta "- hon /" del banco, que caen al mismo lugar.
  if (/pago de honorarios/i.test(c)) return 'Transferencias a proveedores'
  // "Debito transf. online banking emp" — dos movimientos, y sólo uno se puede identificar:
  //   · 13/07 −$62.600 "- A pedro ward / - var / 23280102199" → contraparte con nombre y CUIT válido:
  //     es un pago, idéntico a una "Transferencia realizada".
  //   · 02/07 −$1.000.000 "- 00720567007000245843ars" → el banco NO dice a quién. El 072 es el propio
  //     Santander y el sufijo "ars" indica cuenta en pesos, así que es una transferencia a otra cuenta
  //     —que podría ser de un tercero o DE LA PROPIA EMPRESA (y entonces sería un traslado, no un
  //     egreso)—. NO SE INVENTA: se clasifica como egreso (que es lo único seguro: la plata salió) y
  //     el $1.000.000 queda declarado en el informe como contraparte a identificar. Un bucket nuevo
  //     "transferencia sin identificar" sería una regla que parece precisa sobre un solo caso.
  if (/debito transf\. online banking/i.test(c)) return 'Transferencias a proveedores'
  return 'Transferencias a proveedores'
}

/**
 * NÚCLEO PURO: la aritmética que PRUEBA a qué pertenece cada impuesto que el banco debita.
 *
 * POR QUÉ EXISTE (31/07). La regla que separa el costo del descubierto de la comisión de cuenta se
 * apoya en la alícuota (10,5% + 1,5% para el interés · 21% + 3% para la comisión). Una regla basada en
 * texto se puede afirmar; ésta se puede DEMOSTRAR: cada IVA y cada percepción tiene que ser el
 * porcentaje exacto de un cargo del mismo día. Si un día aparece un IVA 21% que no es el 21% de
 * ninguna comisión de ese día, el triplete queda huérfano y la clasificación de ese peso es una
 * suposición — que es exactamente lo que hay que saber antes de que sea plata mal contada.
 *
 * @param {{fecha:string, concepto:string, importe:number}[]} movs
 * @returns {{cerrados:Array, huerfanos:Array}} `huerfanos` vacío = cada impuesto tiene su cargo.
 */
export function verificarTripletesBancarios(movs = MOVIMIENTOS) {
  const TOL = 0.02 // el banco redondea a dos decimales; más que un centavo por lado no se tolera
  // Qué cargo puede haber generado cada impuesto, y con qué alícuota. La percepción RG 2408 tiene dos
  // alícuotas y el concepto declara cuál: "alic reducida" (1,5%) acompaña al interés; a secas, 3%.
  const REGLAS = [
    { impuesto: /^iva 21% reg de transfisc/i, sobre: /comision/i, tasa: 0.21, cargo: 'comisión' },
    { impuesto: /^iva percepcion rg 2408/i, sobre: /comision/i, tasa: 0.03, cargo: 'comisión' },
    { impuesto: /^iva 10,5% reg trans fisc/i, sobre: /interes por descubierto/i, tasa: 0.105, cargo: 'interés del descubierto' },
    { impuesto: /^iva percep rg 2408 alic reducida/i, sobre: /interes por descubierto/i, tasa: 0.015, cargo: 'interés del descubierto' },
  ]
  const cerrados = []; const huerfanos = []
  for (const m of movs) {
    const c = String(m.concepto ?? '').trim()
    const r = REGLAS.find((x) => x.impuesto.test(c))
    if (!r) continue
    const base = movs.find((x) => x.fecha === m.fecha && r.sobre.test(String(x.concepto ?? ''))
      && Math.abs(Math.abs(Number(x.importe)) * r.tasa - Math.abs(Number(m.importe))) <= TOL)
    if (base) cerrados.push({ ...m, cargo: r.cargo, base: base.concepto, tasa: r.tasa })
    else huerfanos.push({ ...m, esperaba: `${r.tasa * 100}% de una ${r.cargo} del mismo día` })
  }
  return { cerrados, huerfanos }
}

/** NÚCLEO PURO: agrupa el extracto por tipo de movimiento, para poder cruzarlo contra el Sheet. */
export function porTipo(movs = MOVIMIENTOS) {
  const acc = new Map()
  for (const m of movs) {
    const k = clasificarMovimiento(m.concepto)
    const a = acc.get(k) ?? { tipo: k, cantidad: 0, monto: 0 }
    a.cantidad++; a.monto += m.importe
    acc.set(k, a)
  }
  return [...acc.values()].sort((a, b) => a.monto - b.monto)
}

// ═══ ECHEQS_EMITIDOS SE RETIRÓ EL 14/08 ═══
//
// Era la lista completa de la consulta de echeq emitidos, transcripta a mano de la captura del 22/07.
// Sirvió para contestar la pregunta de tesorería que la originó ("a quién le debo y con qué
// instrumento"), y después se quedó: al 14/08 seguía afirmando que el 307 estaba "Aceptado" cuando el
// banco lo había pagado el 03/08, y que los únicos vivos eran tres de NEUMAGOM cuando la captura del
// 14/08 muestra siete por $6.114.994,80.
//
// Dos verdades del mismo concepto, y la de acá era la vieja. El estado de un cheque vive en
// `public.cheques`, que se actualiza por `scripts/importar-cheques.mjs` sin tocar código. Una lista a
// mano no es una fuente: envejece sin gritar — el mismo defecto que ya congeló el espejo de JORNALES
// y el IPC. El resto de este archivo sigue siendo la transcripción declarada de UN extracto (mirá
// `CORTE` y `ORIGEN`); un ESTADO VIVO no podía vivir adentro de una foto.
//
// `compromisosPorBeneficiario` sigue acá porque el cálculo es válido — lo que cambió es que ahora hay
// que pasarle los cheques, y quien los tiene es la base.

/** Estados que significan "todavía no salió de la cuenta": es un compromiso vivo. */
const VIVOS = new Set(['emitido', 'aceptado', 'por aceptar'])

/**
 * NÚCLEO PURO: los echeq emitidos que todavía hay que cubrir, por beneficiario.
 * Sin valor por defecto A PROPÓSITO: quien pregunta tiene que traer la lista viva, y la lista viva
 * está en `public.cheques`. Un default acá era lo que hacía pasar por actual a una foto del 22/07.
 */
export function compromisosPorBeneficiario(echeqs = []) {
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


// ── Restaurado (28/07): NAT + COBERTURA_NATURALEZA + naturalezas* (TCAJA los quitó de más;
//    los usan conciliacion-por-naturaleza y cash-flow-cobertura-naturalezas). ──
export const NAT = {
  impuestoCheque: 'Impuesto al cheque (Ley 25.413)',
  descubierto: 'Costo financiero del descubierto',
  // EL RÓTULO ES UN CONTRATO CON LAS FÓRMULAS DEL SHEET. Cambiarlo no rompe nada visible: hace que un
  // SUMIF deje de encontrar filas y el número se vaya a cero SIN dar error. Si algún día hay que
  // renombrarlo, hay que tocar en el mismo commit: impacto-bancario.DESTINOS, conciliacion-por-
  // naturaleza.GRUPOS (que es lo que arma el bloque 4.7 de CAJA) y COMISIONES.marca de abajo.
  comisiones: 'Comisiones y gastos bancarios',
  sueldos: 'Sueldos',
  cargasSociales: 'Cargas sociales (fondo de cese laboral)',
  cheques: 'Cheques y echeq',
  afip: 'AFIP',
  prendario: 'Préstamo prendario',
  tarjeta: 'Pago de la tarjeta',
  tarjetaDebito: 'Compras con tarjeta de débito',
  debitosAuto: 'Débitos automáticos (seguros)',
  transferencias: 'Transferencias a proveedores',
  ajusteSinDetalle: 'Ajuste sin detalle del banco',
  cobranzas: 'Cobranzas de clientes',
  rescates: 'Rescates de inversión y financiero',
  traslados: 'Traslados de fondos propios (no es ingreso)',
}

/**
 * LA COBERTURA DE CADA NATURALEZA EN EL CASH FLOW — UNA SOLA DECLARACIÓN, VERIFICABLE.
 *
 * Para CADA naturaleza que el banco puede producir, dice qué la contempla:
 *   lado       — 'egreso' | 'ingreso' | 'traslado' (qué sentido tiene en la cuenta).
 *   destino    — la pestaña/línea del cash flow que la captura, o null si NINGUNA la espera.
 *   alCashFlow — true si termina sumada en el cuadro; false si por definición no va (traslado propio)
 *                o si es un gap declarado sin resolver.
 *   grupoConciliacion — true si además la reconcilia `conciliacion-por-naturaleza.GRUPOS` (egresos que
 *                se comparan banco-vs-pestaña). El test exige que estos SÍ estén en GRUPOS.
 *   nota       — el porqué, en una línea.
 * @type {Array<{naturaleza:string, lado:'egreso'|'ingreso'|'traslado', destino:string|null, alCashFlow:boolean, grupoConciliacion:boolean, nota:string}>}
 */
export const COBERTURA_NATURALEZA = [
  { naturaleza: NAT.impuestoCheque, lado: 'egreso', destino: 'Cash Flow — línea "Impuesto al cheque (Ley 25.413)"', alCashFlow: true, grupoConciliacion: true, nota: 'Se calcula sobre el movimiento proyectado (0,6% de cada lado); línea propia en Financiación del cuadro.' },
  { naturaleza: NAT.descubierto, lado: 'egreso', destino: 'Cash Flow — línea "Intereses del acuerdo en descubierto"', alCashFlow: true, grupoConciliacion: true, nota: 'Se calcula con la tasa del acuerdo (costo-descubierto.mjs); línea propia en Financiación. Sólo el interés y sus impuestos a la alícuota reducida (10,5% + 1,5%): las comisiones tienen su propia línea.' },
  {
    naturaleza: NAT.comisiones, lado: 'egreso', destino: 'Cash Flow — línea "Comisiones y gastos bancarios (Santander)"', alCashFlow: true, grupoConciliacion: true,
    nota: 'Lo que el banco cobra por tener la cuenta abierta y mover plata: comisión de servicio de cuenta, comisión mensual de clearing, comisión de cuenta en dólares, comisión de compensación de cheques, cada una con su IVA 21% y su percepción RG 2408 al 3%. NO sale de Compras (el banco no factura por ahí, lo debita solo): la línea lee _BANCO_RAW, igual que el descubierto y el impuesto al cheque. Medido sobre el extracto: $113.794,80 en junio y $267.854,84 en julio; la parte recurrente es ~$122.000/mes y julio trae además $145.888,44 de compensación de cheques, que no es mensual. El IVA y la percepción se incluyen porque el cuadro es de CAJA y salen de la cuenta; que sean crédito fiscal y pago a cuenta (recuperables) es un asunto de la posición fiscal, no del flujo.',
  },
  { naturaleza: NAT.sueldos, lado: 'egreso', destino: 'Jornales por Quincena → línea "Jornales de obra"', alCashFlow: true, grupoConciliacion: true, nota: 'La acreditación de haberes; el dato real vive en Jornales por Quincena.' },
  {
    naturaleza: NAT.cargasSociales, lado: 'egreso', destino: 'Cargas Sociales → el fondo de cese laboral del mes', alCashFlow: true, grupoConciliacion: true,
    nota: 'El depósito del fondo de cese laboral (ley 22.250) en la cuenta individual de cada obrero, que el banco rotula "fondo de desempleo". Va con las cargas sociales y NO con los jornales: se deposita aparte de la quincena, así que sumarlo a Sueldos rompería el control de estimado-contra-real de Jornales por Quincena.',
  },
  { naturaleza: NAT.cheques, lado: 'egreso', destino: 'Cheques Emitidos (rubro de su factura si está en Compras; si no, línea "Cheques y tarjeta sin factura")', alCashFlow: true, grupoConciliacion: true, nota: 'Cheque propio ya debitado; se concilia contra Cheques Emitidos DEBITADO=SI.' },
  { naturaleza: NAT.afip, lado: 'egreso', destino: 'Compras rubro Impuestos → línea "Impuestos nacionales y provinciales"', alCashFlow: true, grupoConciliacion: true, nota: 'Pago a AFIP; su detalle vive en Impuestos y Financieros.' },
  { naturaleza: NAT.prendario, lado: 'egreso', destino: 'Compras rubro Financiero / Recurrentes → línea "Cuotas de crédito prendario"', alCashFlow: true, grupoConciliacion: true, nota: 'Cuota del prendario; línea propia en Financiación.' },
  { naturaleza: NAT.tarjeta, lado: 'egreso', destino: 'Tarjeta de Credito (rubro de su factura si está; si no, línea "Cheques y tarjeta sin factura")', alCashFlow: true, grupoConciliacion: true, nota: 'Débito del resumen; se concilia contra Tarjeta de Credito DEBITADO=SI.' },
  { naturaleza: NAT.tarjetaDebito, lado: 'egreso', destino: 'Compras (por fecha de caja)', alCashFlow: true, grupoConciliacion: true, nota: 'Compra de mostrador con débito; si no está cargada en Compras, es costo invisible (lo grita la conciliación).' },
  { naturaleza: NAT.debitosAuto, lado: 'egreso', destino: 'Compras (seguros y coberturas)', alCashFlow: true, grupoConciliacion: true, nota: 'Seguros que se debitan solos; si no están en Compras, no están en ningún rubro (lo grita la conciliación).' },
  { naturaleza: NAT.transferencias, lado: 'egreso', destino: 'Compras (por fecha de caja)', alCashFlow: true, grupoConciliacion: true, nota: 'Pago a proveedor por transferencia; es el rubro de su factura en Compras.' },
  // ── LOS CUATRO QUE ESTABAN SUELTOS (28/07) ──────────────────────────────────────────────────────
  {
    naturaleza: NAT.ajusteSinDetalle, lado: 'egreso', destino: null, alCashFlow: false, grupoConciliacion: false,
    nota: 'El banco movió plata SIN dar concepto: por definición no se le puede atribuir una pestaña ni una línea. NO se inventa un rubro; se declara sin destino para que el control lo haga visible y se lo investigue (nunca debe ser un monto material recurrente).',
  },
  {
    naturaleza: NAT.cobranzas, lado: 'ingreso', destino: 'Cobranzas → líneas de ingreso del cuadro', alCashFlow: true, grupoConciliacion: false,
    nota: 'Un cliente pagó por transferencia/depósito: el ingreso ya está en Cobranzas y las tres líneas de ingreso lo suman por unidad. No se reconcilia como egreso (grupoConciliacion=false).',
  },
  {
    naturaleza: NAT.rescates, lado: 'ingreso', destino: null, alCashFlow: false, grupoConciliacion: false,
    nota: 'GAP DECLARADO. Rescate de una inversión propia (ej. Balanz $11,9M) o desembolso de préstamo: es un flujo de INVERSIÓN/FINANCIACIÓN real, pero el cuadro sólo lee ingresos de Cobranzas y no tiene línea para un ingreso financiero. Requiere decisión del dueño y el dato de la cuenta de inversión (no se inventa). Ver banco-santander.mjs CONTRAPARTES.',
  },
  {
    naturaleza: NAT.traslados, lado: 'traslado', destino: null, alCashFlow: false, grupoConciliacion: false,
    nota: 'Plata propia cambiando de lugar (depósito de efectivo, acreditación de un echeq ya en cartera): por definición NO es un flujo nuevo; contarlo inflaría la caja con plata que ya estaba. Correcto que no vaya al cuadro.',
  },
]

/** NÚCLEO PURO: el universo de naturalezas, como Set. Es `Object.values(NAT)`. */
export function naturalezasPosibles() {
  return new Set(Object.values(NAT))
}

/** NÚCLEO PURO: las naturalezas que la declaración de cobertura cubre. */
export function naturalezasDeclaradas() {
  return new Set(COBERTURA_NATURALEZA.map((x) => x.naturaleza))
}

/**
 * NÚCLEO PURO: las naturalezas que el banco puede producir y que NINGUNA declaración contempla.
 * Vacío = cada naturaleza tiene una decisión explícita (destino o "no va al cuadro, con razón").
 * @returns {string[]}
 */
export function naturalezasSinDeclarar() {
  const dec = naturalezasDeclaradas()
  return [...naturalezasPosibles()].filter((n) => !dec.has(n))
}

/**
 * NÚCLEO PURO: las naturalezas cuya plata SÍ tiene que estar en el cash flow pero cuyo destino quedó
 * en null (un hueco de verdad, distinto del traslado que legítimamente no va). Vacío = ningún hueco.
 * @returns {Array<{naturaleza:string, nota:string}>}
 */
export function naturalezasHueco() {
  return COBERTURA_NATURALEZA.filter((x) => x.alCashFlow && !x.destino)
}

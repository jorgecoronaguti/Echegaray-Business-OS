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
export const CORTE = '2026-07-23'
export const ORIGEN = 'Santander Empresas · extracto 22/06→23/07/2026 (descarga del 23/07 11:50) + captura del 21/07 para tarjeta, acuerdo y saldo USD'

/** La cuenta operativa. Es la única del banco. */
export const CUENTA = {
  banco: 'Banco Santander',
  numero: '179-091383/6',
  sucursal: '0179 San Juan',
  // El saldo que el banco DECLARA. Es el que manda para la disponibilidad.
  //
  // ACTUALIZADO 23/07 CON LA DESCARGA COMPLETA. El extracto declara "Saldo al 23/07/2026
  // 4.813.461,54", y el OS lo REPRODUCE al centavo: $4.982.191,63 (último saldo confirmado, 22/07)
  // − $168.730,09 (la compra Appypf del 23/07, que ya impactó). El depósito de e-cheq de otras
  // plazas por $3.940.000 NO está adentro: es de otras plazas y todavía está en clearing (48 hs).
  // Contarlo como disponible sería contar plata que el banco todavía no acreditó.
  saldoPesos: 4813461.54,
  // El último saldo que el banco CONFIRMA en el detalle (el impuesto al cheque del 22/07). No
  // coincide con el declarado del 23/07 y no tiene por qué: entre los dos están los movimientos del
  // día, que el banco lista sin saldo corrido porque todavía los está liquidando.
  saldoUltimoMovimiento: 4982191.63,
  // ═══ LOS $143.500 QUE NO EXISTÍAN (23/07) ═══
  //
  // Acá decía −$609.232,51 "pendiente de conciliar", de los cuales −$143.500 eran un tramo que
  // "el banco no explica". La descarga completa del 23/07 mostró que el banco lo explicaba
  // perfectamente: era la compra con tarjeta "Vono" del 22/07, que ya estaba cargada. Lo que estaba
  // mal era el SALDO DE APERTURA de la serie transcripta a mano (−$169.586,65 contra los
  // −$313.086,65 que dice el banco, exactamente $143.500 de diferencia), y para que la cadena
  // cerrara se había agregado una fila inventada de −$143.500 al final. Dos errores que se tapaban
  // entre sí y que sólo el documento original podía separar.
  //
  // Hoy no queda nada sin conciliar: la cadena cierra de punta a punta y el saldo declarado se
  // reproduce al centavo. Lo único "pendiente" es plata que el banco todavía no acreditó (el
  // depósito de e-cheq en clearing), y eso no es una diferencia: es un plazo.
  saldoPendienteConciliar: 0,
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
  // ═══ UN VALOR QUE ESTÁ, CON MEDIO DATO (23/07) ═══
  //
  // El banco lo tiene EN CUSTODIA desde el 22/07 15:46 (operación 7934081, aceptada) y la cartera no
  // lo incluía: CAJA declaraba $10.000.000 de valores a depositar y el banco tiene $10.290.000.
  //
  // LO QUE FALTA NO SE INVENTA. La consulta de operaciones eCHEQ del Santander da id de operación,
  // tipo, fecha e importe — y nada más. Busqué el número de cheque, el emisor, el CUIT y el
  // vencimiento en "Cheques Recibidos", en "Cobranzas", en public.banco_movimientos y en el índice
  // del data room: no están en ninguna parte. Van en null, y `null` se dibuja como DESCONOCIDO en la
  // pestaña. Poner un emisor plausible sería peor que no tenerlo: un dato inventado no se distingue
  // de uno medido.
  //
  // SIN VENCIMIENTO NO ENTRA AL CALENDARIO. `pago: null` lo deja fuera de los tramos y lo manda a la
  // fila "sin fecha", que es donde tiene que verse: una fecha vacía comparada como número vale cero
  // y lo habría metido entero en "Vencido".
  //
  // Y ES ADEMÁS UNA COBRANZA QUE NADIE REGISTRÓ: Cobranzas no tiene ninguna fila de $290.000.
  {
    operacion: '7934081',
    numero: null,
    emisor: null,
    cuit: null,
    emision: '2026-07-22',
    pago: null,
    importe: 290000,
    estado: 'custodia',
    falta: 'número de cheque, emisor, CUIT y fecha de vencimiento',
  },
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
 * EL EXTRACTO, MOVIMIENTO POR MOVIMIENTO (22/06 al 23/07/2026) — YA NO ES LA FUENTE.
 *
 * DEJÓ DE SER UN DATO ESCRITO A MANO (23/07). La fuente es `public.banco_movimientos`, que se carga
 * con `scripts/importar-banco.mjs` desde el CSV del banco. Este array quedó como RESPALDO de lectura
 * —si la base no contesta, `_BANCO_RAW` prefiere mostrar el último extracto conocido antes que dejar
 * la pestaña en cero— y se REGENERA desde la base, no se edita a mano.
 *
 * POR QUÉ IMPORTA QUE YA NO SE EDITE A MANO. Hasta hoy estos 127 movimientos eran una transcripción,
 * y la transcripción arrastraba un error: todos los saldos estaban $143.500 por encima de los que
 * declara el banco, porque el saldo de apertura se había tomado mal (−$169.586,65 contra los
 * −$313.086,65 reales). Para que la cadena cerrara igual se había agregado al final una fila que no
 * existe —"Diferencia sin detalle del banco (hold intradía)", −$143.500—. Dos errores que se
 * compensaban, invisibles mientras nadie comparara contra el documento original.
 *
 * CÓMO SÉ QUE NO HAY UN ERROR ADENTRO. Cada fila trae su SALDO y el extracto es una cadena:
 * saldo(n) = saldo(n−1) + importe(n). El test la recorre entera desde SALDO_INICIAL. Un dígito mal
 * escrito la rompe. Están en orden cronológico (el extracto los muestra al revés).
 */
export const SALDO_INICIAL = -313086.65

export const MOVIMIENTOS = [
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A gisela agostina d amico / - fac / 27326890397', importe: -230000, saldo: -543086.65 },
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A sanitarios od sas / - fac / 33716650249', importe: -580800, saldo: -1123886.65 },
  { fecha: '2026-06-22', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -63503.22, saldo: -1187389.87 },
  { fecha: '2026-06-22', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -5245.82, saldo: -1192635.69 },
  { fecha: '2026-06-23', concepto: 'Compra con tarjeta de debito - Merpago*cpcesj - tarj nro. 6077', importe: -865000, saldo: -2057635.69 },
  { fecha: '2026-06-23', concepto: 'Compra con tarjeta de debito - Merpago*ieric - tarj nro. 6077', importe: -47670, saldo: -2105305.69 },
  { fecha: '2026-06-23', concepto: 'Transferencia inmediata - A francisco adan alvarez / - var / 20256865913', importe: -55500, saldo: -2160805.69 },
  { fecha: '2026-06-23', concepto: 'Transferencia inmediata - A matias ivan cobos / - var / 24365438826', importe: -55057.26, saldo: -2215862.95 },
  { fecha: '2026-06-23', concepto: 'Transferencia realizada - A montoya claudio daniel / - var / 24358530598', importe: -185000, saldo: -2400862.95 },
  { fecha: '2026-06-23', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -7249.36, saldo: -2408112.31 },
  { fecha: '2026-06-24', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -161626, saldo: -2569738.31 },
  { fecha: '2026-06-24', concepto: 'Compra con tarjeta de debito - Merpago*esteticaericapala - tarj nro. 2871', importe: -150000, saldo: -2719738.31 },
  { fecha: '2026-06-24', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1869.76, saldo: -2721608.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -2921608.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -3121608.07 },
  { fecha: '2026-06-25', concepto: 'Cheque debitado', importe: -200000, saldo: -3321608.07 },
  { fecha: '2026-06-25', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.99, saldo: -3421608.06 },
  { fecha: '2026-06-25', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -4200, saldo: -3425808.06 },
  { fecha: '2026-06-29', concepto: 'Echeq clearing recibido 48hs', importe: -3500000, saldo: -6925808.06 },
  { fecha: '2026-06-29', concepto: 'Comision por servicio de cuenta', importe: -69000, saldo: -6994808.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -14490, saldo: -7009298.06 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -2070, saldo: -7011368.06 },
  { fecha: '2026-06-29', concepto: 'Comision mensual de movs clearing', importe: -8000, saldo: -7019368.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -1680, saldo: -7021048.06 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -240, saldo: -7021288.06 },
  { fecha: '2026-06-29', concepto: 'Comision servicio cuenta dolares', importe: -14770, saldo: -7036058.06 },
  { fecha: '2026-06-29', concepto: 'Iva 21% reg de transfisc ley27743', importe: -3101.7, saldo: -7039159.76 },
  { fecha: '2026-06-29', concepto: 'Iva percepcion rg 2408', importe: -443.1, saldo: -7039602.86 },
  { fecha: '2026-06-29', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -54043.44, saldo: -7093646.3 },
  { fecha: '2026-06-29', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -22007.03, saldo: -7115653.33 },
  { fecha: '2026-06-30', concepto: 'Pago haberes - 260630507', importe: -344401.2, saldo: -7460054.53 },
  { fecha: '2026-06-30', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -2066.41, saldo: -7462120.94 },
  { fecha: '2026-07-01', concepto: 'Deposito e-cheq int misma plaza', importe: 15000000, saldo: 7537879.06 },
  { fecha: '2026-07-01', concepto: 'Compra con tarjeta de debito - Mercpago*appypfcomb - tarj nro. 6077', importe: -143802.01, saldo: 7394077.05 },
  { fecha: '2026-07-01', concepto: 'Compra con tarjeta de debito - Appypf 31155 tienda - tarj nro. 6077', importe: -7800, saldo: 7386277.05 },
  { fecha: '2026-07-01', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -37000, saldo: 7349277.05 },
  { fecha: '2026-07-01', concepto: 'Transferencia inmediata - A yuliana cintia fernande / - var / 27484157214', importe: -325000, saldo: 7024277.05 },
  { fecha: '2026-07-01', concepto: 'Compra en el exterior - Google workspace ecsas.co - tarj nro. 6077', importe: -37926, saldo: 6986351.05 },
  { fecha: '2026-07-01', concepto: 'Percep perc rg 5617 30% o suj - Google workspace ecsas.co - tarj nro. 6077', importe: -11203.92, saldo: 6975147.13 },
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1807057.16, saldo: 5168089.97 },
  { fecha: '2026-07-01', concepto: 'Pago haberes - 260701507', importe: -1938254.35, saldo: 3229835.62 },
  { fecha: '2026-07-01', concepto: 'Anul imp ley 25.413 debito 0,6%', importe: 294.78, saldo: 3230130.4 },
  { fecha: '2026-07-01', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -90000, saldo: 3140130.4 },
  { fecha: '2026-07-01', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -26143.04, saldo: 3113987.36 },
  { fecha: '2026-07-02', concepto: 'Transferencia realizada - A ac sat srl / - fac / 30710965044', importe: -63503.22, saldo: 3050484.14 },
  { fecha: '2026-07-02', concepto: 'Debito transf. online banking emp', importe: -1000000, saldo: 2050484.14 },
  { fecha: '2026-07-02', concepto: 'Pago de honorarios - 260702507', importe: -2000000, saldo: 50484.14 },
  { fecha: '2026-07-02', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -18381.02, saldo: 32103.12 },
  { fecha: '2026-07-03', concepto: 'Debito automatico - Sancor cooperati', importe: -31737, saldo: 366.12 },
  { fecha: '2026-07-03', concepto: 'Debito automatico - Federacion patro', importe: -536967.83, saldo: -536601.71 },
  { fecha: '2026-07-03', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3412.23, saldo: -540013.94 },
  { fecha: '2026-07-06', concepto: 'Echeq clearing recibido 48hs', importe: -893098.79, saldo: -1433112.73 },
  { fecha: '2026-07-06', concepto: 'Cheque debitado', importe: -200000, saldo: -1633112.73 },
  { fecha: '2026-07-06', concepto: 'Compra con tarjeta de debito - Zabala repuestos - tarj nro. 6077', importe: -310000, saldo: -1943112.73 },
  { fecha: '2026-07-06', concepto: 'Pago tarjeta de credito visa - Deb. automatico 06/07/2026', importe: -1264991.58, saldo: -3208104.31 },
  { fecha: '2026-07-06', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -16008.54, saldo: -3224112.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -317000, saldo: -3541112.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -3924287.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -4307462.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -4690637.85 },
  { fecha: '2026-07-07', concepto: 'Echeq clearing recibido 48hs', importe: -383175, saldo: -5073812.85 },
  { fecha: '2026-07-07', concepto: 'Prestamos prendarios - 0179-039101464204', importe: -1282810.54, saldo: -6356623.39 },
  { fecha: '2026-07-07', concepto: 'Canje interno recibido 24 hs', importe: -300000, saldo: -6656623.39 },
  { fecha: '2026-07-07', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -20595.06, saldo: -6677218.45 },
  { fecha: '2026-07-08', concepto: 'Echeq clearing recibido 48hs', importe: -1854564.14, saldo: -8531782.59 },
  { fecha: '2026-07-08', concepto: 'Echeq clearing recibido 48hs', importe: -1964635.58, saldo: -10496418.17 },
  { fecha: '2026-07-08', concepto: 'Debito automatico - Sancor cooperati', importe: -33596, saldo: -10530014.17 },
  { fecha: '2026-07-08', concepto: 'Compra con tarjeta de debito - Villa del pino sa - tarj nro. 8866', importe: -174000, saldo: -10704014.17 },
  { fecha: '2026-07-08', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -24160.77, saldo: -10728174.94 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.96, saldo: -10828174.9 },
  { fecha: '2026-07-13', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -69500, saldo: -10897674.9 },
  { fecha: '2026-07-13', concepto: 'Debito transf. online banking emp - A pedro ward / - var / 23280102199', importe: -62600, saldo: -10960274.9 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Merpago*movistarlineam - tarj nro. 6077', importe: -361964.3, saldo: -11322239.2 },
  { fecha: '2026-07-13', concepto: 'Compra con tarjeta de debito - Merpago*movistarhogar - tarj nro. 6077', importe: -48718.74, saldo: -11370957.94 },
  { fecha: '2026-07-13', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3856.7, saldo: -11374814.64 },
  { fecha: '2026-07-14', concepto: 'Cobro de interes por descubierto - Del 08/06/26 al 07/07/26', importe: -252340.32, saldo: -11627154.96 },
  { fecha: '2026-07-14', concepto: 'Iva 10,5% reg trans fisc ley 27743', importe: -26495.73, saldo: -11653650.69 },
  { fecha: '2026-07-14', concepto: 'Iva percep rg 2408 alic reducida', importe: -3785.1, saldo: -11657435.79 },
  { fecha: '2026-07-14', concepto: 'Debito automatico - Federacion patro', importe: -63853.49, saldo: -11721289.28 },
  { fecha: '2026-07-14', concepto: 'Transferencia realizada - A david esteban botas mer / - var / 20353186877', importe: -369440, saldo: -12090729.28 },
  { fecha: '2026-07-14', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -4295.48, saldo: -12095024.76 },
  { fecha: '2026-07-16', concepto: 'Deposito e-cheq int misma plaza', importe: 10000000, saldo: -2095024.76 },
  { fecha: '2026-07-16', concepto: 'Cheque debitado', importe: -200000, saldo: -2295024.76 },
  { fecha: '2026-07-16', concepto: 'Cheque debitado', importe: -200000, saldo: -2495024.76 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Afip -30716304643', importe: -1034931.85, saldo: -3529956.61 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Afip -30716304643', importe: -473767.08, saldo: -4003723.69 },
  { fecha: '2026-07-16', concepto: 'Debito automatico - Federacion patro', importe: -9339.75, saldo: -4013063.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia inmediata - A el carpincho construcci / - var / 30716050897', importe: -26000, saldo: -4039063.44 },
  { fecha: '2026-07-16', concepto: 'Transferencia recibida - credin - Id debin cuit 30710630670', importe: 11913568.24, saldo: 7874504.8 },
  { fecha: '2026-07-16', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -11664.23, saldo: 7862840.57 },
  { fecha: '2026-07-16', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -131481.41, saldo: 7731359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 6440000, saldo: 14171359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 1520000, saldo: 15691359.16 },
  { fecha: '2026-07-17', concepto: 'Deposito de efectivo', importe: 2000000, saldo: 17691359.16 },
  { fecha: '2026-07-17', concepto: 'Pago de haberes por cci - &&000000000000001', importe: -252200, saldo: 17439159.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A sanitarios od sas / - alq / 33716650249', importe: -290400, saldo: 17148759.16 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A jose maria robles / - hon / 20379240195', importe: -666268.31, saldo: 16482490.85 },
  { fecha: '2026-07-17', concepto: 'Transferencia inmediata - A gisela agostina d amico / - hon / 27326890397', importe: -230000, saldo: 16252490.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -238600, saldo: 16013890.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -267500, saldo: 15746390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -256000, saldo: 15490390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -258000, saldo: 15232390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -250000, saldo: 14982390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -256000, saldo: 14726390.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -253400, saldo: 14472990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -251000, saldo: 14221990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -277000, saldo: 13944990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -258000, saldo: 13686990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -248000, saldo: 13438990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -240000, saldo: 13198990.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -252350, saldo: 12946640.85 },
  { fecha: '2026-07-17', concepto: 'Pago haberes - 260717507', importe: -217100, saldo: 12729540.85 },
  { fecha: '2026-07-17', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -29770.91, saldo: 12699769.94 },
  { fecha: '2026-07-17', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -59760, saldo: 12640009.94 },
  { fecha: '2026-07-20', concepto: 'Pago de servicios - Imp.afip: 3071630464311793242 - tarj nro. 3537', importe: -4859763.28, saldo: 7780246.66 },
  { fecha: '2026-07-20', concepto: 'Transferencia realizada - A herrajes san juan / - fac / 30718775406', importe: -750000, saldo: 7030246.66 },
  { fecha: '2026-07-20', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -99999.96, saldo: 6930246.7 },
  { fecha: '2026-07-20', concepto: 'Canje interno recibido 24 hs', importe: -200000, saldo: 6730246.7 },
  { fecha: '2026-07-20', concepto: 'Echeq canje interno recibido 24hs', importe: -893098.79, saldo: 5837147.91 },
  { fecha: '2026-07-20', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -40817.17, saldo: 5796330.74 },
  { fecha: '2026-07-21', concepto: 'Cheque debitado', importe: -200000, saldo: 5596330.74 },
  { fecha: '2026-07-21', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -1200, saldo: 5595130.74 },
  { fecha: '2026-07-22', concepto: 'Compra con tarjeta de debito - Vono - tarj nro. 6077', importe: -143500, saldo: 5451630.74 },
  { fecha: '2026-07-22', concepto: 'Cheque debitado - Nº 221', importe: -200000, saldo: 5251630.74 },
  { fecha: '2026-07-22', concepto: 'Transferencia realizada - A katsuda gustavo', importe: -270000, saldo: 4981630.74 },
  { fecha: '2026-07-22', concepto: 'Transferencia recibida - De manufacturas quimicas', importe: 4267.49, saldo: 4985898.23 },
  { fecha: '2026-07-22', concepto: 'Impuesto ley 25.413 debito 0,6%', importe: -3681, saldo: 4982217.23 },
  { fecha: '2026-07-22', concepto: 'Impuesto ley 25.413 credito 0,6%', importe: -25.6, saldo: 4982191.63 }
]

/**
 * MOVIMIENTOS DEL DÍA — lo que el extracto lista en "Movimientos del Día", todavía SIN saldo corrido.
 *
 * SIN SALDO NO ES CON SALDO CERO. El banco los muestra porque ya ocurrieron, pero no dice cuánto
 * quedó después: los está liquidando. `_BANCO_RAW` los anexa al final con la celda de saldo VACÍA,
 * nunca con un cero —un cero ahí haría que `formulaUltimoSaldo` devolviera $0 y CAJA mostrara la
 * cuenta vacía—.
 *
 * Y NO TODOS PESAN IGUAL EN LA DISPONIBILIDAD. Al 23/07 el banco declara $4.813.461,54, que es el
 * último saldo confirmado MENOS la compra de $168.730,09: el depósito de e-cheq de otras plazas por
 * $3.940.000 NO está adentro porque está en clearing (48 hs). Quién ya impactó y quién no lo dice
 * el "Saldo al …" del propio extracto — lo lee `saldoDeclarado()` en lib/banco-importar.mjs.
 */
export const MOVIMIENTOS_DIA = [
  { fecha: '2026-07-23', concepto: 'Deposito e-cheq int ots plazas', importe: 3940000, saldo: null },
  { fecha: '2026-07-23', concepto: 'Compra con tarjeta de debito - Appypf 2660 combustibl - tarj nro. 6077', importe: -168730.09, saldo: null }
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
  // ═══ LA ANULACIÓN ES DEL MISMO IMPUESTO, Y POR ESO ENTRA POR LA MISMA PUERTA (23/07) ═══
  //
  // El patrón anterior era /impuesto ley 25\.413/ y el banco reversa el cargo con OTRO texto: "Anul
  // imp ley 25.413 debito 0,6%" (+$294,78 el 01/07). "Anul imp" no es "Impuesto", así que la reversa
  // caía en el cajón de descarte —"Transferencias a proveedores"— y el impuesto al cheque de julio
  // quedaba en $485.253,16 cuando el costo real del mes es $484.958,38.
  //
  // Son $294,78, y no es una cuestión de plata: es EL MISMO ERROR DE SIGNO que con las notas de
  // crédito de ARCA, donde costó $41,9M. Una anulación no es un gasto: es la devolución de uno. Va
  // clasificada con el impuesto que anula y RESTANDO — de ahí que la fila del cuadro sume el importe
  // con su signo (los débitos vienen negativos) en vez de tomarle el valor absoluto.
  //
  // Se ancla a "ley 25.413", que es la norma y no la redacción: cubre "Impuesto ley 25.413",
  // "Anul imp ley 25.413" y cualquier variante futura del banco sobre el mismo tributo.
  if (/ley 25\.413/i.test(c)) return 'Impuesto al cheque (Ley 25.413)'
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
  if (/sin detalle/i.test(c)) return 'Ajuste sin detalle del banco'
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

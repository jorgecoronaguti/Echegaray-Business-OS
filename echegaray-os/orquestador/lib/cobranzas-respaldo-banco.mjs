// ¿EL BANCO CONFIRMA ESTE COBRO? — el respaldo de un "Cobrado", contra el extracto vivo.
//
// ═══ EL DEFECTO QUE ESTO CIERRA (15/08/2026) ═══
//
// La columna BB de Cobranzas ("Qué dice el banco de este valor") la escribe
// `scripts/cobranzas-control.mjs`, y la escribía cruzando contra `ECHEQS_TERCEROS`: una lista de OCHO
// echeqs transcripta a mano en `banco-santander.mjs`, todos de un solo emisor, congelada al `CORTE`
// del 22/07. Dos consecuencias medidas:
//
//   · CUATRO FILAS DE LA ESTRELLA marcadas "Cobrado" por $50.000.000 en total (f16 $15M al 20/04,
//     f26 $15M al 02/07, f33 $10M al 16/07, f37 $10M al 05/08) llevan "▲ el banco no tiene un echeq
//     con esta fecha e importe". Esa frase afirma más de lo que la fuente sabe: la lista no contiene
//     el universo de acreditaciones, contiene ocho echeqs. "No está en mi lista" no es "el banco no
//     lo tiene".
//   · El corte del cruce (22/07) tenía 23 días de atraso mientras `_BANCO_RAW` ya llegaba al 14/08.
//     Una alerta vieja que no puede apagarse sola se ignora, y la que se ignora después es la real.
//
// LA FUENTE ES EL EXTRACTO, NO UNA TRANSCRIPCIÓN. `_BANCO_RAW` es la réplica del extracto del banco y
// se actualiza sola con cada importación. Acá se cruza contra ESO, y el corte se DERIVA del dato
// (`corteDelExtracto`) en vez de tipearse: un corte escrito a mano se queda viejo sin gritar.
//
// ═══ LOS TRES VEREDICTOS POSIBLES, Y POR QUÉ SON TRES Y NO DOS ═══
//
//   confirma  — hay UNA acreditación por ese importe dentro de la ventana. El "Cobrado" tiene respaldo.
//   fueraDeCorte — la fecha de cobro es POSTERIOR al último día que el banco publicó. No se puede
//     negar lo que el extracto todavía no alcanzó: es la diferencia entre "no entró" y "no sé".
//   sinRespaldo — el extracto llega hasta después de esa fecha y no hay ninguna acreditación que la
//     explique. RECIÉN ACÁ se puede decir que el banco no la tiene.
//
// Y un cuarto que no es veredicto: `ambiguo`, cuando dos acreditaciones podrían ser la misma fila. No
// se elige una — la regla del repo es no escribir donde el mapeo dice que no.
//
// NÚCLEO PURO. Recibe filas ya leídas y devuelve decisiones.

import { FILA0_BANCO, corteDelExtracto } from './libro-respaldo-banco.mjs'

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const txt = (v) => String(v ?? '').trim()

/**
 * LA VENTANA DE DÍAS entre la fecha de cobro que declara Cobranzas y la acreditación del banco.
 *
 * No es cero: un echeq con fecha de pago un sábado se acredita el lunes, una transferencia cargada
 * con la fecha de la factura se acredita a los días, y el dueño carga la fecha que le dijeron. Con
 * ventana 0 el cruce negaría cobros sanos, que es cómo un control se convierte en ruido.
 *
 * Tampoco es un mes: cuanto más ancha la ventana, más fácil es que dos cobros del mismo importe se
 * pisen y el cruce termine confirmando el equivocado.
 */
export const VENTANA_DIAS = 5

/** La tolerancia de importe. Un peso: el extracto y la pestaña deberían decir el mismo número. */
export const TOLERANCIA_IMPORTE = 1

/**
 * NÚCLEO PURO: las ACREDITACIONES del extracto — lo que entró a la cuenta.
 *
 * El espejo de `debitosDelExtracto`, que sólo mira lo que salió. El importe se devuelve positivo
 * porque en el extracto un crédito ya viene positivo; se filtran los ceros para no emparejar contra
 * una fila de saldo.
 *
 * @param {Array<Array>} filas `_BANCO_RAW`: A fecha · B concepto · C importe · D referencia · F naturaleza
 */
export function acreditacionesDelExtracto(filas = [], { fila0 = FILA0_BANCO } = {}) {
  const out = []
  for (let i = fila0 - 1; i < filas.length; i++) {
    const f = filas[i] ?? []
    const fecha = num(f[0])
    const importe = num(f[2])
    if (fecha === null || importe === null || importe <= 0) continue
    out.push({
      fecha, importe, concepto: txt(f[1]), referencia: txt(f[3]), naturaleza: txt(f[5]), fila: i + 1,
    })
  }
  return out
}

/**
 * NÚCLEO PURO: el PRIMER día que cubre el extracto — el espejo de `corteDelExtracto`.
 *
 * ═══ POR QUÉ HACE FALTA, MEDIDO EN VIVO (15/08/2026) ═══
 *
 * `_BANCO_RAW` no es la historia del banco: es la VENTANA que se importó. En el archivo vivo son 28
 * acreditaciones que arrancan en julio. Mirando sólo el corte superior, este cruce declaró "sin
 * respaldo" 22 cobros por $221.523.370 — entre ellos ARCOR del 3 de febrero y IMOTOR del 15 de enero,
 * que no están en el extracto por la razón más simple del mundo: el extracto no llega a enero.
 *
 * Es el mismo error que ya se pagó con el auditor de ventana fija (decía 34 pegados y eran 79): un
 * control que juzga fuera de la ventana de su fuente produce hallazgos fabricados, y los hallazgos
 * fabricados son los que enseñan a ignorar la columna entera.
 */
export function inicioDelExtracto(filas = [], { fila0 = FILA0_BANCO } = {}) {
  let min = null
  for (let i = fila0 - 1; i < filas.length; i++) {
    const fecha = num((filas[i] ?? [])[0])
    if (fecha !== null && (min === null || fecha < min)) min = fecha
  }
  return min
}

/**
 * NÚCLEO PURO: ¿el banco respalda ESTE cobro?
 *
 * @param {{serialCobro:number, monto:number}} cobro fecha en SERIAL de Sheets (no un Date: el extracto
 *   habla en seriales y convertir de los dos lados da dos criterios de huso), monto en pesos
 * @param {Array} acreditaciones de `acreditacionesDelExtracto`
 * @param {{corte:number|null, ventana?:number, tolerancia?:number}} opciones
 * @returns {{estado:'confirma'|'ambiguo'|'fueraDeCorte'|'sinRespaldo'|'sinFecha', mov?:object, cuantos?:number}}
 */
export function respaldoDeCobro(cobro, acreditaciones = [], {
  corte = null, desde = null, ventana = VENTANA_DIAS, tolerancia = TOLERANCIA_IMPORTE,
} = {}) {
  const fecha = num(cobro?.serialCobro)
  const monto = num(cobro?.monto)
  if (fecha === null || monto === null || monto <= 0) return { estado: 'sinFecha' }
  const candidatas = acreditaciones.filter((a) => Math.abs(a.importe - monto) < tolerancia
    && Math.abs(a.fecha - fecha) <= ventana)
  if (candidatas.length === 1) return { estado: 'confirma', mov: candidatas[0] }
  if (candidatas.length > 1) return { estado: 'ambiguo', cuantos: candidatas.length, mov: candidatas[0] }
  // SIN CANDIDATA, EL VEREDICTO DEPENDE DE LA VENTANA DEL EXTRACTO — POR LOS DOS EXTREMOS.
  // Arriba: un cobro fechado más allá de lo que el banco publicó no se puede negar (se exige que el
  // extracto cubra también la ventana de días, porque la acreditación puede caer después).
  // Abajo: un cobro anterior al primer día importado tampoco — el extracto no llega hasta ahí.
  if (corte === null || fecha + ventana > corte) return { estado: 'fueraDeCorte' }
  if (desde !== null && fecha - ventana < desde) return { estado: 'anteriorAlExtracto' }
  return { estado: 'sinRespaldo' }
}

/** ¿Este veredicto desmiente un "Cobrado"? Sólo `sinRespaldo`: los demás no afirman nada. */
export const desmiente = (r) => r?.estado === 'sinRespaldo'

/**
 * LOS INSTRUMENTOS QUE TIENEN QUE PASAR POR LA CUENTA.
 *
 * EL EFECTIVO NO ESTÁ, Y NO ES UN OLVIDO. Un cobro en efectivo no aparece en el extracto jamás:
 * juzgarlo contra el banco marcaría como "sin respaldo" a todas las filas sanas de efectivo, y una
 * columna llena de alertas falsas es cómo se pierde la alerta verdadera. Su control es otro —lo
 * cobrado en efectivo tiene que aparecer depositado o en la caja física— y ya vive en CAJA.
 *
 * "desconocido" tampoco se juzga: sin saber cómo se cobró, no se sabe dónde debería estar.
 */
export const PASAN_POR_LA_CUENTA = Object.freeze(['echeq', 'cheque', 'transferencia'])
export const deberiaEstarEnElBanco = (instrumento) => PASAN_POR_LA_CUENTA.includes(instrumento)

/**
 * NÚCLEO PURO: el cruce completo — un veredicto por cobro COBRADO.
 *
 * Sólo se juzgan los cobrados: un pendiente no dice haber entrado a la cuenta, así que el extracto no
 * tiene nada que confirmarle. Los endosados se saltean por definición — ese valor se entregó y nunca
 * va a aparecer en la cuenta (ver `libro-endosos.mjs`).
 *
 * @param {Array<object>} cobros salida de `leerCobro`
 * @param {Array<Array>} filasBanco `_BANCO_RAW`
 * @param {{esCobrado:function, ventana?:number}} opciones
 */
export function cruzarConElBanco(cobros = [], filasBanco = [], { esCobrado, ventana = VENTANA_DIAS } = {}) {
  const acreditaciones = acreditacionesDelExtracto(filasBanco)
  const corte = corteDelExtracto(filasBanco)
  const desde = inicioDelExtracto(filasBanco)
  // ═══ UN EXTRACTO ILEGIBLE SE DECLARA, NO SE CUENTA COMO "TODO EN ORDEN" (15/08/2026) ═══
  //
  // MEDIDO CONTRA EL ARCHIVO VIVO en la primera corrida de este módulo: `_BANCO_RAW` tenía 406 filas y
  // este cruce vio CERO acreditaciones, porque la lectura salía por `readSheetValues` sin
  // `UNFORMATTED_VALUE` y las fechas e importes llegaban como texto ("14/08/2026", "$15.000.000").
  // Sin este chequeo, el efecto era perfecto y silencioso: 0 acreditaciones y corte nulo hacen que
  // TODO cobro caiga en "el extracto todavía no llega a esa fecha" y el aviso no se emita nunca.
  // Un control que se apaga solo y sigue diciendo que anduvo es peor que no tenerlo.
  const ilegible = filasBanco.length > FILA0_BANCO && !acreditaciones.length
    ? `leí ${filasBanco.length} filas de la réplica del banco y NINGUNA tenía fecha e importe numéricos:`
      + ' probablemente falta leer con UNFORMATTED_VALUE. No juzgo ningún cobro con un extracto que no entiendo.'
    : null
  const veredictos = []
  for (const c of cobros) {
    if (c.endosado || !esCobrado(c)) continue
    if (ilegible) { veredictos.push({ estado: 'extractoIlegible', cobro: c }); continue }
    // Un cobro que no pasa por la cuenta (efectivo) no se juzga contra el extracto: se declara para
    // que la plata no desaparezca del informe, pero con su propio estado.
    if (!deberiaEstarEnElBanco(c.instrumento)) {
      veredictos.push({ estado: 'noPasaPorLaCuenta', cobro: c })
      continue
    }
    // UN COBRO EN DÓLARES NO SE JUZGA POR IMPORTE. El extracto acredita pesos a la cotización del día
    // de la operación, que no es el `TIPO_CAMBIO_USD` con el que se valuó la fila: exigir igualdad al
    // peso marcaría "sin respaldo" un cobro que entró. Se declara y no se afirma nada.
    if ((c.moneda && c.moneda !== 'ARS') || c.sinValuar) {
      veredictos.push({ estado: 'noComparable', cobro: c })
      continue
    }
    veredictos.push({ ...respaldoDeCobro(c, acreditaciones, { corte, desde, ventana }), cobro: c })
  }
  const suma = (l) => l.reduce((s, v) => s + (v.cobro.monto || 0), 0)
  const sinRespaldo = veredictos.filter(desmiente)
  // Los dos "no sé" viajan juntos: son la plata que el cruce NO pudo juzgar, y callarla convertiría
  // un cruce parcial en un ✓. La ventana del extracto se declara con ellos.
  const sinJuzgar = veredictos.filter((v) => v.estado === 'fueraDeCorte' || v.estado === 'anteriorAlExtracto')
  return {
    corte,
    desde,
    ilegible,
    acreditaciones: acreditaciones.length,
    veredictos,
    sinRespaldo,
    fueraDeCorte: sinJuzgar,
    montos: { sinRespaldo: suma(sinRespaldo), fueraDeCorte: suma(sinJuzgar) },
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SE ESCRIBE EN LA PESTAÑA — el aviso tiene que estar donde se mira el cobro
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El Flujo va por PERCIBIDO (regla de oro 5). Un "Cobrado" que el extracto no respalda está contado en
// la línea de INGRESOS REALES —o sea, como plata que ya está en la cuenta— cuando en el mejor de los
// casos es devengado: se facturó, se dio por cobrado, y el banco no lo vio. La diferencia entre las
// dos cosas es toda la diferencia entre el P&L y la caja.
//
// EL AVISO VA EN LA FILA, NO EN EL LOG. Un hallazgo que sólo existe en la salida de un script lo lee
// quien corre el script; el dueño mira la pestaña. Y el texto dice qué hacer con él, porque un ⚠ sin
// acción asociada se convierte en decoración.

/** El prefijo de la marca. Lo reconoce el guard de `cobranzas-control.mjs` para poder reescribirla. */
export const MARCA_SIN_RESPALDO = 'DEVENGADO, NO PERCIBIDO'

/**
 * NÚCLEO PURO: el texto de la columna "Valor banco" para un cobro y su veredicto.
 *
 * @param {object} v un elemento de `veredictos`
 * @param {{alerta:string, fechaCorte:string}} opciones el glifo de alerta y el corte legible
 */
/**
 * ═══ CUÁNTO PUEDE MEDIR CADA VEREDICTO, Y POR QUÉ ES UN LÍMITE Y NO UN GUSTO (15/08) ═══
 *
 * Estos textos van a la columna BB de "Cobranzas", que lee 97 caracteres con el cuerpo declarado en
 * `cobranzas-control.mjs`. El veredicto de `sinRespaldo` medía 222: en la pantalla se cortaba a los
 * 50 —la columna venía sin ancho declarado— y lo que quedaba del lado invisible era exactamente qué
 * hacer con la fila. Un aviso que no se lee entero no avisa; y la fila de al lado tiene datos, así
 * que no derrama: desaparece.
 *
 * LA EXPLICACIÓN LARGA NO SE PERDIÓ: vive en la NOTA de la línea "Cobrado que el extracto NO
 * confirma" del bloque de control, que es donde se lee una vez en vez de repetirse por fila.
 */
export const LARGO_MAXIMO_VEREDICTO = 97

export function textoDeRespaldo(v, { alerta = '▲', fechaCorte = '' } = {}) {
  const al = fechaCorte ? ` (extracto al ${fechaCorte})` : ''
  switch (v.estado) {
    case 'confirma':
      // Se sacó "— ya está en el saldo del banco": lo dice la palabra COBRADO que abre la frase, y
      // era la parte que el importe largo empujaba fuera de la columna.
      return `COBRADO · el extracto lo tiene el ${v.mov.fechaISO ?? ''} por $${v.mov.importe}`.replace('  ', ' ')
    case 'ambiguo':
      return `${alerta} ${v.cuantos} acreditaciones por ese importe: no puedo decir cuál es ésta`
    case 'fueraDeCorte':
      return `sin juzgar: el extracto todavía no llega a esa fecha${al}`
    case 'anteriorAlExtracto':
      return 'sin juzgar: el cobro es anterior al primer movimiento importado del banco'
    case 'noPasaPorLaCuenta':
      return 'no pasa por la cuenta: su control es el del efectivo en CAJA, no el extracto'
    case 'noComparable':
      return 'sin juzgar: el importe no se puede comparar contra el extracto (moneda extranjera)'
    case 'extractoIlegible':
      return `${alerta} sin juzgar: no pude leer la réplica del banco`
    case 'sinRespaldo':
      // EL PREFIJO NO SE TOCA. La línea "Cobrado que el extracto NO confirma" suma con
      // `LEFT(BB;n)=MARCA_ALERTA_RESPALDO`: cambiarle el arranque a esta frase no da error, da $0.
      //
      // Y LA CONSECUENCIA SE QUEDA. De los 222 caracteres que medía se sacó el diagnóstico ("o falta
      // cargar el movimiento del banco, o el cobro todavía no entró"), que es lo mismo que dice la
      // nota de su línea en el cuadro. Lo que NO se puede sacar es que el Cash Flow lo está contando
      // como ingreso REAL: sin eso el aviso dice que algo está mal y no qué se rompe — y sin el
      // corte, no se puede desmentir. Las dos cosas las exige el test de este módulo.
      return `${alerta} ${MARCA_SIN_RESPALDO} · el Cash Flow lo cuenta como ingreso REAL${al}`
    default:
      return ''
  }
}

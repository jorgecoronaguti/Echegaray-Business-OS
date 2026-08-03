// EXCEDENTE POR VENTANA — un solo motor, el calendario, recorrido día por día.
//
// ═══ EL DEFECTO QUE ESTE MÓDULO EXISTE PARA MATAR ═══
//
// El modelo anterior calculaba UN excedente con esta cuenta:
//
//   comprometida = vencidoFiscal + vencidoComercial + entra30
//   techo        = cajaReal − comprometida − restringida − reserva
//
// Tres cosas están mal ahí, y las tres empujan para el mismo lado:
//
//   1. NUNCA SUMA LO QUE ENTRA. `entra_30_dias` no es plata que entra: son obligaciones que VENCEN
//      (sale de `obligacion_resumen`). El nombre engaña. Con $79M de cobranzas pendientes en el
//      Sheet, restar todo lo que sale y no sumar un peso de lo que entra garantiza "no invertir"
//      pase lo que pase. Medido el 03/08/2026: el modelo devolvía $0 con $99M de pesos líquidos.
//
//   2. RESTA EL 100% DE LOS CHEQUES FIRMADOS SIN DEBITAR, incluidos los que vencen dentro de 90
//      días. Para decidir una colocación a 30 días sólo hay que cubrir lo que vence en esos 30.
//      De $47,9M firmados, $42,4M vencían dentro de 30 días y $5,6M después: los segundos no
//      tienen por qué bloquear una colocación a 30 días.
//
//   3. RESTA DOS VECES LO MISMO. `entra30` sale de `obligacion_resumen` y el calendario YA trae
//      esas mismas obligaciones como egresos fechados; la caja restringida son los cheques de
//      "Cheques Emitidos" y el calendario YA trae esos mismos cheques. Restarlos aparte es contar
//      el mismo peso dos veces.
//
// ═══ CÓMO SE CALCULA ACÁ ═══
//
// Se camina el calendario —la ÚNICA fuente de movimientos— arrancando de los pesos líquidos de hoy,
// y se toma el SALDO MÍNIMO del recorrido. Ese piso es el techo de lo colocable: para inmovilizar
// plata 30 días hay que aguantar todos los días del medio, no sólo el último.
//
// Lo que entra y lo que sale quedan dentro del mismo recorrido, así que no hay forma aritmética de
// restar dos veces el mismo cheque ni de olvidarse una cobranza: si está en el calendario, está
// contado exactamente una vez.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'
import { derivacionDeVentana } from './derivacion-excedente.mjs'

/** Las ventanas que decide el dueño. No es un número único: 30, 60 y 90 días son decisiones distintas. */
export const VENTANAS_DIAS = [30, 60, 90]

/**
 * CUÁNTO TARDA EN ACREDITARSE UN VALOR A DEPOSITAR. Los cheques en cartera NO son caja hoy —eso no
 * cambia—, pero para una ventana de 30 días sí son plata disponible: se depositan y se acreditan
 * mucho antes del vencimiento. Tres días corridos es el plazo conservador de un cheque de plaza; si
 * el piso del período cae ANTES del día 3, el valor no lo salva y el recorrido lo refleja solo.
 */
export const DIAS_ACREDITACION_VALORES = 3

/** Ventana con la que se propuso la reserva mínima (`proponerReservaMinima`, 7 días por defecto). */
export const DIAS_VENTANA_RESERVA = 7

const redondear = (n) => Math.round(Number(n) || 0)

/**
 * SALDO CORRIDO EN PESOS, día por día. Puro: no lee nada, no adivina nada.
 *
 * @param {object} opts
 * @param {Array}  opts.dias              filas del calendario {fecha, ingresos, egresos}
 * @param {number} opts.saldoInicial      pesos LÍQUIDOS de hoy (ni dólares ni valores a depositar)
 * @param {number} opts.vencido           lo que ya venció y no está en el calendario: sale el día 0
 * @param {number} opts.valoresADepositar cheques en cartera; entran el día `diasAcreditacion`
 * @param {number} opts.hasta             cuántos días camina
 * @param {number} opts.factorIngresos    castigo del escenario sobre las cobranzas (1 / 0,5 / 0)
 */
export function saldoCorrido({
  dias = [], saldoInicial = 0, vencido = 0, valoresADepositar = 0,
  diasAcreditacion = DIAS_ACREDITACION_VALORES, hasta = 30, factorIngresos = 1,
} = {}) {
  // EL CALENDARIO TIENE QUE LLEGAR HASTA DONDE SE AFIRMA. Un piso "a 90 días" calculado sobre 11
  // filas no es conservador ni optimista: es inventado. Se declara sin dato y se corta.
  if (dias.length < hasta + 1) {
    return {
      estado: 'sin_dato',
      motivo: `el calendario cubre ${dias.length} día(s) y esta ventana necesita ${hasta + 1}`,
      dias_cubiertos: dias.length,
    }
  }
  let saldo = Number(saldoInicial) - Number(vencido)
  let piso = saldo
  let fechaTension = dias[0]?.fecha ?? null
  // EL ÍNDICE DEL PEOR DÍA, NO SÓLO SU FECHA. La derivación necesita saber HASTA DÓNDE sumar para
  // reconstruir el piso; con la fecha sola hay una ambigüedad de un día justo cuando el peor momento
  // es el arranque (índice −1: antes de que se mueva un solo peso), y un cuadro que no cierra por un
  // día es un cuadro que no cierra.
  let indiceTension = -1
  let entradas = 0
  let salidas = Number(vencido) || 0
  const ventana = dias.slice(0, hasta + 1)
  for (let i = 0; i < ventana.length; i += 1) {
    // El valor a depositar entra UNA vez, el día en que se acredita, y sólo si ese día cae dentro
    // de la ventana. Fuera de la ventana no existe para esta decisión.
    if (i === Number(diasAcreditacion)) { saldo += Number(valoresADepositar) || 0; entradas += Number(valoresADepositar) || 0 }
    const inMov = (Number(ventana[i].ingresos) || 0) * Number(factorIngresos)
    const outMov = Number(ventana[i].egresos) || 0
    entradas += inMov
    salidas += outMov
    saldo = saldo + inMov - outMov
    if (saldo < piso) { piso = saldo; fechaTension = ventana[i].fecha; indiceTension = i }
  }
  return {
    estado: 'ok',
    saldo_inicial: redondear(Number(saldoInicial) - Number(vencido)),
    entradas: redondear(entradas),
    salidas: redondear(salidas),
    saldo_final: redondear(saldo),
    // EL NÚMERO QUE DECIDE. No es el saldo del último día: es el peor día del recorrido.
    piso: redondear(piso),
    fecha_tension: fechaTension,
    indice_tension: indiceTension,
    dias_cubiertos: hasta,
    factor_ingresos: Number(factorIngresos),
  }
}

/**
 * ¿CUÁNTO DE LA RESERVA MÍNIMA YA ESTÁ DESCONTADO POR EL CALENDARIO?
 *
 * La reserva aprobada se propuso como el MÁXIMO entre los egresos confirmados de 7 días, las
 * obligaciones fiscales y laborales, los pagos de obra y un colchón. O sea: es la versión sin
 * calendario de "no inviertas lo que tenés que pagar la semana que viene".
 *
 * Cuando el excedente se calcula caminando el calendario, esos MISMOS egresos ya se restaron día por
 * día. Restar además la reserva entera es contar dos veces la misma plata — y no es teórico: el
 * 03/08/2026 la reserva aprobada era $41.004.461 y los egresos del calendario de los primeros 7 días
 * sumaban prácticamente lo mismo (el grueso, dos cheques de Alumetal por $31,6M el 05/08).
 *
 * Esta función NO cambia la política: la reserva aprobada se sigue restando entera. Lo único que hace
 * es MEDIR el solapamiento para poder declararlo, porque una política que duplica al calendario es
 * una decisión del dueño y no del software (`CLAUDE.md`: una política financiera es siempre D o E).
 */
export function solapeReservaConCalendario(dias = [], reserva = 0, diasVentana = DIAS_VENTANA_RESERVA) {
  const r = Number(reserva) || 0
  if (!(r > 0) || !dias.length) return { reserva: redondear(r), egresos_calendario: 0, solapado: 0, no_solapado: redondear(r) }
  const egresos = dias.slice(0, diasVentana + 1).reduce((s, d) => s + (Number(d.egresos) || 0), 0)
  const solapado = Math.min(r, egresos)
  return {
    reserva: redondear(r),
    dias_ventana: diasVentana,
    egresos_calendario: redondear(egresos),
    solapado: redondear(solapado),
    no_solapado: redondear(r - solapado),
    nota: solapado > 0
      ? `de la reserva aprobada, $${redondear(solapado).toLocaleString('es-AR')} son los MISMOS egresos que el calendario ya descuenta día por día: `
        + 'el excedente los está restando dos veces. Cambiar la política es una decisión del dueño, no del software.'
      : null,
  }
}

/**
 * ¿QUÉ PARTE DE LA CAJA RESTRINGIDA HAY QUE CUBRIR EN ESTA VENTANA?
 *
 * Un cheque firmado que vence dentro de la ventana ya está en el calendario como egreso: se cubre
 * solo. Uno que vence DESPUÉS no compromete esta colocación. El que no tiene fecha puede caer
 * cualquier día y por eso se resta siempre — desconocido no es cero, y acá el lado seguro es restar.
 */
export function restringidaDeVentana(cheques = [], hoy = new Date(), dias = 30) {
  const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const fin = new Date(h0); fin.setDate(fin.getDate() + Number(dias))
  const out = { total: 0, vencidos: 0, dentro: 0, fuera: 0, sin_fecha: 0, n: cheques.length }
  for (const c of cheques) {
    const m = Number(c.monto) || 0
    out.total += m
    const f = c.fecha instanceof Date && !Number.isNaN(c.fecha.getTime()) ? c.fecha : null
    if (!f) { out.sin_fecha += m; continue }
    if (f < h0) out.vencidos += m
    else if (f <= fin) out.dentro += m
    else out.fuera += m
  }
  for (const k of ['total', 'vencidos', 'dentro', 'fuera', 'sin_fecha']) out[k] = redondear(out[k])
  // A RESTAR APARTE del calendario: sólo lo que el calendario NO puede ver. Los vencidos sin debitar
  // quedaron atrás en el tiempo (el calendario arranca hoy) y los sin fecha no caen en ningún día.
  out.a_restar_fuera_del_calendario = out.vencidos + out.sin_fecha
  return out
}

/**
 * UNA VENTANA DE EXCEDENTE. Devuelve el monto colocable, el detalle que lo sostiene y lo que lo
 * invalida. Pura: toda la I/O ya ocurrió antes.
 */
export function ventanaDeExcedente({
  dias = [], hasta = 30, saldoInicial = 0, vencido = 0, valoresADepositar = 0,
  diasAcreditacion = DIAS_ACREDITACION_VALORES, reserva = 0, restringidaFueraDelCalendario = 0,
  factorIngresos = 0.5, hoy = new Date(), fechaCaja = null, vencidoDetalle = null,
} = {}) {
  const corrido = saldoCorrido({
    dias, saldoInicial, vencido, valoresADepositar, diasAcreditacion, hasta, factorIngresos,
  })
  if (corrido.estado !== 'ok') {
    return { dias: hasta, estado: 'sin_dato', motivo: corrido.motivo, monto_maximo: null, corrido }
  }
  const solape = solapeReservaConCalendario(dias, reserva)
  const piso = corrido.piso - (Number(restringidaFueraDelCalendario) || 0)
  const monto = Math.max(0, piso - (Number(reserva) || 0))
  const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + hasta)
  // LA CUENTA VIAJA CON EL NÚMERO. No es un extra opcional: el dueño rechazó tres informes por un
  // monto sin derivación, así que la ventana no se considera completa sin ella.
  const derivacion = derivacionDeVentana({
    dias, hasta, corrido, saldoInicial, vencido, valoresADepositar, diasAcreditacion,
    factorIngresos, reserva, restringidaFueraDelCalendario, fechaCaja, vencidoDetalle, montoMaximo: monto,
  })
  return {
    derivacion,
    dias: hasta,
    estado: 'ok',
    // TRES NÚMEROS, PORQUE SON TRES PREGUNTAS DISTINTAS. El que decide es `monto_maximo`.
    monto_maximo: redondear(monto),
    // Lo que quedaría colocable si la reserva no duplicara al calendario. NO es una recomendación:
    // es el tamaño de la decisión que tiene pendiente el dueño sobre su propia política.
    monto_si_reserva_no_duplicara: redondear(Math.max(0, piso - solape.no_solapado)),
    // El neto al vencimiento — la cuenta "de servilleta". Se publica para que se vea la diferencia
    // contra el piso: entre los dos hay un día de tensión que la cuenta de servilleta no ve.
    neto_al_vencimiento: corrido.saldo_final,
    piso: corrido.piso,
    fecha_tension: corrido.fecha_tension,
    fecha_limite: limite.toISOString().slice(0, 10),
    entradas: corrido.entradas,
    salidas: corrido.salidas,
    reserva_preservada: redondear(reserva),
    solape_reserva: solape,
    restringida_fuera_del_calendario: redondear(restringidaFueraDelCalendario),
    factor_ingresos: Number(factorIngresos),
    evidencia: EVIDENCIA.PROYECCION,
    confianza: CONFIANZA.MEDIA,
  }
}

/**
 * LAS TRES VENTANAS, Y EL MISMO CÁLCULO EN TRES ESCENARIOS DE COBRO.
 *
 * El escenario que gobierna la recomendación es el ADVERSO (entra la mitad de lo cobrable), pero los
 * tres se devuelven: la diferencia entre ellos ES la información. Si el excedente a 30 días es el
 * mismo con el 100% y con el 50% de cobranzas, la decisión no depende de que los clientes paguen — y
 * eso es exactamente lo que hay que saber antes de inmovilizar plata.
 */
export function excedentePorVentana({
  dias = [], ventanas = VENTANAS_DIAS, saldoInicial = 0, vencido = 0, valoresADepositar = 0,
  diasAcreditacion = DIAS_ACREDITACION_VALORES, reserva = 0, restringidaFueraDelCalendario = 0,
  hoy = new Date(), fechaCaja = null, vencidoDetalle = null,
} = {}) {
  const factores = { base: 1, adverso: 0.5, sin_cobranzas: 0 }
  const salida = []
  for (const h of ventanas) {
    const escenarios = {}
    for (const [nombre, f] of Object.entries(factores)) {
      escenarios[nombre] = ventanaDeExcedente({
        dias, hasta: h, saldoInicial, vencido, valoresADepositar, diasAcreditacion,
        reserva, restringidaFueraDelCalendario, factorIngresos: f, hoy, fechaCaja, vencidoDetalle,
      })
    }
    salida.push({
      dias: h,
      // EL QUE MANDA. Recomendar sobre el escenario base es recomendar sobre el mejor de los casos.
      ...escenarios.adverso,
      escenarios,
      // "Si no cobrás nada" es la pregunta que hace un dueño antes de inmovilizar plata, y merece
      // un número propio en vez de una nota al pie.
      monto_sin_creerle_a_las_cobranzas: escenarios.sin_cobranzas.estado === 'ok'
        ? escenarios.sin_cobranzas.monto_maximo : null,
      depende_de_cobranzas: escenarios.adverso.estado === 'ok' && escenarios.sin_cobranzas.estado === 'ok'
        ? escenarios.adverso.monto_maximo > escenarios.sin_cobranzas.monto_maximo
        : null,
    })
  }
  return salida
}

export const VERSION_SKILL = '1.0.0'

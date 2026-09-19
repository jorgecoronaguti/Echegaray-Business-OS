// CUÁNTA PLATA SE PUEDE COLOCAR, POR CUÁNTO TIEMPO, Y SI CONVIENE.
//
// ═══ POR QUÉ EXISTE (31/07) ═══
//
// El dueño quiere poner el excedente transitorio en un instrumento de bajo riesgo en Balanz. La pregunta
// tiene dos mitades y sólo una es de mercado: "qué instrumento" se investiga afuera, pero "CUÁNTO y hasta
// cuándo" sale del Flujo de Fondos y de ninguna otra parte. Colocar plata que hace falta el martes no es
// una inversión: es no poder pagar los jornales.
//
// ═══ EL NÚMERO QUE NADIE MIRABA: EL IMPUESTO AL CHEQUE DECIDE ═══
//
// Sacar la plata de la cuenta paga 0,6% (Ley 25.413 débito) y traerla de vuelta paga 0,6% (crédito): 1,2%
// de ida y vuelta. Un money market que rinde ~1,42% mensual necesita ~25 días sólo para empatar ese
// impuesto. Es decir: LAS VENTANAS CORTAS DESTRUYEN VALOR salvo que el impuesto sea recuperable (cómputo
// como pago a cuenta de Ganancias por Certificado MiPyME) o que se pueda pagar desde la cuenta comitente
// sin volver al banco. Ése es el dato que hay que resolver ANTES de mover un peso, y por eso esta
// capacidad lo calcula en vez de suponerlo.
//
// Nada de esto estima el rendimiento: la tasa se pasa como parámetro con su fecha, porque una tasa vieja
// presentada como de hoy es la forma más cara de equivocarse.

/** El costo del viaje: 0,6% al salir + 0,6% al volver. `recuperable` = fracción computable (MiPyME). */
export function costoDelViaje(monto, { alicuota = 0.006, ida = true, vuelta = true, recuperable = 0 } = {}) {
  const veces = (ida ? 1 : 0) + (vuelta ? 1 : 0)
  const bruto = Number(monto) * alicuota * veces
  return { bruto, neto: bruto * (1 - Math.min(1, Math.max(0, recuperable))), veces, alicuota }
}

/**
 * Días mínimos para que la colocación empate el impuesto al cheque.
 *
 * @param {number} rendimientoMensual fracción (0.0142 = 1,42% mensual)
 * @returns {number|null} días; null si el rendimiento no es positivo (no empata nunca)
 */
export function diasParaEmpatar(rendimientoMensual, opciones = {}) {
  const r = Number(rendimientoMensual)
  if (!(r > 0)) return null
  const { neto } = costoDelViaje(1, opciones)
  if (neto <= 0) return 0 // impuesto recuperable al 100%: empata desde el primer día
  return neto / (r / 30)
}

/**
 * NÚCLEO PURO: el excedente colocable por ventana.
 *
 * La regla es una sola y es conservadora: sobre una ventana, se puede colocar lo que queda después de
 * cubrir TODO lo comprometido hasta el final de esa ventana, SIN contar las cobranzas esperadas. Una
 * cobranza proyectada no es plata: si no entra y la plata está colocada, el que no cobra es el sueldo.
 *
 * @param {number} caja el efectivo de hoy (fuente única: la caja del Flujo)
 * @param {{hasta:string, egresos:number, cobranzasEsperadas?:number}[]} semanas comprometido por semana
 * @returns {{hasta:string, egresosAcumulados:number, colocable:number, conCobranzas:number, dias:number}[]}
 */
export function excedentePorVentana(caja, semanas = [], hoy = null) {
  const base = hoy ? new Date(hoy) : null
  let acum = 0; let acumCob = 0
  return semanas.map((s) => {
    acum += Number(s.egresos) || 0
    acumCob += Number(s.cobranzasEsperadas) || 0
    const dias = base ? Math.round((new Date(s.hasta) - base) / 86400000) : null
    return {
      hasta: s.hasta,
      dias,
      egresosAcumulados: acum,
      // Lo que se puede inmovilizar hasta esa fecha sin depender de que entre una cobranza.
      colocable: Math.max(0, Number(caja) - acum),
      // Lo mismo contando las cobranzas esperadas: se informa aparte, nunca se mezcla.
      conCobranzas: Math.max(0, Number(caja) + acumCob - acum),
    }
  })
}

/**
 * ¿Conviene colocar este monto por estos días? Devuelve la cuenta completa, no un veredicto pelado.
 */
export function convieneColocar({ monto, dias, rendimientoMensual, impuesto = {} } = {}) {
  const rinde = Number(monto) * (Number(rendimientoMensual) / 30) * Number(dias)
  const { bruto, neto } = costoDelViaje(monto, impuesto)
  return {
    monto: Number(monto), dias: Number(dias),
    rinde, impuestoBruto: bruto, impuestoNeto: neto,
    neto: rinde - neto,
    conviene: rinde - neto > 0,
    empataEn: diasParaEmpatar(rendimientoMensual, impuesto),
  }
}

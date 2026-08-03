// LA VARA CONTRA LA QUE SE MIDE UNA COLOCACIÓN — y por qué no siempre es 62,78%.
//
// ═══ EL ERROR QUE ESTE ARCHIVO CORRIGE ═══
//
// La primera versión usaba el CFT del acuerdo (62,78%) como piso universal: cualquier instrumento que
// rindiera menos quedaba excluido, siempre. Eso es correcto SÓLO cuando la empresa está efectivamente
// usando el descubierto — ahí cada peso aplicado a la línea rinde esa tasa, sin riesgo.
//
// Cuando la cuenta NO está en rojo, ese razonamiento es falso y caro: exigirle 62,78% a una colocación
// de siete días equivale a rechazar todo, y entonces la plata se queda quieta rindiendo CERO. El costo
// de oportunidad de no invertir no es "nada": es todo el rendimiento que se dejó de ganar por aplicar
// una vara que no correspondía.
//
// ═══ LOS TRES CASOS, Y CÓMO SE DISTINGUEN CON DATOS ═══
//
//   A · DESCUBIERTO UTILIZADO — hay deuda cancelable. Cancelarla rinde el CFT, libre de riesgo, sin
//       plazo de rescate y sin impuesto sobre la renta. Esa porción tiene vara alta y casi siempre gana.
//
//   B · SIN DESCUBIERTO — la vara NO es el CFT. Es cero más el costo esperado de quedarse corto por
//       haber inmovilizado. Un instrumento al 40% anual puede ser perfectamente razonable.
//
//   C · RIESGO DE ENTRAR EN DESCUBIERTO — inmovilizar puede provocar el déficit. Ahí sí entra el costo
//       del descubierto, pero PONDERADO: sólo por los días y el monto en que la caja quedaría negativa.
//
// ═══ CÓMO SE EVITA INVENTAR UNA PROBABILIDAD ═══
//
// El caso C pide "probabilidad de uso × monto × tasa × duración". Poner una probabilidad a ojo sería
// exactamente la falsa precisión que el `CLAUDE.md` prohíbe. Así que no se estima: se SIMULA sobre el
// calendario que la SKILL 3 ya construyó, en el escenario ADVERSO. Si en ese escenario la caja se va
// a rojo después de inmovilizar el monto, el costo es CIERTO en ese escenario y se calcula día por día
// con el modelo de descubierto ya verificado contra el cargo real del banco.
//
// La probabilidad implícita del escenario adverso es 1: es un supuesto declarado, no un número
// inventado. Y por eso el resultado viaja como INFERENCIA con su escenario a la vista.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'

/** Rendimiento efectivo de una tasa anual efectiva por `dias` días. Aritmética pura. */
export const rendimientoPeriodo = (tea, dias) => (1 + Number(tea)) ** (Number(dias) / 365) - 1

export const MODO = {
  CANCELACION_DEUDA: 'cancelacion_deuda',
  COSTO_OPORTUNIDAD: 'costo_oportunidad',
  CONTINGENCIA: 'contingencia',
}

/**
 * DESCUBIERTO EFECTIVAMENTE UTILIZADO — se mide por CUENTA, no por el total.
 *
 * Es una corrección con dientes: la versión anterior preguntaba si la caja TOTAL era negativa, y la
 * caja total incluye el efectivo y los dólares. Una cuenta corriente $8M en rojo con $20M de efectivo
 * en la caja fuerte da un total positivo — y el banco cobra el descubierto igual, todos los días.
 * Mirando sólo el total, ese costo era invisible.
 */
export function deudaCancelable(composicion = null, cajaReal = 0) {
  if (!composicion?.detalle?.length) {
    // Sin composición sólo se puede mirar el total: es peor, y se declara.
    const d = Number(cajaReal) < 0 ? Math.abs(Number(cajaReal)) : 0
    return { monto: d, por_cuenta: [], evidencia: EVIDENCIA.INFERENCIA, nota: 'sin detalle de cuentas: el descubierto se infirió del saldo total' }
  }
  const negativas = composicion.detalle.filter(
    (c) => Number(c.saldo) < 0 && c.clase !== 'valores_a_depositar' && !c.es_ajuste,
  )
  return {
    monto: negativas.reduce((s, c) => s + Math.abs(Number(c.saldo) || 0), 0),
    por_cuenta: negativas.map((c) => ({ cuenta: c.cuenta, saldo: Math.round(c.saldo) })),
    evidencia: EVIDENCIA.DATO,
    nota: negativas.length ? 'saldos negativos por cuenta' : 'ninguna cuenta en rojo',
  }
}

/**
 * COSTO DE CONTINGENCIA — simula inmovilizar `monto` sobre el calendario y suma el interés del
 * descubierto de cada día en que la caja quedaría negativa.
 *
 * NO es una estimación: es la aritmética del acuerdo aplicada a un escenario declarado. Devuelve
 * también los días y el pico, porque un costo sin su causa no se puede discutir.
 *
 * @param {Array} dias filas del calendario (ingresos/egresos por día)
 * @param {object} p {monto, cajaInicial, reserva, tnaDiaria, factorIngresos}
 */
export function costoContingencia(dias = [], { monto = 0, cajaInicial = 0, reserva = 0, interesDia, factorIngresos = 1, hasta = Infinity } = {}) {
  let saldo = Number(cajaInicial) - Number(monto)
  let costo = 0
  let diasEnRojo = 0
  let pico = 0
  let primerDia = null
  const ventana = dias.slice(0, Number.isFinite(hasta) ? hasta + 1 : dias.length)
  for (const d of ventana) {
    saldo = saldo + (Number(d.ingresos) || 0) * factorIngresos - (Number(d.egresos) || 0)
    const faltante = reserva - saldo // perforar la reserva no cuesta interés, pero quedar NEGATIVO sí
    if (saldo < 0) {
      diasEnRojo += 1
      pico = Math.max(pico, -saldo)
      costo += interesDia(-saldo)
      if (!primerDia) primerDia = d.fecha
    }
    void faltante
  }
  return { costo: Math.round(costo), dias_en_rojo: diasEnRojo, pico: Math.round(pico), primer_dia: primerDia }
}

/**
 * LA VARA, para un monto y un plazo concretos.
 *
 * Devuelve el umbral que un instrumento tiene que superar EN EL PERÍODO, más los tramos que lo
 * explican. Un solo número escondería que los primeros pesos y los últimos no valen lo mismo: si hay
 * deuda, la primera porción del excedente tiene que ir a cancelarla y sólo el resto se compara contra
 * el mercado.
 *
 * @param {object} p
 * @param {number} p.dias horizonte de la colocación
 * @param {number} p.monto monto que se evaluaría inmovilizar
 * @param {number} p.deuda descubierto efectivamente utilizado (case A)
 * @param {Array}  [p.dias_calendario] filas del calendario para simular el caso C
 * @param {number} [p.cajaInicial]
 * @param {number} [p.reserva]
 * @param {number} p.cft tasa efectiva anual del acuerdo
 * @param {function} p.interesDia (saldoNegativo) => interés de un día, con impuestos
 */
export function tasaDeReferencia({
  dias, monto = 0, deuda = 0, dias_calendario = [], cajaInicial = 0, reserva = 0,
  cft = 0, interesDia = () => 0, factorIngresos = 0.5, escenario = 'adverso',
} = {}) {
  const cftPeriodo = rendimientoPeriodo(cft, dias)
  const tramos = []
  let confianza = CONFIANZA.ALTA
  let evidencia = EVIDENCIA.CALCULO

  // ── TRAMO A: lo que debería ir a cancelar deuda ────────────────────────────
  const aCancelar = Math.max(0, Math.min(Number(deuda) || 0, Number(monto) || 0))
  if (aCancelar > 0) {
    tramos.push({
      modo: MODO.CANCELACION_DEUDA,
      desde: 0, hasta: aCancelar,
      hurdle_periodo: cftPeriodo,
      motivo: `cancelar descubierto rinde ${(cftPeriodo * 100).toFixed(2)}% en ${dias} días, sin riesgo de capital ni plazo de rescate`,
      evidencia: EVIDENCIA.HECHO,
    })
  }

  // ── TRAMO B/C: el resto, contra el costo de quedarse corto ─────────────────
  const invertible = Math.max(0, (Number(monto) || 0) - aCancelar)
  let contingencia = null
  if (invertible > 0) {
    contingencia = costoContingencia(dias_calendario, {
      monto: invertible, cajaInicial: Number(cajaInicial) - aCancelar, reserva,
      interesDia, factorIngresos, hasta: dias,
    })
    // El costo se expresa como TASA del período sobre el monto invertido: así se compara pera a pera
    // contra el rendimiento neto del instrumento, que también es del período.
    const tasaContingencia = invertible > 0 ? contingencia.costo / invertible : 0
    // HAY RIESGO SI HAY COSTO, no si hay días en rojo.
    //
    // El monto de la ventana se calcula para tocar exactamente el piso, y el punto flotante lo deja
    // $1 por debajo de cero. Eso marcaba "contingencia" con costo $0 en la corrida real: una etiqueta
    // alarmante sobre ruido de redondeo. Si el costo modelado no llega a un peso, no hay costo — y
    // una vara que dice "contingencia" cuando no pasa nada entrena a ignorarla.
    const hayRiesgo = contingencia.costo >= 1
    tramos.push({
      modo: hayRiesgo ? MODO.CONTINGENCIA : MODO.COSTO_OPORTUNIDAD,
      desde: aCancelar, hasta: aCancelar + invertible,
      hurdle_periodo: tasaContingencia,
      motivo: hayRiesgo
        ? `inmovilizar este monto deja la caja en rojo ${contingencia.dias_en_rojo} día(s) en el escenario ${escenario} (pico $${contingencia.pico.toLocaleString('es-AR')} desde ${contingencia.primer_dia}): el costo del descubierto entra a la comparación`
        : `la cuenta no está en descubierto y el monto no lo provoca en el escenario ${escenario}: la vara NO es el CFT del acuerdo, es superar cero neto`,
      evidencia: hayRiesgo ? EVIDENCIA.INFERENCIA : EVIDENCIA.CALCULO,
      contingencia,
    })
    if (hayRiesgo) { evidencia = EVIDENCIA.INFERENCIA; confianza = CONFIANZA.MEDIA }
    if (!dias_calendario.length) {
      // Sin calendario no se puede simular, y suponer que no hay riesgo sería el optimismo peligroso.
      // Se cae al comportamiento conservador —la vara alta— y se declara por qué.
      tramos[tramos.length - 1].hurdle_periodo = cftPeriodo
      tramos[tramos.length - 1].motivo = 'sin calendario no se puede simular el riesgo de déficit: se aplica la vara conservadora (CFT del acuerdo)'
      tramos[tramos.length - 1].evidencia = EVIDENCIA.ESTIMACION
      evidencia = EVIDENCIA.ESTIMACION
      confianza = CONFIANZA.BAJA
    }
  }

  // El umbral APLICABLE para decidir si una colocación vale la pena es el del tramo marginal: el
  // último peso que se inmoviliza. Si todo el monto va a cancelar deuda, no hay nada que comparar.
  const marginal = tramos[tramos.length - 1] ?? {
    modo: MODO.COSTO_OPORTUNIDAD, hurdle_periodo: 0, motivo: 'no hay monto que evaluar', evidencia: EVIDENCIA.CALCULO,
  }

  return {
    dias,
    modo: marginal.modo,
    hurdle_periodo: marginal.hurdle_periodo,
    // Se expone también la vara del acuerdo para que la explicación pueda contrastar las dos.
    cft_periodo: cftPeriodo,
    monto_a_cancelar_deuda: aCancelar,
    monto_invertible: invertible,
    tramos,
    contingencia,
    escenario,
    evidencia,
    confianza,
    explicacion: marginal.motivo,
  }
}

/** El `interesDia` real del acuerdo, con IVA y percepción. Se inyecta para poder testear sin importar. */
export async function interesDiarioDelAcuerdo() {
  const { interesDelPeriodo, costoConImpuestos } = await import('../costo-descubierto.mjs')
  return (saldoNegativo) => costoConImpuestos(interesDelPeriodo(-Math.abs(Number(saldoNegativo) || 0), 1))
}

export const VERSION_SKILL = '1.1.0'

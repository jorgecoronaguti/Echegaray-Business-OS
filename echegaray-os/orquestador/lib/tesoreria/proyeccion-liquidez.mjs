// SKILL 3 · PROYECTAR LIQUIDEZ — dónde hay excedente y dónde hay tensión, día por día.
//
// ═══ LA PREGUNTA QUE RESPONDE, Y QUE NINGÚN SALDO RESPONDE ═══
//
// Un saldo dice cuánta plata hay hoy. No dice si mañana hay que pagar sueldos. El número que decide
// una inversión no es el saldo: es el **mínimo del período**. Si en los próximos 30 días el saldo
// toca $2M en algún momento, no hay $10M invertibles a 30 días aunque hoy haya $10M en la cuenta.
//
// Por eso esta skill no proyecta "el saldo final": proyecta el PISO de cada horizonte y la fecha en
// que ocurre. Ese piso es el techo de lo invertible, y la fecha de mayor tensión es la fecha límite
// de inmovilización.
//
// ═══ CONSUME EL CALENDARIO, NO LO REHACE ═══
//
// Los días vienen de `calendarioDiario()` vía la SKILL 1. Acá sólo se recorren.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'

/** Los horizontes que el pedido exige. Se recorren sobre el MISMO calendario: una sola lectura. */
export const HORIZONTES_DIAS = [0, 2, 7, 15, 30, 60, 90]

/**
 * ESCENARIOS. No son tres opiniones: son tres castigos declarados sobre los ingresos, porque lo que
 * falla en una constructora no es que los pagos aparezcan de más — es que los cobros llegan tarde.
 * El adverso no toca los egresos: los egresos ya son compromisos, y suponer que se postergan solos
 * es la clase de optimismo que deja a la empresa sin plata.
 */
export const ESCENARIOS = {
  base: { id: 'base', titulo: 'Base', factor_ingresos: 1.0, nota: 'los cobros entran en la fecha del calendario' },
  conservador: { id: 'conservador', titulo: 'Conservador', factor_ingresos: 0.8, nota: 'entra el 80% de lo cobrable' },
  adverso: { id: 'adverso', titulo: 'Adverso', factor_ingresos: 0.5, nota: 'entra la mitad de lo cobrable' },
}

/**
 * NÚCLEO PURO: recorre los días y devuelve el resumen de un horizonte bajo un escenario.
 * @param {Array} dias filas del calendario (fecha, saldo_inicial, ingresos, egresos, saldo_final)
 */
export function resumirHorizonte(dias = [], nDias = 7, escenario = ESCENARIOS.base, cajaInicial = 0) {
  const ventana = dias.slice(0, Math.max(1, nDias + 1))
  // NO ALCANZA CON QUE EL ARRAY NO ESTÉ VACÍO. Con 11 días de calendario, el horizonte de 90 devolvía
  // `ok` — y afirmaba un piso sobre 79 días que nunca se miraron.
  if (ventana.length < nDias + 1) {
    return { dias: nDias, estado: 'sin_dato', motivo: `el calendario cubre ${dias.length} día(s) y este horizonte necesita ${nDias + 1}` }
  }
  let saldo = Number(cajaInicial) || 0
  let minimo = saldo
  let fechaMinimo = ventana[0].fecha
  let ingresos = 0
  let egresos = 0
  for (const d of ventana) {
    const inMov = (Number(d.ingresos) || 0) * escenario.factor_ingresos
    const outMov = Number(d.egresos) || 0
    ingresos += inMov
    egresos += outMov
    saldo = saldo + inMov - outMov
    if (saldo < minimo) { minimo = saldo; fechaMinimo = d.fecha }
  }
  return {
    dias: nDias,
    estado: 'ok',
    escenario: escenario.id,
    saldo_inicial: Math.round(Number(cajaInicial) || 0),
    ingresos: Math.round(ingresos),
    egresos: Math.round(egresos),
    saldo_final: Math.round(saldo),
    saldo_minimo: Math.round(minimo),
    fecha_mayor_tension: fechaMinimo,
    // EL NÚMERO QUE DECIDE. Lo invertible a este plazo no puede superar el piso del período.
    piso_invertible: Math.round(Math.max(0, minimo)),
  }
}

/**
 * VENTANA DE INMOVILIZACIÓN: hasta qué día se puede inmovilizar `monto` sin perforar el piso. Camina
 * el calendario y corta en el primer día donde el saldo, restándole el monto, quedaría por debajo de
 * la reserva mínima. Es la fecha límite real de una inversión, y sale del calendario, no de un plazo
 * cómodo elegido a ojo.
 */
export function ventanaSinPerforar(dias = [], monto = 0, cajaInicial = 0, reservaMinima = 0) {
  let saldo = Number(cajaInicial) || 0
  let ultimaOk = null
  let dia = 0
  for (const d of dias) {
    saldo = saldo + (Number(d.ingresos) || 0) - (Number(d.egresos) || 0)
    if (saldo - monto < reservaMinima) return { dias_libres: dia, fecha_limite: ultimaOk, corta_en: d.fecha }
    ultimaOk = d.fecha
    dia += 1
  }
  return { dias_libres: dia, fecha_limite: ultimaOk, corta_en: null }
}

/**
 * SKILL 3. Proyección completa: todos los horizontes por todos los escenarios.
 * @param {object} flujo salida de la SKILL 1
 */
export function proyectarLiquidez(flujo = {}, opts = {}) {
  if (flujo.estado !== 'ok') {
    return { estado: 'sin_dato', motivo: flujo.motivo ?? 'la lectura del Flujo de Caja no está disponible', evidencia: EVIDENCIA.SIN_DATO }
  }
  const dias = flujo.dias || []
  const cajaInicial = Number(opts.cajaInicial ?? flujo.caja_inicial) || 0
  const escenarios = {}
  for (const e of Object.values(ESCENARIOS)) {
    escenarios[e.id] = {
      ...e,
      horizontes: HORIZONTES_DIAS.map((n) => resumirHorizonte(dias, n, e, cajaInicial)),
    }
  }
  // El piso que gobierna una recomendación es el del escenario ADVERSO, no el del base: recomendar
  // sobre el base es recomendar sobre el mejor de los casos, y la tesorería no se planifica así.
  const pisoPorHorizonte = Object.fromEntries(
    HORIZONTES_DIAS.map((n) => {
      const h = escenarios.adverso.horizontes.find((x) => x.dias === n)
      return [n, h?.estado === 'ok' ? h.piso_invertible : null]
    }),
  )
  return {
    estado: 'ok',
    desde: dias[0]?.fecha ?? null,
    hasta: dias[dias.length - 1]?.fecha ?? null,
    caja_inicial: Math.round(cajaInicial),
    escenarios,
    piso_invertible_por_horizonte: pisoPorHorizonte,
    criterio: 'el techo de lo invertible a N días es el saldo MÍNIMO del período bajo escenario adverso, no el saldo final',
    evidencia: EVIDENCIA.PROYECCION,
    confianza: CONFIANZA.MEDIA,
    fuente: flujo.fuente,
  }
}

export const VERSION_SKILL = '1.0.0'

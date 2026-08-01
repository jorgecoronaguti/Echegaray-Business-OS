// SKILL 6 · COMPARAR ALTERNATIVAS — un ranking por horizonte y moneda, nunca un ranking universal.
//
// ═══ POR QUÉ NO HAY UN "MEJOR INSTRUMENTO" ═══
//
// Un ranking único mezclando plazos y monedas produce siempre el mismo resultado: gana lo más
// riesgoso y lo más ilíquido, porque paga más. Y después la empresa no puede pagar sueldos.
//
// Acá se compara SOLO dentro de un mismo bloque de horizonte y una misma moneda, y con dos filtros
// duros antes del orden:
//
//   1. LIQUIDEZ COMPATIBLE — si el rescate tarda más que la ventana, el instrumento no entra. No es
//      un descuento en el puntaje: es una exclusión. Plata que no vuelve a tiempo no sirve.
//   2. LA VARA DE LA VENTANA — si el rendimiento neto no la supera, no entra. Y la vara NO es fija:
//      con deuda utilizada es el CFT del acuerdo (invertir al 30% debiendo al 62,78% es perder 32,78%
//      con papeleo); sin deuda es el costo de quedarse corto por haber inmovilizado, que suele ser
//      cero. Usar el CFT siempre —lo que hacía la primera versión— rechaza todo y deja la plata
//      quieta rindiendo cero, que también es una pérdida, sólo que invisible.
//
// Lo que no supera un filtro se devuelve en `excluidos` con el motivo. Un instrumento que desaparece
// sin explicación es un instrumento que alguien va a volver a proponer el mes que viene.

import { EVIDENCIA, CONFIANZA } from './contratos.mjs'
import { aTea, esAptoTesoreria } from './instrumentos.mjs'

/** Rendimiento efectivo del período a partir de la TEA. Aritmética pura. */
export const rendimientoDelPeriodo = (tea, dias) => (1 + Number(tea)) ** (Number(dias) / 365) - 1

/**
 * COSTO TOTAL DE ENTRAR Y SALIR. Se resta del rendimiento bruto del período, no de la tasa anual: una
 * comisión del 0,5% sobre una colocación de 7 días se come tres veces el rendimiento, y anualizarla
 * la haría ver como un detalle.
 */
export function costoTotal(inst = {}, { salidaAnticipada = false } = {}) {
  const c = inst.costos || {}
  const partes = [c.comision, c.honorarios, c.spread].filter((x) => Number.isFinite(Number(x)))
  const base = partes.reduce((s, x) => s + Number(x), 0)
  const salida = salidaAnticipada && Number.isFinite(Number(c.salida_anticipada)) ? Number(c.salida_anticipada) : 0
  return { total: base + salida, conocido: partes.length > 0, componentes: partes.length }
}

/**
 * ¿La liquidez del instrumento cabe en la ventana? El plazo real de vuelta es rescate + liquidación:
 * un fondo que "rescata T+0" pero liquida T+2 devuelve la plata en dos días, no en cero.
 */
export function liquidezCompatible(inst = {}, diasVentana) {
  const rescate = Number(inst.plazo_rescate_dias)
  const liq = Number(inst.liquidacion_dias)
  if (!Number.isFinite(rescate) && !Number.isFinite(liq)) {
    return { compatible: false, motivo: 'no se conoce el plazo de rescate ni el de liquidación' }
  }
  const total = (Number.isFinite(rescate) ? rescate : 0) + (Number.isFinite(liq) ? liq : 0)
  if (total > Number(diasVentana)) {
    return { compatible: false, motivo: `la plata vuelve en ${total} días y la ventana es de ${diasVentana}` }
  }
  return { compatible: true, dias_vuelta: total }
}

/**
 * Evalúa UN instrumento contra UNA ventana. Devuelve la fila completa del ranking o la exclusión con
 * su motivo. Pura y determinística: la aritmética no la hace el modelo.
 */
export function evaluarContraVentana(inst, ventana, tasaCorte) {
  const dias = Number(ventana.dias_libres)
  // LA VARA ES LA DE ESTA VENTANA, no una global.
  //
  // Corrección del 01/08: antes se comparaba TODO contra el CFT del acuerdo (62,78%), estuviera o no
  // la empresa usando el descubierto. Con la cuenta en positivo eso rechaza cualquier colocación
  // razonable y la plata se queda quieta rindiendo cero — el costo de oportunidad de no invertir no
  // es "nada". `costo-liquidez.mjs` calcula la vara correcta por ventana: cancelación de deuda si hay
  // deuda, contingencia si inmovilizar lleva la caja a rojo, y cero neto si no pasa ninguna de las dos.
  const ref = ventana.referencia ?? null
  if (inst.moneda !== ventana.moneda) {
    return { excluido: true, motivo: `moneda distinta: el instrumento es ${inst.moneda} y la ventana es ${ventana.moneda}` }
  }
  if (!esAptoTesoreria(inst.categoria)) {
    return { excluido: true, motivo: `la categoría ${inst.categoria} no es apta para caja operativa de una constructora` }
  }
  const liq = liquidezCompatible(inst, dias)
  if (!liq.compatible) return { excluido: true, motivo: liq.motivo }

  const tea = aTea(inst.tasa)
  if (tea == null) {
    return { excluido: true, motivo: inst.tasa ? `la tasa es "${inst.tasa.tipo}" y no se puede llevar a efectiva anual sin inventar` : 'no tiene tasa conocida' }
  }
  const bruto = rendimientoDelPeriodo(tea, dias)
  const costos = costoTotal(inst)
  const neto = bruto - costos.total
  // Sin referencia calculada se cae a la vara conservadora (el CFT): es el lado seguro, y se nota
  // porque el motivo de exclusión lo dice.
  const corteP = ref
    ? Number(ref.hurdle_periodo) || 0
    : rendimientoDelPeriodo(Number(tasaCorte?.valor) || 0, dias)

  if (neto <= corteP) {
    return {
      excluido: true,
      motivo: ref
        ? `rinde ${(neto * 100).toFixed(2)}% neto en ${dias} días y la vara de esta ventana es ${(corteP * 100).toFixed(2)}% — ${ref.explicacion}`
        : `rinde ${(neto * 100).toFixed(2)}% en ${dias} días y sin referencia calculada se aplica la vara conservadora ${(corteP * 100).toFixed(2)}%`,
    }
  }
  const monto = Number(ventana.monto_maximo) || 0
  return {
    excluido: false,
    instrumento_id: inst.id,
    instrumento: inst.nombre,
    categoria: inst.categoria,
    moneda: inst.moneda,
    tea,
    rendimiento_bruto_periodo: bruto,
    costos_periodo: costos.total,
    costos_conocidos: costos.conocido,
    rendimiento_neto_periodo: neto,
    exceso_sobre_corte: neto - corteP,
    vara_periodo: corteP,
    modo_vara: ref?.modo ?? 'cft_conservador',
    ganancia_neta_estimada: Math.round(monto * neto),
    dias_vuelta: liq.dias_vuelta,
    evidencia: inst.evidencia,
    campos_faltantes: inst.campos_faltantes || [],
  }
}

/**
 * SKILL 6. Un ranking por ventana. El orden es por EXCESO SOBRE LA TASA DE CORTE, no por rendimiento:
 * lo que importa no es cuánto paga, sino cuánto paga por encima de lo que ya cuesta el propio dinero.
 *
 * Desempate: menos días de vuelta primero. Entre dos que rinden casi lo mismo, gana el que devuelve
 * la plata antes — en tesorería la liquidez es el activo, no el rendimiento.
 */
export function compararAlternativas(instrumentos = [], ventanas = [], tasaCorte = { valor: 0 }) {
  const rankings = []
  for (const v of ventanas) {
    if (!['A', 'B', 'C', 'D', 'E'].includes(v.bloque) || !(Number(v.monto_maximo) > 0)) continue
    const filas = []
    const excluidos = []
    for (const inst of instrumentos) {
      const r = evaluarContraVentana(inst, v, tasaCorte)
      if (r.excluido) excluidos.push({ instrumento: inst.nombre, instrumento_id: inst.id, motivo: r.motivo })
      else filas.push(r)
    }
    filas.sort((a, b) => (b.exceso_sobre_corte - a.exceso_sobre_corte) || (a.dias_vuelta - b.dias_vuelta))
    rankings.push({
      bloque: v.bloque,
      titulo: v.titulo,
      moneda: v.moneda,
      dias: v.dias_libres,
      monto_maximo: v.monto_maximo,
      vara_periodo: v.referencia ? Number(v.referencia.hurdle_periodo) || 0 : rendimientoDelPeriodo(Number(tasaCorte.valor) || 0, Number(v.dias_libres)),
      modo_vara: v.referencia?.modo ?? 'cft_conservador',
      explicacion_vara: v.referencia?.explicacion ?? 'sin referencia calculada: vara conservadora del acuerdo',
      cft_periodo_referencia: rendimientoDelPeriodo(Number(tasaCorte.valor) || 0, Number(v.dias_libres)),
      ranking: filas,
      excluidos,
      // SIN GANADOR TAMBIÉN ES UN RESULTADO, y es el más probable en esta empresa. Decirlo explícito
      // evita que el consumidor lea una lista vacía como "faltó relevar".
      veredicto: filas.length
        ? 'hay alternativas que superan la vara de esta ventana'
        : 'ninguna alternativa supera la vara de esta ventana',
      // Una ventana no accionable puede tener ranking: sirve para saber QUÉ habría, no para actuar.
      accionable: Boolean(v.accionable),
      estado_recomendacion: v.estado_recomendacion ?? 'NO_ACCIONABLE',
    })
  }
  return {
    estado: 'ok',
    rankings,
    evidencia: EVIDENCIA.CALCULO,
    confianza: instrumentos.length ? CONFIANZA.MEDIA : CONFIANZA.NULA,
    criterio: 'un ranking por bloque de horizonte y moneda; filtros duros de liquidez y de la vara de CADA ventana antes del orden',
  }
}

export const VERSION_SKILL = '1.1.0'

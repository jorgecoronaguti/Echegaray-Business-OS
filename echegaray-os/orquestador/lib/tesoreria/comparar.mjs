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
//   2. TASA DE CORTE — si el rendimiento neto no supera el costo del peso marginal de la empresa,
//      no entra. Invertir al 30% teniendo deuda al 62,78% es perder 32,78% con papeleo.
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
  const corteP = rendimientoDelPeriodo(Number(tasaCorte?.valor) || 0, dias)

  if (neto <= corteP) {
    return {
      excluido: true,
      motivo: `rinde ${(neto * 100).toFixed(2)}% en ${dias} días y el peso marginal de la empresa cuesta ${(corteP * 100).toFixed(2)}%: aplicar la plata a la deuda gana`,
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
      tasa_de_corte_periodo: rendimientoDelPeriodo(Number(tasaCorte.valor) || 0, Number(v.dias_libres)),
      ranking: filas,
      excluidos,
      // SIN GANADOR TAMBIÉN ES UN RESULTADO, y es el más probable en esta empresa. Decirlo explícito
      // evita que el consumidor lea una lista vacía como "faltó relevar".
      veredicto: filas.length ? 'hay alternativas que superan el costo del dinero' : 'ninguna alternativa supera el costo del dinero de la empresa',
    })
  }
  return {
    estado: 'ok',
    rankings,
    evidencia: EVIDENCIA.CALCULO,
    confianza: instrumentos.length ? CONFIANZA.MEDIA : CONFIANZA.NULA,
    criterio: 'un ranking por bloque de horizonte y moneda; filtros duros de liquidez y tasa de corte antes del orden',
  }
}

export const VERSION_SKILL = '1.0.0'

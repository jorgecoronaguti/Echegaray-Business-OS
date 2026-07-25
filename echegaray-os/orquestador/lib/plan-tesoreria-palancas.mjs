// PALANCAS DEL PLAN DE TESORERÍA — el espacio de decisiones que un CFO explora, modelado, no en prosa.
//
// El núcleo `construirPlan` (plan-tesoreria.mjs) sabía variar dos cosas: financiar-o-postergar lo no
// crítico, y el piso de liquidez. Este módulo agrega las PALANCAS OPCIONALES que faltaban para cuestionar
// el estado actual como lo haría un tesorero de verdad. Cada una tiene default = comportamiento actual, así
// que el plan sin palancas es byte-idéntico al de antes (retrocompat total):
//
//   • reordenarPorObra   — priorizar los pagos de UNA obra (la de mayor exposición) antes de agotar la caja
//   • dividirPago        — pagar parte hoy con caja y negociar el resto, en vez de postergar el pago entero
//   • cubrirConChequeDescuento — cubrir un bache descontando un cheque en cartera (costo ÚNICO, no toca línea)
//   • aplicarNegociacion — mover un egreso a una fecha cierta acordada (decisión explícita, no "postergar")
//
// REGLA: no se inventa plata. El costo del descuento sale de compararFinanciamiento; el orden sale de
// priorizarPagos; las fechas salen del calendario. Este módulo sólo REUBICA y NARRA decisiones sobre
// números que otros motores ya calcularon. Importa `accion` y `medioSugerido` del núcleo (import circular
// seguro: se usan en tiempo de ejecución, no al evaluar el módulo).

import { fmt } from './ingenieria-financiera.mjs'
import { accion, medioSugerido } from './plan-tesoreria.mjs'
import {
  estrategiaPagarCaja, estrategiaPostergar, estrategiaPagarCritico,
  estrategiaChequeDescuento, estrategiaNegociarPlazo,
} from './plan-estrategia.mjs'

const round = (n) => Math.round(Number(n) || 0)

// ════════════════════════════════════════════════════════════════════════════
// PALANCA 1 — ORDEN DE PAGOS: proteger una obra
// ════════════════════════════════════════════════════════════════════════════

/**
 * Reordena los pagos ya priorizados poniendo primero los de una obra (sin romper el orden multicriterio
 * DENTRO de cada grupo). Default (obra falsy) = deja el orden de priorizarPagos intacto.
 */
export function reordenarPorObra(ordenados, obra) {
  if (!obra) return ordenados
  return [...ordenados.filter((x) => x.obra === obra), ...ordenados.filter((x) => x.obra !== obra)]
}

// ════════════════════════════════════════════════════════════════════════════
// PALANCA 2 — DIVISIÓN DE UN PAGO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Paga PARTE de un egreso no crítico con la caja disponible y posterga el resto, en lugar de postergar el
 * pago entero. Sostiene la relación (algo se paga) y baja el monto que queda pendiente. Reusa los tipos de
 * acción existentes (pagar + postergar), así que la web y los contadores no cambian.
 */
export function dividirPago(est, fecha, it, monto, disponible, acciones, nid) {
  const parcial = round(disponible)
  const resto = round(monto - parcial)
  est.saldo -= parcial
  acciones.push(accion(nid(fecha, 'pagar'), fecha, 'pagar', `Pagar parcial ${it.proveedor} ${fmt(parcial)} de ${fmt(monto)}`, {
    motivo: `no es crítico: se paga lo que la caja permite sin perforar el piso (${fmt(est.liquidezMinima)}) y se negocia el resto`,
    impacto_pesos: parcial, costo_financiero: 0, efecto_liquidez: -parcial,
    medio: medioSugerido(it), riesgos: 'pago parcial: acordar con el proveedor el saldo restante para no dañar la relación',
    dependencias: [], requiere_aprobacion: true,
    estrategia: estrategiaPagarCaja(it, parcial),
  }))
  acciones.push(accion(nid(fecha, 'postergar'), fecha, 'postergar', `Postergar resto ${it.proveedor} ${fmt(resto)}`, {
    motivo: `saldo del pago dividido: ${fmt(resto)} que la caja no cubre hoy sin perforar el piso`,
    impacto_pesos: resto, costo_financiero: 0, efecto_liquidez: 0, sugerir_negociar: true,
    riesgos: 'negociar el nuevo plazo del saldo; el pago parcial ya sostuvo parte de la relación',
    dependencias: [], requiere_aprobacion: true,
    estrategia: estrategiaPostergar(it, resto, est),
  }))
}

// ════════════════════════════════════════════════════════════════════════════
// PALANCA 3 — DESCUENTO DE CHEQUE (cubrir un bache sin tocar la línea)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cubre el faltante de un crítico descontando un cheque en cartera: la plata entra HOY con un costo ÚNICO
 * (el de descuento, que ya calculó compararFinanciamiento), NO suma deuda de línea y no arrastra interés
 * diario. Devuelve true si pudo (la vía es factible y su costo se conoce); false para caer al descubierto.
 */
export function cubrirConChequeDescuento(est, fecha, it, monto, disponible, faltante, cmp, acciones, nid) {
  const alt = (cmp?.alternativas || []).find((a) => a.via === 'descuento_cheque')
  if (!alt || alt.costoFinanciero == null || alt.factible === false) return false
  const costoUnico = round(alt.costoFinanciero)
  // La plata la trae el cheque descontado (no es línea revolvente): sube la caja hoy, no suma deuda de
  // línea; el banco cobra el cheque al librador. El costo se carga UNA vez, no día a día.
  est.saldo += faltante
  est.saldo -= monto
  est.costoFinanciero += costoUnico
  const idFin = nid(fecha, 'financiar')
  acciones.push(accion(idFin, fecha, 'financiar', `Descontar un cheque por ${fmt(faltante)}`, {
    motivo: `${it.proveedor} es crítico y la caja no alcanza: se adelanta un cheque en cartera en vez de girar la línea`,
    impacto_pesos: faltante, costo_financiero: costoUnico, efecto_liquidez: +faltante, linea: 'descuento_cheque',
    riesgos: `costo ÚNICO de descuento ${fmt(costoUnico)} (no se repaga: el banco cobra el cheque al librador); ASUME disponer de un cheque en cartera por al menos ${fmt(faltante)} — verificar cartera de valores`,
    dependencias: [], requiere_aprobacion: true,
    estrategia: estrategiaChequeDescuento(it, faltante, costoUnico, cmp),
  }))
  acciones.push(accion(nid(fecha, 'pagar'), fecha, 'pagar', `Pagar ${it.proveedor} ${fmt(monto)}`, {
    motivo: `crítico: ${fmt(disponible)} de caja + ${fmt(faltante)} de un cheque descontado`,
    impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: -monto,
    medio: medioSugerido(it), riesgos: 'usa un cheque descontado: costo único, sin deuda de línea que arrastre interés diario',
    dependencias: [idFin], requiere_aprobacion: true,
    estrategia: estrategiaPagarCritico(it, monto, disponible, faltante),
  }))
  return true
}

// ════════════════════════════════════════════════════════════════════════════
// PALANCA 4 — NEGOCIACIÓN DE PLAZO (mover un egreso a una fecha cierta)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Mueve UN egreso (proveedor + monto que el diseñador ya identificó) a una fecha nueva dentro del
 * horizonte: la salida se corre a un día con más holgura (típicamente después de un cobro). Devuelve una
 * copia de `dias` con el movimiento reubicado y la lista de negociaciones para emitir la acción explícita.
 * Default (negociar falsy) = no toca nada.
 */
export function aplicarNegociacion(dias, negociar) {
  if (!negociar?.proveedor) return { dias, negociaciones: [] }
  const out = dias.map((d) => ({ ...d, movimientos: [...(d.movimientos || [])] }))
  const negociaciones = []
  for (const d of out) {
    const idx = d.movimientos.findIndex((m) => m.tipo === 'egreso' && (m.proveedor || m.detalle) === negociar.proveedor && round(m.monto) === round(negociar.monto))
    if (idx < 0) continue
    const [mov] = d.movimientos.splice(idx, 1)
    const destino = out.find((x) => x.fecha === negociar.fechaNueva)
    if (destino) destino.movimientos.push(mov)
    negociaciones.push({ fechaOrig: d.fecha, fechaNueva: negociar.fechaNueva, dias: negociar.dias, mov, dentroHorizonte: !!destino })
    break // una negociación por invocación: decisión explícita y acotada
  }
  return { dias: out, negociaciones }
}

/** Emite la acción explícita `negociar_plazo` en la fecha original — la decisión, no un efecto colateral. */
export function emitirNegociacion(neg, acciones, nid) {
  const it = { proveedor: neg.mov.proveedor || neg.mov.detalle || 'sin identificar', obra: neg.mov.obra || null, vencida: !!neg.mov.vencida }
  const monto = round(neg.mov.monto)
  acciones.push(accion(nid(neg.fechaOrig, 'negociar_plazo'), neg.fechaOrig, 'negociar_plazo',
    `Negociar plazo ${it.proveedor} ${fmt(monto)} → ${neg.fechaNueva}`, {
      motivo: `se acuerda correr el vencimiento ${neg.dias} día(s) para pagar con holgura (${neg.dentroHorizonte ? `dentro del horizonte, ${neg.fechaNueva}` : 'más allá de este horizonte'})`,
      impacto_pesos: monto, costo_financiero: 0, efecto_liquidez: 0, sugerir_negociar: true, nueva_fecha: neg.fechaNueva,
      riesgos: 'requiere la conformidad del proveedor sobre el nuevo vencimiento',
      dependencias: [], requiere_aprobacion: true,
      estrategia: estrategiaNegociarPlazo(it, monto, neg.fechaOrig, neg.fechaNueva, neg.dias),
    }))
}

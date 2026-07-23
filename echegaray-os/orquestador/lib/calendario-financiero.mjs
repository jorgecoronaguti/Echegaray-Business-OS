// CALENDARIO FINANCIERO — el día a día de la tesorería, para que la Web lo PINTE (no lo calcule).
//
// ═══ POR QUÉ EXISTE (23/07) ═══
//
// La interfaz ejecutiva del Calendario Financiero necesita, por cada día: saldo inicial, ingresos,
// egresos, saldo final, y el desglose (obligaciones, impuestos, cargas sociales, cheques, cobranzas),
// más el nivel de riesgo. La regla del proyecto es TERMINANTE: esa lógica vive en el motor, nunca en
// React. Este archivo es esa lógica. La Web sólo consume el resultado.
//
// ═══ NO DUPLICA NINGÚN NÚMERO ═══
//
// El saldo de arranque sale de la caja (cash-briefing, dueño del saldo). Los movimientos fechados
// salen de las MISMAS pestañas y vistas que ya usa el resto del OS (Cheques, Cobranzas del Cash Flow,
// obligacion_resumen). El calendario sólo los ORDENA por día y arrastra el saldo. Un saldo inicial de
// un día es el saldo final del anterior: es aritmética sobre datos ajenos, no un cálculo nuevo.

import { ACUERDO } from './banco-santander.mjs'

const aDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const claveDia = (d) => {
  const x = aDia(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/** Clasifica un egreso por su concepto/proveedor. Una sola definición, la misma para todo el motor. */
export function categoriaEgreso(texto = '') {
  const t = String(texto).toLowerCase()
  if (/f931|cargas? social|uocra|ieric|fondo de cese|seguridad social|previsional/.test(t)) return 'cargas_sociales'
  if (/iva|iibb|ingresos brutos|ganancias|arca|afip|dgr|impuest|sicore|monotrib|débito|debito y crédito/.test(t)) return 'impuesto'
  if (/cheque|echeq/.test(t)) return 'cheque'
  return 'obligacion'
}

/** El riesgo de cerrar un día en descubierto. bajo = queda en positivo; medio = lo cubre la línea;
 *  alto = el rojo supera el acuerdo (no hay con qué taparlo). */
export function nivelRiesgo(saldoFinal, limiteDescubierto = 0) {
  if (saldoFinal >= 0) return 'bajo'
  if (-saldoFinal <= limiteDescubierto) return 'medio'
  return 'alto'
}

/**
 * NÚCLEO PURO: arma el calendario día por día a partir de movimientos ya fechados.
 *
 * @param {object} p
 * @param {number} p.cajaInicial saldo de caja al comienzo de la ventana
 * @param {Array<{fecha:Date, tipo:'ingreso'|'egreso', monto:number, categoria?:string, proveedor?:string,
 *   cliente?:string, obra?:string, cuenta?:string, medio?:string, origen?:string, detalle?:string}>} movimientos
 * @param {Date} p.desde
 * @param {Date} p.hasta
 * @param {number} [p.limiteDescubierto]
 * @returns {Array<object>} un objeto por día
 */
export function armarCalendario({ cajaInicial = 0, movimientos = [], desde, hasta, limiteDescubierto = ACUERDO.importe } = {}) {
  const porDia = new Map()
  for (const m of movimientos) {
    if (!(m?.fecha instanceof Date) || Number.isNaN(m.fecha.getTime())) continue
    const k = claveDia(m.fecha)
    if (!porDia.has(k)) porDia.set(k, [])
    porDia.get(k).push(m)
  }
  const dias = []
  let saldo = Number(cajaInicial) || 0
  const fin = aDia(hasta)
  for (const d = aDia(desde); d <= fin; d.setDate(d.getDate() + 1)) {
    const movs = porDia.get(claveDia(d)) || []
    const sumar = (pred) => movs.filter(pred).reduce((s, m) => s + Math.abs(Number(m.monto) || 0), 0)
    const ingresos = sumar((m) => m.tipo === 'ingreso')
    const egresos = sumar((m) => m.tipo === 'egreso')
    const inicial = saldo
    const final = inicial + ingresos - egresos
    saldo = final
    const catE = (c) => sumar((m) => m.tipo === 'egreso' && (m.categoria || categoriaEgreso(m.detalle || m.proveedor)) === c)
    dias.push({
      fecha: claveDia(d),
      saldo_inicial: Math.round(inicial),
      ingresos: Math.round(ingresos),
      egresos: Math.round(egresos),
      saldo_final: Math.round(final),
      obligaciones: Math.round(catE('obligacion')),
      impuestos: Math.round(catE('impuesto')),
      cargas_sociales: Math.round(catE('cargas_sociales')),
      cheques: Math.round(catE('cheque')),
      cobranzas: Math.round(sumar((m) => m.tipo === 'ingreso' && (m.categoria || 'cobranza') === 'cobranza')),
      descubierto_utilizado: Math.round(final < 0 ? -final : 0),
      credito_disponible: Math.round(Math.max(0, limiteDescubierto - (final < 0 ? -final : 0))),
      riesgo: nivelRiesgo(final, limiteDescubierto),
      // "cantidad de recomendaciones" del día: un día en riesgo pide al menos una acción. Las acciones
      // concretas (con su justificación económica) las provee recomendaciones() del motor, global.
      recomendaciones: nivelRiesgo(final, limiteDescubierto) === 'bajo' ? 0 : 1,
      movimientos: movs.map((m) => ({
        tipo: m.tipo,
        monto: Math.round(Math.abs(Number(m.monto) || 0)),
        categoria: m.categoria || (m.tipo === 'egreso' ? categoriaEgreso(m.detalle || m.proveedor) : 'cobranza'),
        proveedor: m.proveedor || null,
        cliente: m.cliente || null,
        obra: m.obra || null,
        cuenta: m.cuenta || null,
        medio: m.medio || null,
        origen: m.origen || null,
        detalle: m.detalle || null,
      })),
    })
  }
  return dias
}

/**
 * Reúne los movimientos fechados de las fuentes reales del OS y arma el calendario. 0 recálculo: sólo
 * lee y ordena. Cada bloque degrada a vacío si su fuente falla — nunca inventa un movimiento.
 *
 * @param {object} deps {google}
 * @param {object} [opts] {dias=60, hoy}
 */
export async function calendarioDiario(deps = {}, opts = {}) {
  const { cashBriefing, CASHFLOW_ID, parseMonto, parseFecha } = await import('./cash-briefing.mjs')
  const google = deps.google
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  const dias = Math.max(1, Number(opts.dias) || 60)
  const desde = aDia(hoy)
  const hasta = new Date(desde); hasta.setDate(hasta.getDate() + dias)

  // Saldo de arranque: la caja de hoy (fuente única = cash-briefing).
  let cajaInicial = 0
  try { cajaInicial = (await cashBriefing(google, hoy)).caja?.total ?? 0 } catch { cajaInicial = 0 }

  const movimientos = []
  // EGRESOS — cheques emitidos no debitados. La pestaña real es "Cheques Emitidos" y su registro
  // arranca donde el Tipo dice FISICO/ECHEQ (no en una fila fija): A Tipo(0), E Proveedor(4),
  // F Monto(5), I fecha de pago(8, DD/MM/YYYY), K DEBITADO(10). Un debitado ya salió de la cuenta.
  try {
    const chq = await google.readSheetValues(CASHFLOW_ID, 'Cheques Emitidos!A1:L997').catch(() => [])
    for (const r of chq) {
      if (!/^(fisico|echeq)$/i.test(String(r?.[0] ?? '').trim())) continue // sólo filas del registro
      if (/^si$/i.test(String(r?.[10] ?? '').trim())) continue // ya debitado: ya salió de la cuenta
      const fecha = parseFecha(r?.[8]); const monto = parseMonto(r?.[5])
      if (!fecha || fecha < desde || fecha > hasta || !(monto > 0)) continue
      const proveedor = String(r?.[4] ?? '').trim()
      movimientos.push({ fecha, tipo: 'egreso', monto, categoria: categoriaEgreso(proveedor), proveedor, obra: String(r?.[11] ?? '').trim() || null, medio: 'Cheque', origen: 'Cheques Emitidos' })
    }
  } catch { /* sin cheques: el día queda sin ese egreso */ }

  // INGRESOS — cobranzas no cobradas con fecha de cobro. La pestaña real es "Cobranzas": cliente
  // idx6, monto idx12, estado idx14, fecha cobro idx16.
  try {
    const cob = await google.readSheetValues(CASHFLOW_ID, 'Cobranzas!A5:R2000').catch(() => [])
    for (const r of cob) {
      if (/cobrado/i.test(String(r?.[14] ?? ''))) continue
      const fecha = parseFecha(r?.[16]); const monto = parseMonto(r?.[12])
      if (!fecha || fecha < desde || fecha > hasta || !(monto > 0)) continue
      movimientos.push({ fecha, tipo: 'ingreso', monto, categoria: 'cobranza', cliente: String(r?.[6] ?? '').trim(), origen: 'Cobranzas (Cash Flow)' })
    }
  } catch { /* sin cobranzas */ }

  // EGRESOS — obligaciones con vencimiento (vista única obligacion_resumen).
  try {
    const { query } = await import('./db.mjs')
    const { rows } = await query('select concepto, saldo_pendiente::float8 saldo, fecha_vencimiento venc from public.obligacion_resumen where fecha_vencimiento is not null')
    for (const o of rows) {
      const fecha = o.venc ? aDia(new Date(o.venc)) : null
      const monto = Math.max(0, Number(o.saldo) || 0)
      if (!fecha || fecha < desde || fecha > hasta || !(monto > 0)) continue
      movimientos.push({ fecha, tipo: 'egreso', monto, categoria: categoriaEgreso(o.concepto), detalle: o.concepto, origen: 'obligacion_resumen' })
    }
  } catch { /* sin obligaciones */ }

  const diasCal = armarCalendario({ cajaInicial, movimientos, desde, hasta, limiteDescubierto: ACUERDO.importe })
  return {
    desde: claveDia(desde),
    hasta: claveDia(hasta),
    caja_inicial: Math.round(cajaInicial),
    dias: diasCal,
    fuentes: 'cash-briefing (caja) · Cheques y 02_Cobranzas del Cash Flow · obligacion_resumen',
  }
}

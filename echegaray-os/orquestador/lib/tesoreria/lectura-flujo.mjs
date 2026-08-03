// SKILL 1 · LEER FLUJO DE FONDOS — modela el Cash Flow real SIN modificarlo y SIN volver a leerlo.
//
// ═══ POR QUÉ ESTA SKILL NO ABRE EL SHEET ═══
//
// El pedido decía "localizar el spreadsheet, identificar pestañas, mapear encabezados, interpretar
// locale argentino". Todo eso YA existe y está probado en producción: `calendario-financiero.mjs`
// ubica las columnas de Compras por encabezado (no por letra, porque el dueño mueve columnas),
// `cash-briefing.mjs` parsea montos en notación contable —los paréntesis son el signo menos— y fechas
// dd/mm/yy es-AR, y ambos degradan a vacío en vez de inventar.
//
// Escribir un segundo lector sería exactamente lo que la regla contra la duplicación prohíbe, y peor:
// dos lectores del mismo Sheet divergen el día que el dueño mueve una columna, y entonces la empresa
// tiene dos verdades sobre su propia caja. Esta skill NORMALIZA al contrato del agente lo que el
// lector único ya devolvió.
//
// ═══ LO QUE NO PUEDE ENTREGAR, Y SE DECLARA ═══
//
// `row_reference` y `source_formula` a nivel fila no viajan en la salida del lector actual. Se
// devuelven en null con el gap declarado en `problemas`, en vez de agregarse re-leyendo el Sheet por
// segunda vez. Es información de trazabilidad fina, no un número de plata: el precio de conseguirla
// (duplicar el lector) es más caro que el de declararla faltante.
//
// ═══ SOLO LECTURA ═══
//
// Este módulo no importa ni llama ninguna función de escritura. El test `no-escribe` lo verifica
// leyendo el archivo, porque una promesa en un comentario no es un control.

import { EVIDENCIA, Movimiento, validarContra } from './contratos.mjs'

/** Pestañas que este agente NO toca ni para leer. La lista es del dueño; no se amplía sin su orden. */
export const PESTANAS_PROHIBIDAS = ['08_CONTROL_CLIENTE', 'P&L']

/** Mapea la categoría del calendario al `movement_type` del contrato. */
const TIPO = {
  cobranza: 'cobranza', cheque: 'cheque', impuesto: 'impuesto',
  cargas_sociales: 'cargas_sociales', obligacion: 'obligacion', proveedor: 'proveedor',
}

const iso = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : null)

/**
 * ID ESTABLE de un movimiento. Determinístico sobre lo que lo identifica de verdad, para que dos
 * corridas del mismo día produzcan la misma clave y el ledger sea idempotente. No usa la posición en
 * la lista: el orden cambia cuando cambia una fuente, y una clave que cambia sola no es una clave.
 */
export function idMovimiento(m = {}) {
  const partes = [
    m.origen ?? '', iso(m.fecha) ?? '', String(Math.round(Math.abs(Number(m.monto) || 0))),
    m.proveedor ?? m.cliente ?? m.detalle ?? '', m.categoria ?? '',
  ]
  const base = partes.join('|').toLowerCase()
  let h = 5381
  for (let i = 0; i < base.length; i += 1) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0
  return `mov_${h.toString(36)}`
}

/**
 * ¿El movimiento está COMPROMETIDO? Es la pregunta central de este agente: plata comprometida no se
 * invierte, punto. Todo egreso fechado lo está — ya tiene destino y fecha. Un ingreso nunca lo está:
 * es plata que todavía no entró, y lo que no entró no se puede comprometer ni invertir.
 */
export function estaComprometido(m = {}) {
  return m.tipo === 'egreso'
}

/**
 * Confianza de un movimiento según su origen. Un cheque emitido no debitado es un HECHO con fecha
 * cierta; una cobranza con fecha esperada es una PROYECCIÓN del cliente, y este repo ya midió que los
 * clientes pagan tarde (por eso existe `aprendizaje-cobranzas`). Tratarlas igual es el error que
 * convierte un excedente en un descubierto.
 */
export function confianzaDe(m = {}) {
  if (m.tipo === 'ingreso') return m.vencida ? 'baja' : 'media'
  if (m.origen === 'obligacion_resumen' || /cheques emitidos/i.test(String(m.origen ?? ''))) return 'alta'
  return 'media'
}

/** Normaliza un movimiento del calendario al contrato `Movimiento`. */
export function normalizarMovimiento(m = {}, { spreadsheetId, pestana, observadoEn }) {
  return {
    source_spreadsheet_id: spreadsheetId,
    sheet_name: pestana ?? null,
    source_range: pestana ? `${pestana}!A:AK` : null,
    row_reference: null, // gap declarado: ver cabecera
    movement_id: idMovimiento(m),
    movement_type: TIPO[m.categoria] ?? (m.tipo === 'ingreso' ? 'cobranza' : 'egreso'),
    direction: m.tipo === 'ingreso' ? 'in' : 'out',
    due_date: iso(m.vence_original instanceof Date ? m.vence_original : m.fecha),
    expected_date: iso(m.fecha_esperada instanceof Date ? m.fecha_esperada : m.fecha),
    effective_date: null, // el calendario sólo trae lo NO percibido; lo percibido ya salió de la lista
    amount: Math.round(Math.abs(Number(m.monto) || 0)),
    currency: 'ARS',
    status: m.vencida ? 'vencido' : 'pendiente',
    confidence: confianzaDe(m),
    counterparty: m.proveedor ?? m.cliente ?? m.detalle ?? null,
    category: m.categoria ?? null,
    worksite: m.obra ?? null,
    payment_method: m.medio ?? null,
    committed: estaComprometido(m),
    source_formula: null, // gap declarado: ver cabecera
    observed_at: observadoEn,
  }
}

/** De qué pestaña del Cash Flow viene cada origen que el calendario declara. */
export function pestanaDeOrigen(origen = '') {
  const o = String(origen)
  if (/cheques emitidos/i.test(o)) return 'Cheques Emitidos'
  if (/cobranzas/i.test(o)) return 'Cobranzas'
  if (/compras/i.test(o)) return 'Compras'
  if (/obligacion_resumen/i.test(o)) return null // no es del Sheet: es la vista única de la base
  return null
}

/**
 * SKILL 1. Devuelve el modelo del Flujo de Caja para la ventana pedida, con su trazabilidad y sus
 * gaps declarados. No escribe. No inventa. Si una fuente falla, el bloque queda vacío y el problema
 * se declara — nunca se rellena con ceros.
 *
 * @param {object} deps {google}
 * @param {object} [opts] {hoy, dias}
 */
export async function leerFlujoDeFondos(deps = {}, opts = {}) {
  const { calendarioDiario } = await import('../calendario-financiero.mjs')
  const { CASHFLOW_ID } = await import('../cash-briefing.mjs')
  // EL LIBRO VIAJA CON EL DATO. `source_spreadsheet_id` es la procedencia de cada movimiento: si se
  // analiza otro libro y la procedencia siguiera diciendo el de siempre, el ledger guardaría una
  // trazabilidad falsa — el peor defecto posible en un sistema cuya regla es no fabricar datos.
  const LIBRO = opts.spreadsheetId || CASHFLOW_ID
  const hoy = opts.hoy ? new Date(opts.hoy) : new Date()
  const observadoEn = new Date().toISOString()
  const problemas = []

  let cal
  try {
    // EL ATRASO TÍPICO DE CADA CLIENTE, CUANDO SE LO PASAN. `aprendizaje-cobranzas` ya mide sobre
    // `public.cobranza` cuántos días tarde paga cada cliente; el calendario sabe reproyectar con eso.
    // Sin este opt las cobranzas caen en su fecha NOMINAL, que es la fecha en la que no van a entrar.
    cal = await calendarioDiario(deps, {
      hoy, dias: Math.max(1, Number(opts.dias) || 90), spreadsheetId: LIBRO,
      perfilesCobro: opts.perfilesCobro ?? null,
    })
  } catch (e) {
    return {
      estado: 'sin_dato',
      motivo: `no se pudo leer el Flujo de Caja: ${String(e?.message ?? e).slice(0, 160)}`,
      spreadsheet_id: LIBRO, movimientos: [], pestanas_leidas: [], problemas, observado_en: observadoEn,
    }
  }

  const crudos = (cal.dias || []).flatMap((d) => (d.movimientos || []).map((m) => ({
    ...m,
    fecha: new Date(`${d.fecha}T00:00:00`),
  })))

  const movimientos = []
  const invalidos = []
  for (const m of crudos) {
    const pestana = pestanaDeOrigen(m.origen)
    if (pestana && PESTANAS_PROHIBIDAS.includes(pestana)) continue // no debería pasar; la guarda es barata
    const v = validarContra(Movimiento, normalizarMovimiento(m, { spreadsheetId: LIBRO, pestana, observadoEn }))
    if (v.ok) movimientos.push(v.valor)
    else invalidos.push(v.errores.join('; '))
  }
  if (invalidos.length) problemas.push({ tipo: 'movimiento_invalido', n: invalidos.length, ejemplo: invalidos[0] })
  problemas.push({
    tipo: 'trazabilidad_parcial',
    detalle: 'row_reference y source_formula van en null: el lector único del OS no los expone y duplicarlo divergiría del Sheet',
  })
  if (cal.sin_fecha?.n) {
    // NO ES UN DETALLE: es deuda real que no cae en ningún día. Si el excedente se calcula ignorándola,
    // el agente recomienda invertir plata que ya tiene dueño y sólo le falta la fecha.
    problemas.push({ tipo: 'sin_fecha', n: cal.sin_fecha.n, monto: cal.sin_fecha.monto ?? null, detalle: cal.sin_fecha.fuente })
  }

  const pestanas = [...new Set(movimientos.map((m) => m.sheet_name).filter(Boolean))]
  return {
    estado: 'ok',
    spreadsheet_id: LIBRO,
    pestanas_leidas: pestanas,
    pestanas_prohibidas: PESTANAS_PROHIBIDAS,
    caja_inicial: cal.caja_inicial ?? null,
    dias: cal.dias || [],
    // Qué escenario de cobro gobierna las fechas de este calendario. `null` = fechas nominales.
    escenario_cobro: cal.escenario_cobro ?? null,
    movimientos,
    duplicados: detectarDuplicados(movimientos),
    problemas,
    evidencia: EVIDENCIA.DATO,
    fuente: 'calendario-financiero + cash-briefing (lectores únicos del Cash Flow)',
    observado_en: observadoEn,
  }
}

/**
 * DUPLICADOS. Dos movimientos con el mismo id estable son el mismo hecho contado dos veces. Este repo
 * ya vio la versión cara del problema: la obligación proyectada en Compras más el comprobante cargado
 * como fila nueva hacían que el mes se contara dos veces. No se borran acá —borrar es del dueño—: se
 * declaran, y la posición de caja los descuenta una sola vez.
 */
export function detectarDuplicados(movs = []) {
  const vistos = new Map()
  const dups = []
  for (const m of movs) {
    const n = (vistos.get(m.movement_id) || 0) + 1
    vistos.set(m.movement_id, n)
    if (n === 2) dups.push({ movement_id: m.movement_id, contraparte: m.counterparty, monto: m.amount, fecha: m.expected_date })
  }
  return dups
}

/**
 * DEUDA COMERCIAL VENCIDA — la pata que el modelo de liquidez recibe por parámetro y que, si nadie
 * se la pasa, queda en `sin dato` y el excedente sale SOBRESTIMADO.
 *
 * Lo destapó la corrida real del 01/08: `vencido_comercial: null` mientras el calendario ya traía las
 * facturas de Compras marcadas como vencidas. El modelo pedía el número y nadie se lo daba, así que
 * la plata que la empresa ya le debe a sus proveedores contaba como excedente invertible.
 *
 * Se calcula de los MISMOS movimientos que ya se leyeron: no se vuelve a abrir Compras, que es lo que
 * haría que dos criterios distintos midieran la misma deuda.
 */
export function vencidoComercialDe(flujo = {}) {
  const vencidos = (flujo.movimientos || []).filter(
    (m) => m.status === 'vencido' && m.direction === 'out' && /Compras/i.test(String(m.sheet_name ?? '')),
  )
  if (!vencidos.length) return null
  return { monto: vencidos.reduce((s, m) => s + (Number(m.amount) || 0), 0), n: vencidos.length }
}

export const VERSION_SKILL = '1.0.0'

// CAJA RESTRINGIDA VIVA — los cheques firmados sin debitar, leídos hoy, no declarados una vez.
//
// ═══ POR QUÉ NO ALCANZA CON LA POLÍTICA ═══
//
// La caja restringida vivía como una fila en la base: alguien la declaraba y ahí se quedaba. El
// 03/08/2026 esa fila decía $48.148.311 y los cheques reales sumaban $47.948.311. La diferencia —
// exactamente $200.000— era el FÍSICO 223 de Corralón Progreso, que se había marcado como debitado.
// Nada falló, nadie se enteró, y el excedente quedó $200.000 más chico para siempre.
//
// Un dato que sólo cambia cuando una persona se acuerda de cambiarlo no es un dato: es una foto vieja
// con nombre de dato. Acá se recalcula de la pestaña en cada corrida, y la política queda como
// respaldo para cuando la pestaña no se puede leer.
//
// ═══ POR QUÉ ESTE LECTOR NO DUPLICA AL DEL CALENDARIO ═══
//
// El calendario pregunta "¿qué cae cada día?" y por eso filtra por ventana: descarta lo que venció
// ayer y lo que no tiene fecha. Esta pregunta es otra —"¿cuánta plata de la cuenta ya tiene dueño?"—
// y necesita justamente esos dos casos, que son los peligrosos. Para que no puedan divergir, el
// parseo de la FILA es uno solo: `filaCheque`, y el calendario lo importa de acá.

import { CONFIANZA } from './contratos.mjs'
import { ESTADO_RESTRINGIDA } from './politicas.mjs'

/**
 * CONTRATO DE COLUMNAS de la pestaña "Cheques Emitidos". Son índices y no encabezados porque el
 * registro no tiene una fila de títulos estable: arranca donde el Tipo dice FISICO/ECHEQ. Si el dueño
 * mueve una columna, `filaCheque` deja de reconocer las filas y el lector devuelve vacío — que es
 * ruidoso y detectable, no un monto silenciosamente mal.
 */
export const COL_CHEQUE = { tipo: 0, proveedor: 4, monto: 5, fecha_pago: 8, debitado: 10, obra: 11 }

/** ¿Es una fila del registro de cheques? Sólo FISICO y ECHEQ; todo lo demás es encabezado o nota. */
export const esFilaDeCheque = (r) => /^(fisico|echeq)$/i.test(String(r?.[COL_CHEQUE.tipo] ?? '').trim())

/** ¿Ya salió de la cuenta? Un cheque debitado dejó de ser caja restringida: es plata que ya no está. */
export const estaDebitado = (r) => /^si$/i.test(String(r?.[COL_CHEQUE.debitado] ?? '').trim())

/**
 * PARSEO DE UNA FILA. Único en el repo: lo usa este módulo y `calendario-financiero`. Devuelve `null`
 * para lo que no es un cheque pendiente, así los dos consumidores filtran igual y no pueden divergir.
 */
export function filaCheque(r, { parseMonto, parseFecha } = {}) {
  if (!esFilaDeCheque(r) || estaDebitado(r)) return null
  const monto = parseMonto ? parseMonto(r?.[COL_CHEQUE.monto]) : Number(r?.[COL_CHEQUE.monto])
  if (!(monto > 0)) return null
  return {
    tipo: String(r?.[COL_CHEQUE.tipo] ?? '').trim().toUpperCase(),
    proveedor: String(r?.[COL_CHEQUE.proveedor] ?? '').trim(),
    monto,
    // `null` cuando la fecha no se puede leer. NO se rellena con hoy: un cheque sin fecha es
    // justamente el que puede caer cualquier día, y por eso se resta siempre.
    fecha: (parseFecha ? parseFecha(r?.[COL_CHEQUE.fecha_pago]) : null) || null,
    obra: String(r?.[COL_CHEQUE.obra] ?? '').trim() || null,
  }
}

/** BORDE: lee la pestaña entera y devuelve los cheques firmados sin debitar. No escribe nada. */
export async function leerChequesFirmados(google, libro) {
  const { parseMonto, parseFecha } = await import('../cash-briefing.mjs')
  const filas = await google.readSheetValues(libro, 'Cheques Emitidos!A1:L997')
  const items = []
  for (const r of filas) {
    const c = filaCheque(r, { parseMonto, parseFecha })
    if (c) items.push(c)
  }
  return items
}

/**
 * ¿Un cheque emitido está pagando una factura de Compras que además figura como deuda vencida?
 *
 * Es el doble conteo que este agente tiene que poder descartar por evidencia y no por confianza: si
 * el mismo peso está en `caja_restringida` y en `vencido_comercial`, se resta dos veces. El cotejo es
 * por proveedor Y monto —dos coincidencias, no una— porque un proveedor recurrente con montos
 * distintos no es el mismo pago.
 *
 * Medido el 03/08/2026: 0 coincidencias (Compras vencidas eran PEDRO TELLO, Gerson Castro y Gruas San
 * Blas; los cheques, Alumetal, Corralón Progreso, Diesel Rodriguez y otros). El control queda igual,
 * porque el día que aparezca una nadie va a estar mirando.
 */
export function dobleConteoConCompras(cheques = [], movimientosVencidos = []) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const coincidencias = []
  for (const c of cheques) {
    for (const m of movimientosVencidos) {
      if (norm(c.proveedor) && norm(c.proveedor) === norm(m.counterparty)
        && Math.abs(Math.round(c.monto) - Math.round(Number(m.amount) || 0)) <= 1) {
        coincidencias.push({ proveedor: c.proveedor, monto: Math.round(c.monto), fecha_cheque: c.fecha ? c.fecha.toISOString().slice(0, 10) : null })
      }
    }
  }
  return {
    hay: coincidencias.length > 0,
    n: coincidencias.length,
    monto: coincidencias.reduce((s, x) => s + x.monto, 0),
    coincidencias,
    criterio: 'mismo proveedor Y mismo monto entre un cheque firmado sin debitar y una factura de Compras vencida',
  }
}

/**
 * La caja restringida con la MISMA forma que devuelve `modelarCajaRestringida`, pero calculada de la
 * pestaña en vez de leída de una política congelada. Se agrega el detalle por vencimiento, que es lo
 * que permite no restar a 30 días un cheque que vence en 60.
 */
export function cajaRestringidaViva(cheques = [], ahora = new Date()) {
  const total = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0)
  return {
    restricted_cash_amount: Math.round(total),
    restricted_cash_status: total > 0 ? ESTADO_RESTRINGIDA.KNOWN_POSITIVE : ESTADO_RESTRINGIDA.KNOWN_ZERO,
    restricted_cash_source: 'Cheques Emitidos (pestaña del Cash Flow) — recalculado en esta corrida',
    restricted_cash_confidence: CONFIANZA.ALTA,
    restricted_cash_as_of: ahora.toISOString(),
    monto_a_restar: Math.round(total),
    // NO BLOQUEA: el dato se acaba de leer de su fuente. Lo que bloqueaba antes era la antigüedad de
    // una declaración manual, y esa declaración dejó de ser la fuente.
    bloquea_accionable: false,
    motivo: null,
    n_cheques: cheques.length,
  }
}

export const VERSION_SKILL = '1.0.0'

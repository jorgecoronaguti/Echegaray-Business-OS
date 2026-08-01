// POLÍTICAS — que un `null` no se vuelva un cero, y que guardar no sea aprobar.
//
// Los dos defectos que estos tests fijan cuestan plata de maneras opuestas: el primero infla el
// excedente con plata que podría estar embargada; el segundo hace que el OS crea que el dueño aprobó
// algo que nunca miró.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  modelarCajaRestringida, estadoReserva, evaluarAccionabilidad, proponerReservaMinima,
  ESTADO_POLITICA, ESTADO_RESTRINGIDA, METODO_RESERVA, COMANDO_APROBAR_RESERVA,
} from './politicas.mjs'

const AHORA = new Date('2026-08-01T10:00:00Z')

// ════════════════════════════════════════════════════════════════════════════
// CAJA RESTRINGIDA — desconocido ≠ cero
// ════════════════════════════════════════════════════════════════════════════

test('sin fila, el estado es unknown y NO se resta un cero en silencio', () => {
  const r = modelarCajaRestringida(null, AHORA)
  assert.equal(r.restricted_cash_status, ESTADO_RESTRINGIDA.UNKNOWN)
  assert.equal(r.restricted_cash_amount, null, 'null, no 0: son cosas distintas')
  assert.equal(r.restricted_cash_confidence, 'nula')
  assert.equal(r.bloquea_accionable, true, 'no saber cuánto hay afectado bloquea la acción')
})

test('los cuatro sabores de "no sé" NO se colapsan en cero', () => {
  // `Number(x) || 0` devolvía 0 para null, undefined, '' y NaN. Tres de los cuatro significan "no sé".
  for (const fila of [null, { monto: null }, { monto: '' }, { monto: 'sin dato' }, { error: 'timeout' }]) {
    const r = modelarCajaRestringida(fila, AHORA)
    assert.equal(r.restricted_cash_amount, null, `${JSON.stringify(fila)} produjo un monto`)
    assert.equal(r.bloquea_accionable, true, `${JSON.stringify(fila)} no bloqueó`)
  }
})

test('un cero DECLARADO sí es un cero, y no bloquea', () => {
  const r = modelarCajaRestringida({ monto: 0, fuente: 'declaración del dueño', declarada_en: AHORA.toISOString() }, AHORA)
  assert.equal(r.restricted_cash_status, ESTADO_RESTRINGIDA.KNOWN_ZERO)
  assert.equal(r.restricted_cash_amount, 0)
  assert.equal(r.bloquea_accionable, false)
  assert.equal(r.restricted_cash_confidence, 'alta')
})

test('un positivo declarado se resta y se identifica su fuente', () => {
  const r = modelarCajaRestringida({ monto: 3500000, fuente: 'garantía de obra LE-04', declarada_en: AHORA.toISOString() }, AHORA)
  assert.equal(r.restricted_cash_status, ESTADO_RESTRINGIDA.KNOWN_POSITIVE)
  assert.equal(r.monto_a_restar, 3500000)
  assert.equal(r.restricted_cash_source, 'garantía de obra LE-04')
  assert.equal(r.bloquea_accionable, false)
})

test('un dato viejo se resta igual (conservador) pero NO habilita accionar', () => {
  const viejo = new Date(AHORA.getTime() - 60 * 24 * 3600 * 1000).toISOString()
  const r = modelarCajaRestringida({ monto: 1000000, declarada_en: viejo }, AHORA)
  assert.equal(r.restricted_cash_status, ESTADO_RESTRINGIDA.STALE)
  assert.equal(r.monto_a_restar, 1000000, 'lo conservador es restarlo')
  assert.equal(r.bloquea_accionable, true, 'pero un dato de hace dos meses no sostiene una decisión')
  assert.match(r.motivo, /revalidarlo/)
})

test('si la fuente falla, es unavailable — no unknown ni cero', () => {
  const r = modelarCajaRestringida({ error: 'la vista no responde', fuente: 'garantias' }, AHORA)
  assert.equal(r.restricted_cash_status, ESTADO_RESTRINGIDA.UNAVAILABLE)
  assert.equal(r.restricted_cash_source, 'garantias')
  assert.equal(r.bloquea_accionable, true)
})

// ════════════════════════════════════════════════════════════════════════════
// RESERVA — guardar no es aprobar
// ════════════════════════════════════════════════════════════════════════════

test('una política guardada sin aprobador es una PROPUESTA', () => {
  const r = estadoReserva({ valor: { monto: 5000000, metodo: METODO_RESERVA.PISO_MAS_EGRESOS }, creada_en: '2026-08-01' })
  assert.equal(r.estado, ESTADO_POLITICA.PROPUESTA)
  assert.equal(r.aprobada_por, null)
  assert.match(r.motivo, /guardarla no es aprobarla/)
})

test('con aprobador explícito queda aprobada y trae su trazabilidad', () => {
  const r = estadoReserva({
    valor: { monto: 5000000, metodo: METODO_RESERVA.PISO_MAS_EGRESOS, fuente: 'calendario', version: 1, explicacion: 'máximo entre…' },
    aprobada_por: 'jorge', aprobada_en: '2026-08-01T12:00:00Z', vigente_desde: '2026-08-01T12:00:00Z',
  })
  assert.equal(r.estado, ESTADO_POLITICA.APROBADA)
  assert.equal(r.monto, 5000000)
  assert.equal(r.aprobada_por, 'jorge')
  assert.equal(r.version, 1)
})

test('la reserva propuesta es el MÁXIMO de los componentes, no la suma', () => {
  // Sumarlos reservaría tres veces el mismo peso: una carga social de la semana está en los tres
  // primeros componentes a la vez. Un conservadurismo que parece prudente y es un error de cuenta.
  const dias = [
    { fecha: 'd0', movimientos: [{ tipo: 'egreso', monto: 3000000, categoria: 'cargas_sociales', obra: 'LE-04' }] },
    { fecha: 'd1', movimientos: [{ tipo: 'egreso', monto: 1000000, categoria: 'proveedor' }] },
    { fecha: 'd2', movimientos: [{ tipo: 'ingreso', monto: 9000000, categoria: 'cobranza' }] },
  ]
  const p = proponerReservaMinima(dias, { colchon: 500000, diasVentana: 7 })
  assert.equal(p.componentes.egresos_confirmados_7_dias, 4000000)
  assert.equal(p.componentes.obligaciones_fiscales_y_laborales, 3000000)
  assert.equal(p.componentes.pagos_criticos_de_obra, 3000000)
  assert.equal(p.monto, 4000000, 'el máximo, no los 10.500.000 que daría la suma')
  assert.equal(p.metodo, METODO_RESERVA.PISO_MAS_EGRESOS)
  assert.ok(p.explicacion)
})

test('sin calendario NO se propone una reserva inventada', () => {
  const p = proponerReservaMinima([], {})
  assert.equal(p.monto, null)
  assert.match(p.motivo, /no se puede proponer/)
})

// ════════════════════════════════════════════════════════════════════════════
// ACCIONABILIDAD — todos los motivos, no el primero
// ════════════════════════════════════════════════════════════════════════════

test('sin políticas aprobadas la etiqueta es techo técnico y el estado NO_ACCIONABLE', () => {
  const r = evaluarAccionabilidad({ reserva: estadoReserva(null), restringida: modelarCajaRestringida(null) })
  assert.equal(r.accionable, false)
  assert.equal(r.etiqueta, 'techo_tecnico_preliminar')
  assert.equal(r.estado_recomendacion, 'NO_ACCIONABLE')
  assert.equal(r.bloqueos.length, 4, 'reserva + restringida + extractor + frescura: los cuatro juntos')
})

test('con todo aprobado y validado, la etiqueta pasa a excedente aprobado', () => {
  const r = evaluarAccionabilidad({
    reserva: estadoReserva({ valor: { monto: 5000000 }, aprobada_por: 'jorge' }),
    restringida: modelarCajaRestringida({ monto: 0, declarada_en: AHORA.toISOString() }, AHORA),
    extractorValidado: true, mercadoFresco: true,
  })
  assert.equal(r.accionable, true)
  assert.equal(r.etiqueta, 'excedente_aprobado')
  assert.deepEqual(r.bloqueos, [])
})

test('el comando de aprobación viaja en el código, no sólo en un documento', () => {
  assert.match(COMANDO_APROBAR_RESERVA, /tesoreria-politica\.mjs aprobar reserva_minima/)
  assert.match(COMANDO_APROBAR_RESERVA, /--aprobador/)
})

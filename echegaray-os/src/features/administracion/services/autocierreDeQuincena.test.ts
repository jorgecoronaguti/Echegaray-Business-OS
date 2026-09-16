import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoDeAutocierre, decisionDeAutocierre, fotoDeLinea, type LineaMarcable } from './autocierreDeQuincena.ts'

const linea = (personaId: string, extra: Partial<LineaMarcable> = {}): LineaMarcable => ({
  personaId, nombre: personaId.toUpperCase(), horas: 90, valorHora: 6000, netoMensual: null, modalidad: 'por_hora' as LineaMarcable['modalidad'],
  cobra: 540000, porBanco: 250000, enEfectivo: 290000, total: 540000, adelanto: 0, yaTransferido: 0, sinTarifa: false,
  pagadaEn: '2026-09-16T12:00:00Z', ...extra,
} as LineaMarcable)

test('CON UNO SIN MARCAR NO HAY CIERRE, NI SE MIRAN LOS PENDIENTES', () => {
  const d = decisionDeAutocierre({ lineas: [linea('a'), linea('b', { pagadaEn: null }), linea('c', { pagadaEn: null })], personaId: 'b' })
  assert.equal(d.todasPagadas, false)
  assert.deepEqual(d.foto, [])
  assert.equal(avisoDeAutocierre(d, null), 'Marcada como pagada.')
})

test('LA RECIÉN MARCADA CUENTA COMO PAGADA AUNQUE LA LECTURA SEA DE ANTES; TODOS PAGADOS → FOTO LISTA', () => {
  const d = decisionDeAutocierre({ lineas: [linea('a'), linea('b', { pagadaEn: null })], personaId: 'b' })
  assert.equal(d.todasPagadas, true)
  assert.deepEqual(d.pendientes, [])
  assert.deepEqual(d.foto.map((f) => f.persona_id), ['a', 'b'])
  assert.match(avisoDeAutocierre(d, { ok: true, lineas: 2 }), /quincena cerrada, 2 línea/)
})

test('LA MISMA TRABA QUE EL BOTÓN CERRAR: UNA AUSENCIA SIN MOTIVO DEL GRUPO NO DEJA CERRAR; LA DE OTRO GRUPO NO CUENTA', () => {
  const lineas = [linea('a'), linea('b')]
  const conAjeno = decisionDeAutocierre({ lineas, personaId: 'b', porPersona: [{ personaId: 'z', nombre: 'Z', sinMotivo: ['2026-09-03'], sinCargar: [] }] })
  assert.deepEqual(conAjeno.pendientes, [], 'el pendiente de otra persona no traba este grupo')
  const propio = decisionDeAutocierre({ lineas, personaId: 'b', porPersona: [{ personaId: 'a', nombre: 'A', sinMotivo: ['2026-09-03'], sinCargar: [] }] })
  assert.ok(propio.pendientes.length > 0)
  assert.match(avisoDeAutocierre(propio, null), /NO cerré la quincena/)
})

test('SIN TARIFA TRABA; SIN COBRA NO SE CONGELA (un cero no es un importe verificado)', () => {
  const d = decisionDeAutocierre({ lineas: [linea('a'), linea('b', { sinTarifa: true, cobra: null, enEfectivo: null, total: null })], personaId: 'b' })
  assert.equal(d.todasPagadas, true)
  assert.ok(d.pendientes.some((p) => p.clave === 'sin-tarifa'))
  assert.equal(fotoDeLinea(linea('b', { cobra: null })), null)
})

test('SIN LÍNEAS NO HAY NADA QUE CERRAR', () => {
  assert.equal(decisionDeAutocierre({ lineas: [], personaId: 'a' }).todasPagadas, false)
})

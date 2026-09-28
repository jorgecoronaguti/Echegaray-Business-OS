// EL RENGLÓN DEL PRESENTISMO DICE BASE, %, ESTADO Y FECHAS EN PANTALLA (dueño, 28/09/2026).
//
// Lo que atrapa: el intento anterior (31312cd0) «integró» el presentismo mandando la base, el %, el «Cumple» y el
// motivo a un `title` —en el teléfono no se ve— y borró las fechas a revisar. Si alguna de esas cuatro cosas sale
// de la nota, o el importe deja de ser el de `presentismo.ts`, esto se pone rojo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presentismoDeLinea, presentismoNoAplica, type EntradaDePresentismo } from '../../../services/presentismo.ts'
import { renglonDePresentismo } from './presentismoEnElPanel.ts'

const E: EntradaDePresentismo = {
  categoria: 'oficial', basico: 6348, tardanzas: [], ausencias: [], quincenaDesde: '2026-09-16',
  modalidad: 'hora', esJefe: false, cerrada: false,
}

test('cumple: el importe de presentismo.ts, con la base y el % en la nota', () => {
  const p = presentismoDeLinea(E, 100)
  const r = renglonDePresentismo(p)
  assert.equal(r?.rotulo, 'Presentismo')
  assert.equal(r?.valor, p.importe)
  assert.equal(r?.valor, 63480, '20 % × 50 h × $6.348')
  assert.match(r?.nota ?? '', /^Cumple · 20 % de \$317\.400 \(50 % en blanco\) · /)
  assert.doesNotMatch(r?.nota ?? '', /importe/, 'no afirma dónde entra la plata: el cálculo no lo respalda en jornada completa')
})

test('perdido: rótulo con signo, motivo y las fechas a revisar a la vista', () => {
  const p = presentismoDeLinea({
    ...E,
    tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }],
    ausencias: [{ fecha: '2026-09-18', estado: 'ausente', motivo: null }],
  }, 100)
  assert.equal(p.estado, 'perdido')
  const r = renglonDePresentismo(p)
  assert.equal(r?.rotulo, '− Presentismo')
  assert.equal(r?.valor, 63480)
  const nota = r?.nota ?? ''
  assert.ok(nota.startsWith('Perdido · 20 % de $317.400 (50 % en blanco) · 17/09'), nota)
  assert.match(nota, /cargá el motivo de 18\/09: si lo justifica, lo recupera/)
  assert.doesNotMatch(nota, /importe/, 'con negro manual no se descuenta: no se afirma')
})

test('sin horas no dice «Cumple», y lo ya marcado se sigue viendo', () => {
  const r = renglonDePresentismo(presentismoDeLinea({ ...E, ausencias: [{ fecha: '2026-09-18', estado: 'ausente', motivo: null }] }, 0))
  assert.equal(r?.estado, 'sin_horas')
  assert.equal(r?.valor, null)
  assert.ok(r?.nota.startsWith('Sin horas · sin horas cargadas en la quincena'))
  assert.doesNotMatch(r?.nota ?? '', /Cumple/)
  assert.match(r?.nota ?? '', /18\/09/)
})

test('no rige, no aplica y sin categoría se dicen; sin evaluar no hay renglón', () => {
  assert.equal(renglonDePresentismo(presentismoDeLinea({ ...E, quincenaDesde: '2026-09-01' }, 100))?.nota, 'No rige en esta quincena')
  assert.match(renglonDePresentismo(presentismoNoAplica())?.nota ?? '', /^No aplica · mensual/)
  assert.match(renglonDePresentismo(presentismoDeLinea({ ...E, categoria: null, basico: null }, 100))?.nota ?? '', /^Sin categoría/)
  assert.equal(renglonDePresentismo(null), null)
})

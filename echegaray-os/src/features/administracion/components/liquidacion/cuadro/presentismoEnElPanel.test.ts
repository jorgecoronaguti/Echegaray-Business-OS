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

// EL LUGAR (dueño, 28/09/2026, elegido entre tres: «entre los conceptos del blanco»). Si el renglón vuelve al
// bloque Negro o deja de llegar a la lista de conceptos del blanco, esto se pone rojo.
test('el presentismo va entre los conceptos del blanco, no en el bloque Negro', async () => {
  const { readFileSync } = await import('node:fs')
  const panel = readFileSync(new URL('./PanelDeLaPersona.tsx', import.meta.url), 'utf8')
  assert.match(panel, /<ReciboPorConceptos s=\{s\} presentismo=\{renglonDePresentismo\(/)
  const negro = panel.slice(panel.indexOf('<Rotulo>Negro</Rotulo>'), panel.indexOf('<PagadoYSaldo'))
  assert.doesNotMatch(negro, /RenglonDelPresentismo/)
  const recibo = readFileSync(new URL('./ReciboPorConceptos.tsx', import.meta.url), 'utf8')
  assert.match(recibo, /<Bloque titulo="Haberes"[^>]*presentismo=\{presentismo\}/)
})

// Debajo de un 0425 que ya está en el recibo (jornada completa: 20 % del básico ENTERO) no puede ir la base del OS
// (50 %): serían dos importes distintos para el mismo concepto en el mismo renglón (auditor, 28/09).
test('la nota que va bajo un 0425 del recibo no lleva la base ni el % del OS', () => {
  const r = renglonDePresentismo(presentismoDeLinea(E, 100))!
  assert.match(r.nota, /50 % en blanco/)
  assert.doesNotMatch(r.notaSinBase, /%|\$/)
  assert.match(r.notaSinBase, /^Cumple/)
})

// RESTITUIDO (30/09/2026): el panel no puede decir «Cumple · sin faltas ni tardanzas» a quien las tuvo y alguien se las
// perdonó. Dice quién, cuándo (hora de San Juan: 01:30 UTC del 01/10 es todavía 30/09) y qué fechas.
test('restituido: quién, cuándo y qué perdonó, no «Cumple»', () => {
  const p = presentismoDeLinea({
    ...E,
    tardanzas: [{ fecha: '2026-09-22', llegoTarde: true, salioAntes: false }],
    restitucion: { por: 'Jorge Corona Gutierrez', en: '2026-10-01T01:30:00Z', motivo: null, fechas: ['2026-09-22'] },
  }, 100)
  assert.equal(p.estado, 'aplica')
  const r = renglonDePresentismo(p)
  assert.equal(r?.rotulo, 'Presentismo')
  assert.equal(r?.valor, 63480)
  const nota = r?.nota ?? ''
  assert.ok(nota.startsWith('Restituido por Jorge Corona Gutierrez el 30/09 · 20 % de $317.400'), nota)
  assert.match(nota, /perdonó 22\/09/)
  assert.doesNotMatch(nota, /Cumple|sin faltas/)
})

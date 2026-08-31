// LA PLATA QUE SE LE DA A LA CUADRILLA. Los números son los reales de la quincena 17/08→31/08.
//
// El test NO evalúa la fórmula: afirma qué DICE y, aparte, hace la cuenta con los importes reales.
// Un evaluador casero de fórmulas de Sheets es otro programa que puede estar mal, y entonces el test
// pasaría a medirse a sí mismo.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formulaNetoAPagar, formulaEnEfectivo, formulaBancoOficina } from './jornales-neto-pago.mjs'

// Lo que publicaba Nómina ese día para los 15 obreros.
const TOTAL = 6331859      // TOTAL A PAGAR — ya neto de adelanto y de lo ya transferido
const ENTREGADO = 1208644  // ADELANTO $608.644 + YA TRANSFERIDO $600.000
const BANCO = 2786533      // POR BANCO
const EFECTIVO = 3545326   // EN EFECTIVO

test('la cuenta: con el total ya neto, restar el adelanto le saca $1.208.644 a la cuadrilla', () => {
  assert.equal(BANCO + EFECTIVO, TOTAL, 'el fixture no representa lo que Nómina publicó')
  const netoViejo = TOTAL - ENTREGADO
  assert.equal(netoViejo, 5123215)
  assert.equal(netoViejo - BANCO, 2336682, 'es lo que Jornales publicaba en efectivo')
  assert.equal(EFECTIVO - (netoViejo - BANCO), ENTREGADO, 'la diferencia es exactamente el adelanto, restado dos veces')
})

test('con el total YA NETO la fórmula devuelve el total, no el total menos el adelanto', () => {
  const f = formulaNetoAPagar({ fila: 7, yaNeto: 'CITA>0' })
  assert.match(f, /IF\(CITA>0;D7;D7-N\(E7\)\)/, `la rama del neto no está: ${f}`)
})

test('EL RESPALDO SIGUE VIVO: sin `yaNeto` la fórmula resta, como cuando el total es BRUTO', () => {
  const f = formulaNetoAPagar({ fila: 7 })
  assert.match(f, /D7-N\(E7\)/)
  assert.doesNotMatch(f, /IF\(.*;D7;/, 'metió una rama de neto donde el total es bruto')
})

test('sin total no se publica un cero: una fila en cero se lee como «no hay que pagar nada»', () => {
  for (const f of [formulaNetoAPagar({ fila: 7 }), formulaNetoAPagar({ fila: 7, yaNeto: 'X' })]) {
    assert.match(f, /^=IF\(N\(D7\)=0;"";/, f)
  }
})

test('el efectivo es el RESTO del neto, y no publica nada si el banco no es un número', () => {
  const f = formulaEnEfectivo({ fila: 7 })
  assert.match(f, /F7-G7/, 'dejó de ser el resto del neto')
  assert.match(f, /NOT\(ISNUMBER\(G7\)\)/, 'publicaría un efectivo inventado con el banco en texto')
})

// ═══ OFICINA: LO BLANCO ES LO QUE DICE EL RECIBO, NO LA MITAD (31/08/2026) ═══
//
// El dueño: «lo blanco es lo q indica su recibo y el resto se completa en efectivo». La fila de
// Oficina publicaba `D/2` —el 50/50 calculado— y daba $1.800.000 y $1.800.000, cuando los dos
// recibos suman $1.326.283 de blanco. Es el mismo 50/50 que él mandó dejar de usar en obra, vivo
// en la fila de al lado.

const OFI_TOTAL = 3600000        // $1.800.000 × 2, el neto acordado
const OFI_BANCO = 663141.56 * 2  // lo que dicen los dos recibos, CON centavos: la transferencia se
                                 // hace por el importe exacto o el banco la rechaza
const OFI_EFECTIVO = OFI_TOTAL - OFI_BANCO

test('OFICINA: el 50/50 calculado publica $473.716,88 de más por banco y de menos en efectivo', () => {
  assert.equal(OFI_BANCO + OFI_EFECTIVO, OFI_TOTAL, 'el fixture no representa lo que publica Nómina')
  // La pestaña muestra $1.326.283 y $2.273.716 porque el efectivo va sin centavos —los billetes no
  // los tienen—, pero la cuenta se hace con el importe exacto del recibo.
  assert.equal(Math.round(OFI_BANCO), 1326283)
  assert.equal(Math.round(OFI_EFECTIVO), 2273717)

  const mitad = OFI_TOTAL / 2
  assert.equal(mitad, 1800000, 'así calculaba antes')
  assert.equal(Math.round((mitad - OFI_BANCO) * 100) / 100, 473716.88, 'de más por transferencia')
  assert.equal(Math.round((OFI_EFECTIVO - mitad) * 100) / 100, 473716.88, 'y esa misma plata de menos en billetes')
})

test('OFICINA: el banco CITA a Nómina y sólo cae a la mitad si Nómina no contesta', () => {
  const f = formulaBancoOficina({ fila: 8, cita: 'CITA' })
  assert.match(f, /N\(CITA\)>0/, `no consulta a Nómina: ${f}`)
  assert.match(f, /D8\/2/, 'sin respaldo, una celda vacía se lee como «no se transfiere nada»')
  assert.ok(f.indexOf('CITA') < f.indexOf('D8/2'), 'la mitad tiene que ser el respaldo, no la primera opción')
})

test('OFICINA: la mitad se escribe /2 y NUNCA *0,5 — el decimal se parte en el locale es_AR', () => {
  assert.doesNotMatch(formulaBancoOficina({ fila: 8, cita: 'X' }), /0[,.]5/)
})

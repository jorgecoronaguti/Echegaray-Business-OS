import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NAT, COBERTURA_NATURALEZA, naturalezasPosibles, naturalezasDeclaradas,
  naturalezasSinDeclarar, naturalezasHueco,
} from './banco-santander.mjs'
import { GRUPOS } from './conciliacion-por-naturaleza.mjs'

// LA REGLA DE ORO QUE ESTE ARCHIVO DEFIENDE (28/07): "los cash flows semanal y mensual tienen que
// reflejar TODOS los datos del sheet, nada queda suelto y sin considerar." El extracto (_BANCO_RAW)
// es una fuente del Sheet; cada movimiento recibe una naturaleza. Este test prueba que NINGUNA
// naturaleza que el banco pueda producir quede sin una decisión explícita sobre su destino en el
// cash flow — el hueco que se encontró y tapó: "Ajuste sin detalle del banco" y los créditos.

test('cada naturaleza que el banco puede producir está declarada en la cobertura', () => {
  // El puente exhaustivo: `clasificarMovimiento` sólo devuelve miembros de NAT, y COBERTURA tiene que
  // cubrir NAT entero. Agregar una naturaleza a NAT sin declararla rompe acá.
  assert.deepEqual(naturalezasSinDeclarar(), [], 'hay naturalezas del banco sin declaración de cobertura')
})

test('la cobertura no declara naturalezas que el banco no puede producir', () => {
  const posibles = naturalezasPosibles()
  for (const c of COBERTURA_NATURALEZA) {
    assert.ok(posibles.has(c.naturaleza), `"${c.naturaleza}" está declarada pero NAT no la produce (nombre desincronizado)`)
  }
})

test('la cobertura cubre NAT una sola vez cada una (sin duplicados, sin huecos)', () => {
  assert.equal(naturalezasDeclaradas().size, COBERTURA_NATURALEZA.length, 'hay una naturaleza declarada dos veces')
  assert.equal(naturalezasDeclaradas().size, naturalezasPosibles().size, 'la cobertura y NAT no tienen el mismo tamaño')
})

test('toda naturaleza cuya plata VA al cuadro tiene un destino concreto (no hay huecos silenciosos)', () => {
  // La invariante central: si alCashFlow=true, destino NO puede ser null. Un flujo que va al cuadro
  // sin decir a qué línea es exactamente "plata suelta sin considerar".
  assert.deepEqual(naturalezasHueco(), [], 'hay naturalezas que suman al cash flow sin línea de destino')
})

test('cada entrada de cobertura toma una decisión coherente y la justifica', () => {
  for (const c of COBERTURA_NATURALEZA) {
    assert.ok(['egreso', 'ingreso', 'traslado'].includes(c.lado), `${c.naturaleza}: lado inválido`)
    assert.equal(typeof c.alCashFlow, 'boolean', `${c.naturaleza}: alCashFlow no es booleano`)
    if (c.alCashFlow) {
      assert.ok(c.destino && c.destino.length > 5, `${c.naturaleza}: va al cash flow pero no dice a qué línea`)
    } else {
      // No va al cuadro: tiene que explicar por qué (traslado propio, o gap declarado).
      assert.equal(c.destino, null, `${c.naturaleza}: no va al cash flow pero declara un destino`)
    }
    assert.ok(c.nota && c.nota.length > 30, `${c.naturaleza}: sin nota que justifique la decisión`)
  }
})

test('los egresos que se reconcilian banco-vs-pestaña están todos en GRUPOS', () => {
  // El otro extremo del puente: si la cobertura dice que una naturaleza se reconcilia (grupoConciliacion),
  // la conciliación por naturaleza tiene que tener su grupo, o el control del extracto la ignora.
  const enGrupos = new Set(GRUPOS.map((g) => g.naturaleza))
  for (const c of COBERTURA_NATURALEZA.filter((x) => x.grupoConciliacion)) {
    assert.ok(enGrupos.has(c.naturaleza), `"${c.naturaleza}" se declara reconciliable pero falta en GRUPOS`)
  }
})

test('el hueco encontrado el 28/07 quedó declarado, no tapado', () => {
  // Regresión explícita de los cuatro que estaban sueltos: cada uno tiene que tener SU decisión.
  const porNat = new Map(COBERTURA_NATURALEZA.map((c) => [c.naturaleza, c]))

  // "Ajuste sin detalle": el banco no da concepto → no se le inventa línea; se declara sin destino.
  const ajuste = porNat.get(NAT.ajusteSinDetalle)
  assert.equal(ajuste.alCashFlow, false)
  assert.equal(ajuste.destino, null)

  // Cobranzas de clientes por el banco: SÍ va al cuadro (por Cobranzas), pero no se reconcilia como egreso.
  const cob = porNat.get(NAT.cobranzas)
  assert.equal(cob.alCashFlow, true)
  assert.equal(cob.grupoConciliacion, false)

  // Rescates de inversión/financiero: gap declarado, sin línea, esperando decisión del dueño.
  const resc = porNat.get(NAT.rescates)
  assert.equal(resc.alCashFlow, false)
  assert.match(resc.nota, /GAP DECLARADO/)

  // Traslados de fondos propios: por definición no es flujo.
  const tras = porNat.get(NAT.traslados)
  assert.equal(tras.alCashFlow, false)
  assert.equal(tras.lado, 'traslado')
})

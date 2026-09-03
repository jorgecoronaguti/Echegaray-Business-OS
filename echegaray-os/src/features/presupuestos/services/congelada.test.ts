// SOBRE UN CONGELADO: PREGUNTAR SÍ, MODIFICAR NO.
//
// ═══ EL DEFECTO QUE ESTOS TESTS IMPIDEN ═══
//
// La conversación prometía «las preguntas siguen funcionando: explicar no modifica» y el servidor
// rechazaba TODO texto. Una promesa de la pantalla y un corte del servidor que decían cosas
// opuestas, a tres archivos de distancia, sin nada que los comparara.
//
// La lista de acciones mutantes NO se escribe acá: sale de `ACCION` del contrato, y estos tests
// afirman el comportamiento sobre las acciones REALES del motor. Si mañana el contrato agrega una
// acción que escribe, queda cortada sola; si alguien la marca `muta: false` por error, el test de
// cobertura de abajo se pone rojo.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { decisionSobreCongelada, esMutante } from './congelada.ts'
import { ACCION } from '../../../../orquestador/lib/cotizador/contrato.mjs'

const ACCIONES = ACCION as unknown as Record<string, { muta?: boolean }>

describe('el camino CONGELADA + PREGUNTA: pasa', () => {
  for (const consulta of ['evidence_query', 'blockers_query', 'cost_query']) {
    test(`«${consulta}» contesta sobre una versión congelada`, () => {
      assert.equal(decisionSobreCongelada({ congelada: true, accion: consulta }), 'pasa')
    })
  }

  test('una frase que el motor no entendió tampoco se corta por estar congelada', () => {
    // No hay intención: no hay nada que escribir. Cortarla acá daría el mensaje equivocado —«está
    // congelado»— cuando lo que pasó es que no se entendió.
    assert.equal(decisionSobreCongelada({ congelada: true, accion: null }), 'pasa')
  })
})

describe('el camino CONGELADA + MUTACIÓN: ofrece revisión', () => {
  // Las que el dueño enumeró, traducidas a las acciones que el contrato realmente tiene.
  const mutantes = [
    'update_quantity', 'exclude_scope', 'include_scope', 'set_subcontract', 'set_resource_price',
    'commercial_override', 'set_global_policy', 'freeze', 'approve', 'undo',
  ]
  for (const accion of mutantes) {
    test(`«${accion}» no entra en una versión congelada`, () => {
      assert.equal(decisionSobreCongelada({ congelada: true, accion }), 'ofrecer-revision')
    })
  }

  test('un plan de escritura corta aunque la intención dijera que no muta', () => {
    // El cinturón además de los tirantes: un plan sobre un congelado no se aplica nunca.
    assert.equal(
      decisionSobreCongelada({ congelada: true, accion: 'blockers_query', hayPlan: true }),
      'ofrecer-revision',
    )
  })

  test('una acción que el contrato no conoce se trata como mutante: se falla cerrado', () => {
    assert.equal(decisionSobreCongelada({ congelada: true, accion: 'accion_del_futuro' }), 'ofrecer-revision')
  })
})

describe('sin congelar no se corta nada', () => {
  test('una mutación sobre un borrador pasa', () => {
    assert.equal(decisionSobreCongelada({ congelada: false, accion: 'update_quantity' }), 'pasa')
  })

  test('ni siquiera con un plan armado', () => {
    assert.equal(decisionSobreCongelada({ congelada: false, accion: 'freeze', hayPlan: true }), 'pasa')
  })
})

describe('la lista de mutantes sale del contrato, no de acá', () => {
  test('todas las acciones del contrato marcadas `muta` se cortan', () => {
    const delContrato = Object.entries(ACCIONES).filter(([, a]) => a.muta === true).map(([k]) => k)
    assert.ok(delContrato.length >= 8, `el contrato sólo declaró ${delContrato.length} acciones que escriben: el test dejó de mirar donde tenía que mirar`)
    for (const a of delContrato) {
      assert.equal(esMutante(a), true, `«${a}» escribe según el contrato y este módulo la deja pasar`)
    }
  })

  test('todas las consultas del contrato pasan', () => {
    const consultas = Object.entries(ACCIONES).filter(([, a]) => a.muta === false).map(([k]) => k)
    assert.ok(consultas.length >= 3, 'el contrato no declaró consultas: el test no controla nada')
    for (const a of consultas) {
      assert.equal(esMutante(a), false, `«${a}» no escribe y este módulo la corta`)
    }
  })
})

describe('MUTACIÓN — el control puede dar rojo', () => {
  test('el corte viejo —en la puerta, sin mirar la intención— rechazaba también las preguntas', () => {
    const viejo = (congelada: boolean) => (congelada ? 'ofrecer-revision' : 'pasa')
    assert.equal(viejo(true), 'ofrecer-revision')
    assert.equal(decisionSobreCongelada({ congelada: true, accion: 'evidence_query' }), 'pasa')
    assert.notEqual(viejo(true), decisionSobreCongelada({ congelada: true, accion: 'evidence_query' }),
      'si el corte viejo y el nuevo coincidieran acá, la corrección no habría cambiado nada')
  })

  test('un corte que dejara pasar todo rompería la inmutabilidad', () => {
    const permisivo = () => 'pasa' as const
    assert.notEqual(permisivo(), decisionSobreCongelada({ congelada: true, accion: 'update_quantity' }))
  })
})

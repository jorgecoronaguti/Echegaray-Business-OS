// EL CARGADOR DEL MAPA DE CLIENTES: los tres finales, y los dos que importan son los que fallan.
//
// La rama NO_VERIFICABLE del motor de costo por obra vivía sólo en los tests porque nada producía
// `leido:false` en producción. Acá se prueba que la produce, y por las dos causas: la consulta que
// revienta y la tabla vacía.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarMapaClientes } from './cliente-alias.mjs'
import { resolverCliente, CLASE } from './jornales-por-obra.mjs'

/** Un `query` de mentira: devuelve por SQL lo que se le declara, o lanza. */
function fakeQuery(porTabla) {
  return async (sql, params) => {
    assert.deepEqual(params, ['JORNALES'])
    const tabla = /rotulo_no_es_cliente/.test(sql) ? 'noCliente' : 'alias'
    const r = porTabla[tabla]
    if (r instanceof Error) throw r
    return { rows: r }
  }
}

test('con la tabla cargada el mapa sale leido y resuelve el canonico', async () => {
  const m = await cargarMapaClientes({
    query: fakeQuery({
      alias: [
        { rotulo_clave: 'JAVIER SANCHEZ', cliente_canonico: 'SAN FRANCISCO', origen: 'DECISION_DUENO' },
        { rotulo_clave: 'MESSINAS', cliente_canonico: 'MESSINA', origen: 'INFERENCIA_OS' },
      ],
      noCliente: [{ rotulo_clave: 'Z. ENFERMEDAD', motivo: 'Horas pagadas por enfermedad.' }],
    }),
  })
  assert.equal(m.leido, true)
  assert.equal(resolverCliente('Javier Sanchez', m).cliente, 'SAN FRANCISCO')
  assert.equal(resolverCliente('z. enfermedad', m).clase, CLASE.NO_ES_CLIENTE)
  assert.equal(resolverCliente('MESINA', m).clase, CLASE.DESCONOCIDO, 'nunca por parecido')
  // Quién decidió cada equivalencia viaja con el mapa: una inferencia no confirmada no afirma.
  assert.equal(m.origenes.get('MESSINAS'), 'INFERENCIA_OS')
})

test('si la consulta falla el mapa NO sale vacio: sale no leido, con motivo', async () => {
  const m = await cargarMapaClientes({ query: fakeQuery({ alias: new Error('relation does not exist') }) })
  assert.equal(m.leido, false)
  assert.match(m.motivo, /relation does not exist/)
  assert.equal(m.alias.size, 0)
  // Y el motor, con ese mapa, no convierte a nadie en desconocido.
  assert.equal(resolverCliente('LA ESTRELLA', m).clase, CLASE.NO_VERIFICABLE)
})

test('una tabla sin filas tampoco es un mapa: no autoriza a decir DESCONOCIDO', async () => {
  const m = await cargarMapaClientes({ query: fakeQuery({ alias: [], noCliente: [] }) })
  assert.equal(m.leido, false)
  assert.match(m.motivo, /no tiene ninguna fila/)
  assert.equal(resolverCliente('LA ESTRELLA', m).clase, CLASE.NO_VERIFICABLE)
})

test('si falla la tabla de rotulos que no son cliente, tampoco se da por bueno el mapa', async () => {
  // Sin esto, `z. ENFERMEDAD` se atribuiría como cliente DESCONOCIDO a una obra que no existe.
  const m = await cargarMapaClientes({
    query: fakeQuery({
      alias: [{ rotulo_clave: 'MESSINA', cliente_canonico: 'MESSINA', origen: 'INFERENCIA_OS' }],
      noCliente: new Error('permission denied for table rotulo_no_es_cliente'),
    }),
  })
  assert.equal(m.leido, false)
  assert.match(m.motivo, /permission denied/)
})

test('el cargador no lanza nunca: quien llama tiene que poder informar el estado', async () => {
  const m = await cargarMapaClientes({ query: async () => { throw new Error('ECONNREFUSED') } })
  assert.equal(m.leido, false)
  assert.ok(m.alias instanceof Map && m.noCliente instanceof Map)
})

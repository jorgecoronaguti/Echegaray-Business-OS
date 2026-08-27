// EL BORDE DEL CLASIFICADOR — lo que escribe y, sobre todo, lo que NO escribe.
//
// Estos tests nacieron de la auditoría adversarial del 27/08/2026, que encontró que un veredicto
// AMBIGUO se devolvía en memoria y se perdía: la pantalla que mira la persona mostraba la actividad
// sin una palabra de por qué el OS no había podido decidir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificarPorRegla, registrarSinResolver } from './clasificar-borde.mjs'

/** Una base falsa que anota lo que se le pidió escribir. */
function baseFalsa(filas) {
  const escrituras = []
  const query = async (sql, params) => {
    escrituras.push({ sql, params })
    if (/from public\.obra_actividad/i.test(sql) && /select/i.test(sql.slice(0, 30))) return { rows: filas }
    return { rows: [] }
  }
  return { query, escrituras }
}

test('el motivo de un AMBIGUO se persiste donde la vista lo muestra', async () => {
  const { query, escrituras } = baseFalsa([])
  await registrarSinResolver({ query }, {
    actividadId: 'a1',
    decision: {
      veredicto: 'AMBIGUO',
      porQue: 'la única parecida era «PISO DE HORMIGÓN - 20CM» y no corresponde: agrega condiciones',
      vetadas: [{ nombre: 'PISO DE HORMIGÓN - 20CM', vetos: ['más específica'] }],
    },
  })
  const u = escrituras.find((e) => /update public\.obra_actividad/.test(e.sql))
  assert.ok(u, 'el motivo no se escribió: la persona tiene que redescubrirlo a mano')
  assert.match(u.sql, /propuesta_evidencia = \$2/)
  assert.ok(!/propuesta_tarea_tipo_id = \$/.test(u.sql), 'no hay tarea que proponer: sólo una explicación')

  const ev = JSON.parse(u.params[1])
  assert.equal(ev.veredicto, 'AMBIGUO')
  assert.equal(ev.sin_propuesta, true, 'la vista tiene que poder distinguir una explicación de una propuesta')
  assert.match(ev.por_que, /no corresponde/)
  assert.equal(ev.vetadas.length, 1, 'qué candidata se descartó y por qué también es parte del motivo')
})

test('no pisa una propuesta que ya hizo el modelo', async () => {
  const { query, escrituras } = baseFalsa([])
  await registrarSinResolver({ query }, { actividadId: 'a1', decision: { veredicto: 'SIN MATCH', porQue: 'nada se parece' } })
  const u = escrituras.find((e) => /update public\.obra_actividad/.test(e.sql))
  assert.match(u.sql, /propuesta_tarea_tipo_id is null/, 'una propuesta del modelo es de otro camino: se respeta')
  assert.match(u.sql, /tarea_tipo_id is null/, 'y una clasificación de una persona le gana siempre a una regla')
})

test('sin --aplicar no se escribe nada, ni siquiera el motivo', async () => {
  const { query, escrituras } = baseFalsa([])
  const r = await clasificarPorRegla({ query }, { aplicar: false })
  assert.ok(!escrituras.some((e) => /update public\.obra_actividad/.test(e.sql)),
    'una corrida de sólo lectura que escribe motivos sigue siendo una corrida que escribe')
  assert.equal(r.asignadas, 0)
})

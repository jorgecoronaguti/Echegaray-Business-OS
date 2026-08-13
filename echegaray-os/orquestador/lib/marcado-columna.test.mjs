// EL NÚCLEO DEL SALTEO, EN FRÍO. Ninguno de estos casos toca la red ni una celda.
//
// El defecto que cuidan: una sola celda ajena en la columna de marcas abortaba el marcado ENTERO
// (106 cheques sin marca por una nota tipeada en M132). Si el guard vuelve a ser todo-o-nada, o si
// el tramo vuelve a ser un rango contiguo que pisa la fila ajena, estos tests se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeMarcado, excedeElLimite, motivoDeAborto, LIMITES_AJENAS } from './marcado-columna.mjs'

const MIO = '✓ su factura está en Compras'
const esMio = (t) => t === MIO || t.startsWith('Estado en el OS')

/** Una columna de `n` filas de datos a partir de `fila0`, con la fila `ajena` contaminada. */
const columna = ({ filaCab = 25, n = 6, ajenas = {} }) => {
  const col = []
  col[filaCab - 1] = ['Estado en el OS · al 13/08/2026']
  for (let i = 0; i < n; i++) col[filaCab + i] = ['']
  for (const [fila, texto] of Object.entries(ajenas)) col[Number(fila) - 1] = [texto]
  return col
}
const marcas = (n) => Array.from({ length: n }, () => [MIO])

test('UNA fila ajena se saltea: no se escribe esa fila y SÍ se escriben todas las demás', () => {
  // La fila 29 es la M132 del caso real: una nota tipeada en medio del registro.
  const plan = planDeMarcado({
    columna: columna({ ajenas: { 29: 'módulo echeq del banco 06/08 · vence 25/08' } }),
    marcas: marcas(6), fila0: 26, esMio,
  })
  assert.equal(plan.aborto, null, 'una sola celda ajena NO puede abortar la corrida')
  assert.deepEqual(plan.salteadas.map((s) => s.fila), [29])
  assert.match(plan.salteadas[0].texto, /módulo echeq/)
  // La marca que se perdió viaja en el reporte: sin ella nadie sabe qué quedó afuera del cash flow.
  assert.equal(plan.salteadas[0].marca, MIO)

  // Dos tramos, y entre ellos el hueco de la fila ajena. Si esto fuera un solo rango 26:31, la
  // escritura le pasaría la marca por encima a la nota.
  assert.deepEqual(plan.tramos.map((t) => [t.fila, t.valores.length]), [[26, 3], [30, 2]])
  const filasEscritas = plan.tramos.flatMap((t) => t.valores.map((_, i) => t.fila + i))
  assert.deepEqual(filasEscritas, [26, 27, 28, 30, 31], 'las 5 filas propias se marcan igual')
  assert.ok(!filasEscritas.includes(29))
})

test('una fila con una marca MÍA previa se re-marca: lo propio no es contenido ajeno', () => {
  const plan = planDeMarcado({
    columna: columna({ ajenas: { 28: MIO, 25: 'Estado en el OS · al 01/08/2026' } }),
    marcas: marcas(6), fila0: 26, esMio,
  })
  assert.equal(plan.salteadas.length, 0, 'mi propia marca de la corrida anterior no me bloquea')
  assert.equal(plan.fuera.length, 0, 'ni el encabezado que escribo yo')
  assert.deepEqual(plan.tramos.map((t) => [t.fila, t.valores.length]), [[26, 6]], 'un solo tramo corrido')
})

test('MUCHAS filas ajenas SÍ abortan: eso ya no es una celda contaminada', () => {
  const ajenas = {}
  for (const f of [27, 28, 29, 30, 31, 32]) ajenas[f] = `nota de alguien en ${f}`
  const plan = planDeMarcado({ columna: columna({ n: 20, ajenas }), marcas: marcas(20), fila0: 26, esMio })
  assert.ok(plan.aborto, '6 filas ajenas superan el límite absoluto')
  assert.equal(plan.aborto.ajenas, 6)
  // El aborto tiene que decir DÓNDE mirar: un "me niego a escribir" sin filas obliga a abrir la
  // pestaña a mano, que es lo que costó la corrida entera la primera vez.
  const m = motivoDeAborto(plan, { columna: 'M', pestaña: 'Cheques Emitidos' })
  assert.match(m, /me niego a escribir/)
  assert.match(m, /M27="nota de alguien en 27"/)
})

test('el límite también es proporcional: 3 de 12 filas es la columna cambiando de dueño', () => {
  const ajenas = { 27: 'x', 29: 'y', 31: 'z' }
  const plan = planDeMarcado({ columna: columna({ n: 12, ajenas }), marcas: marcas(12), fila0: 26, esMio })
  assert.ok(plan.aborto, '25% del registro ajeno tiene que abortar aunque no llegue a 5 filas')
})

test('una sola fila ajena en un registro chico NO aborta (el mínimo para la fracción)', () => {
  const plan = planDeMarcado({ columna: columna({ n: 4, ajenas: { 27: 'nota' } }), marcas: marcas(4), fila0: 26, esMio })
  assert.equal(plan.aborto, null, '1 de 4 supera el 10% pero sigue siendo UNA celda')
  assert.equal(plan.salteadas.length, 1)
})

test('lo ajeno FUERA del registro no bloquea nada, pero se reporta y cuenta para el límite', () => {
  const col = columna({ n: 6, ajenas: {} })
  col[199] = ['una nota del dueño abajo de todo'] // fila 200, fuera de la ventana 26–31
  const plan = planDeMarcado({ columna: col, marcas: marcas(6), fila0: 26, esMio })
  assert.equal(plan.salteadas.length, 0)
  assert.deepEqual(plan.fuera.map((f) => f.fila), [200])
  assert.deepEqual(plan.tramos.map((t) => [t.fila, t.valores.length]), [[26, 6]], 'igual se marca todo')
})

test('el umbral es el declarado y no una fracción escondida', () => {
  assert.equal(excedeElLimite(1, 106, LIMITES_AJENAS), false)
  assert.equal(excedeElLimite(5, 106, LIMITES_AJENAS), false)
  assert.equal(excedeElLimite(6, 106, LIMITES_AJENAS), true)
  assert.equal(excedeElLimite(1, 4, LIMITES_AJENAS), false)
  assert.equal(excedeElLimite(2, 10, LIMITES_AJENAS), true)
})

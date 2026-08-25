import test from 'node:test'
import assert from 'node:assert/strict'

import {
  celdasDelImpacto, direccionDe, estadoDelImpacto, type InsumosImpacto,
} from './impactoDotacion.ts'

const insumos = (over: Partial<InsumosImpacto> = {}): InsumosImpacto => ({
  plan: { genteTotal: 4, fin: '2026-09-01', desvioDias: 0 },
  simulado: { genteTotal: 6, fin: '2026-08-27', desvioDias: -3 },
  hhRestantes: 820,
  noEjecutables: 0,
  tocados: 1,
  disponibles: 18,
  ...over,
})

test('«no ejecutable» le gana a todo: un frente sin lugar no está «sin aplicar»', () => {
  // El defecto que atrapa: decir «simulación sin aplicar» sobre una simulación que el servidor va a
  // recortar al tope. La pantalla mostraría 8 personas y el plan quedaría con 4.
  const e = estadoDelImpacto(insumos({ noEjecutables: 2 }))
  assert.equal(e.tono, 'neg')
  assert.match(e.texto, /no ejecutable/)
})

test('pedir más gente de la que la obra tiene se dice con los dos números', () => {
  const e = estadoDelImpacto(insumos({ disponibles: 5, simulado: { genteTotal: 9, fin: null, desvioDias: null } }))
  assert.equal(e.texto, 'pide 9 y la obra tiene 5')
})

test('sin dato de plantel NO se acusa de exceso: no se compara contra nada', () => {
  const e = estadoDelImpacto(insumos({ disponibles: null, simulado: { genteTotal: 900, fin: null, desvioDias: null } }))
  assert.equal(e.texto, 'simulación sin aplicar')
})

test('sin frentes tocados, la pantalla está mostrando el plan y lo dice', () => {
  assert.deepEqual(estadoDelImpacto(insumos({ tocados: 0 })), { texto: 'igual al plan', tono: 'pos' })
})

test('adelantar el fin de obra es una MEJORA, no un cambio neutro', () => {
  const [, fin] = celdasDelImpacto(insumos())
  assert.equal(fin.direccion, 'baja')
  assert.equal(fin.tono, 'pos')
  assert.equal(fin.plan, '01/09')
  assert.equal(fin.simulado, '27/08')
})

test('atrasar el fin de obra es rojo', () => {
  const [, fin] = celdasDelImpacto(insumos({
    simulado: { genteTotal: 2, fin: '2026-09-20', desvioDias: 12 },
  }))
  assert.equal(fin.tono, 'neg')
})

test('las HH que faltan NO se publican como 0 cuando no hay análisis', () => {
  const hh = celdasDelImpacto(insumos({ hhRestantes: null }))[2]
  assert.equal(hh.plan, null)
  assert.equal(hh.simulado, null)
})

test('las HH no cambian con la dotación, y la celda lo dice en vez de repetir el número', () => {
  const hh = celdasDelImpacto(insumos())[2]
  assert.equal(hh.plan, '820')
  assert.equal(hh.simulado, 'iguales')
  assert.equal(hh.detalle, 'la cantidad de trabajo no cambia')
})

test('un fin fuera del calendario simulado se dice, no se inventa una fecha', () => {
  const [, fin] = celdasDelImpacto(insumos({ simulado: { genteTotal: 1, fin: null, desvioDias: null } }))
  assert.equal(fin.simulado, null)
  assert.equal(fin.detalle, 'fuera del calendario simulado')
})

test('sin uno de los dos lados no hay dirección, y el tono queda neutro', () => {
  assert.equal(direccionDe(null, 5), 'igual')
  assert.equal(direccionDe(5, null), 'igual')
  assert.equal(direccionDe(5, 5), 'igual')
  assert.equal(direccionDe(5, 6), 'sube')
  assert.equal(direccionDe(6, 5), 'baja')
})

test('más gente NO se pinta de rojo: es el gesto de la pantalla, no un problema', () => {
  const [gente] = celdasDelImpacto(insumos())
  assert.equal(gente.direccion, 'sube')
  assert.equal(gente.tono, 'neutro')
})

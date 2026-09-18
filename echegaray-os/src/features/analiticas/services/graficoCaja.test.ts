import test from 'node:test'
import assert from 'node:assert/strict'
import { apilar, escala, indicesRotulados, paneles, rotuloEje } from './graficoCaja.ts'

const serie = (nombre: string, tipo: string, valores: (number | null)[]) => ({ nombre, tipo, eje: null, punteada: false, valores })

test('apilar: los positivos suben uno sobre otro, los negativos bajan, el nulo y el cero no ocupan lugar', () => {
  const t = apilar([serie('a', 'COLUMN', [10, null, -5]), serie('b', 'COLUMN', [5, 0, 3]), serie('c', 'COLUMN', [-2, 4, -1])], 3)
  assert.deepEqual(t, [
    { serie: 0, i: 0, y0: 0, y1: 10 }, { serie: 1, i: 0, y0: 10, y1: 15 }, { serie: 2, i: 0, y0: 0, y1: -2 },
    { serie: 2, i: 1, y0: 0, y1: 4 },
    { serie: 0, i: 2, y0: 0, y1: -5 }, { serie: 1, i: 2, y0: 0, y1: 3 }, { serie: 2, i: 2, y0: -5, y1: -6 },
  ])
})

test('escala: incluye el cero, termina en redondo y marca de a pasos parejos', () => {
  assert.deepEqual(escala([12_300_000, 43_000_000, 7_000_000]), { min: 0, max: 50_000_000, ticks: [0, 10_000_000, 20_000_000, 30_000_000, 40_000_000, 50_000_000] })
  assert.deepEqual(escala([-84_571_623, 147_348_614]).ticks, [-100_000_000, -50_000_000, 0, 50_000_000, 100_000_000, 150_000_000])
  assert.deepEqual(escala([]), { min: 0, max: 1, ticks: [0, 1] })
  assert.deepEqual(escala([0, 0]).max, 1)
})

test('los rótulos del eje son cortos y en millones', () => {
  assert.equal(rotuloEje(0), '0')
  assert.equal(rotuloEje(50_000_000), '$ 50 M')
  assert.equal(rotuloEje(-2_500_000), '−$ 2,5 M')
})

test('paneles: barras arriba, líneas abajo; una serie sin tipo hereda el del gráfico', () => {
  const g = { id: '1', titulo: '', subtitulo: '', tipo: 'COMBO', apilado: 'STACKED', fila: 1, dominio: ['a'],
    series: [serie('sale', 'COLUMN', [1]), serie('saldo', 'LINE', [2]), { ...serie('x', 'LINE', [3]), tipo: null }] }
  const p = paneles(g)
  assert.deepEqual(p.barras.map((s) => s.nombre), ['sale', 'x'])
  assert.deepEqual(p.lineas.map((s) => s.nombre), ['saldo'])
  assert.deepEqual(paneles({ ...g, tipo: 'LINE' }).lineas.map((s) => s.nombre), ['saldo', 'x'])
})

test('los rótulos del dominio se reparten: siempre el primero y el último, nunca más de ocho', () => {
  assert.deepEqual(indicesRotulados(5), [0, 1, 2, 3, 4])
  const r = indicesRotulados(60)
  assert.equal(r[0], 0)
  assert.equal(r.at(-1), 59)
  assert.ok(r.length <= 9 && r.length >= 7)
})

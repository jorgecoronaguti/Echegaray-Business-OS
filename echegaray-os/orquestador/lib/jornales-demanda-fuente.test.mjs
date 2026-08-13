// EL PUENTE SE PRUEBA INYECTANDO LAS OBRAS: el import dinámico de lib/obras-datos.mjs es de otra
// rama y puede no existir — el contrato de esta lib es justamente sobrevivir a eso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cargarObrasVendidas, demandaParaJornales } from './jornales-demanda-fuente.mjs'

test('cargarObrasVendidas nunca revienta: sin lib/obras-datos.mjs devuelve [], con él devuelve un arreglo', async () => {
  const obras = await cargarObrasVendidas()
  assert.ok(Array.isArray(obras))
})

test('demandaParaJornales con obras inyectadas arma el mapa por clave de quincena, valuado y con las sin-fechas reportadas', async () => {
  const obras = [
    {
      clave: 'GALPON', inicio: '2026-09-01', fin: '2026-09-30',
      horas: { oficialEspecializado: 0, oficial: 100, ayudante: 100 },
      plantelFullTime: 4, plantelTemporales: 2,
    },
    { clave: 'SIN-FECHA', inicio: null, fin: null, horas: { oficial: 50 } },
  ]
  const d = await demandaParaJornales({ hoy: new Date(2026, 7, 7), escalones: [], obras })
  assert.equal(d.nObras, 2)
  assert.deepEqual(d.sinFechas.map((x) => x.clave), ['SIN-FECHA'])
  assert.deepEqual([...d.porQuincena.keys()], ['2026-09-1', '2026-09-2'])
  const s1 = d.porQuincena.get('2026-09-1')
  assert.equal(s1.nObras, 1)
  assert.equal(s1.plantel, 6)
  // Septiembre sin acuerdo firmado: un tramo proyectado del 1,9% sobre la escala de respaldo ago-26.
  assert.ok(Math.abs(s1.factor - 1.019) < 1e-12)
  assert.ok(s1.jornales > 0 && s1.cargas > 0 && Math.abs(s1.total - (s1.jornales + s1.cargas)) < 1e-9)
})

test('sin obras no hay demanda: mapa vacío y cero ruido', async () => {
  const d = await demandaParaJornales({ hoy: new Date(2026, 7, 7), obras: [] })
  assert.equal(d.porQuincena.size, 0)
  assert.equal(d.nObras, 0)
})

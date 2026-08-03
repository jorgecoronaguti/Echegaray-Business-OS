// NO DEBER NADA VENCIDO NO ES LO MISMO QUE NO HABER PODIDO MIRAR.
//
// `vencidoComercialDe` devolvía `null` en los dos casos. Aguas abajo, `null` se traduce en "hay datos
// faltantes que afectan el cálculo", y eso bloquea TODA propuesta de inversión del Tesorero. O sea:
// una empresa que paga en fecha quedaba castigada por pagar en fecha — su cero de deuda vencida se
// leía como un agujero de información.
//
// Se vio en producción el 03/08: el ciclo terminó `accionable`, relevó el mercado, armó las tablas
// de instrumentos… y publicó `0 publicables · 2 rechazadas`, con el motivo "deuda comercial vencida
// (Compras del Cash Flow)". No faltaba el dato: no había deuda vencida.
//
// Es la misma trampa que este repo ya pagó del otro lado —"un cero por falta de policy es
// indistinguible de un cero real"— sólo que dada vuelta.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { vencidoComercialDe } from './lectura-flujo.mjs'

const compra = (extra = {}) => ({ sheet_name: 'Compras', direction: 'out', amount: 1000, ...extra })

test('Compras leída y sin una sola fila vencida: es un CERO REAL, no una ausencia', () => {
  const r = vencidoComercialDe({ estado: 'ok', pestanas_leidas: ['Compras'], movimientos: [compra({ status: 'pendiente' })] })
  assert.notEqual(r, null, 'devolver null acá bloquea las propuestas de inversión sin motivo')
  assert.equal(r.monto, 0)
  assert.equal(r.leido, true)
})

test('Compras con filas vencidas: suma sólo las vencidas y de salida', () => {
  const r = vencidoComercialDe({
    estado: 'ok',
    pestanas_leidas: ['Compras'],
    movimientos: [
      compra({ status: 'vencido', amount: 300 }),
      compra({ status: 'vencido', amount: 700 }),
      compra({ status: 'pendiente', amount: 5000 }),
      { sheet_name: 'Compras', direction: 'in', status: 'vencido', amount: 9999 },
    ],
  })
  assert.equal(r.monto, 1000)
  assert.equal(r.n, 2)
})

test('el flujo que no se pudo leer sigue siendo null: ahí sí no sabemos', () => {
  assert.equal(vencidoComercialDe({ estado: 'sin_dato', movimientos: [] }), null)
})

test('Compras que no aparece por ningún lado es null, no cero — que no haya NINGÚN movimiento es sospechoso', () => {
  const r = vencidoComercialDe({ estado: 'ok', pestanas_leidas: ['Cobranzas'], movimientos: [{ sheet_name: 'Cobranzas', direction: 'in', amount: 1 }] })
  assert.equal(r, null)
})

// «¿Qué presupuestos tenemos en borrador?» se contesta del registro, no del modelo.
//
// Medido en el QA visual del 02/09: el chip de ejemplo de /presupuestos/nuevo degradaba al
// razonador —que contestó «no tengo acceso a tus datos» habiendo 13 borradores reales— porque
// `rodados.presupuestos` le ganaba la afinidad a `cotizacion.estado` (9 a 6): ni «presupuestos»
// ni «borrador» estaban en la cabeza de la tool. Este test fija el ruteo en las dos direcciones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toolsDelNucleo, afinidad } from '../xsas-resolutores.mjs'

const ganador = (mapa, frase) =>
  [...mapa.entries()].map(([clave, tool]) => ({ clave, p: afinidad(frase, tool) }))
    .sort((a, b) => b.p - a.p)[0].clave

test('las preguntas por presupuestos de OBRA van a cotizacion.estado, no a rodados', async () => {
  const { mapa } = await toolsDelNucleo({ google: null, refrescar: true })
  assert.equal(ganador(mapa, '¿qué presupuestos tenemos en borrador?'), 'cotizacion.estado')
  assert.equal(ganador(mapa, 'estado de los presupuestos'), 'cotizacion.estado')
  // Y el dominio de la flota NO se rompe: sus frases siguen siendo suyas.
  assert.equal(ganador(mapa, 'presupuestos de rodados'), 'rodados.presupuestos')
  assert.equal(ganador(mapa, 'presupuestos para comprar una camioneta'), 'rodados.presupuestos')
})

// QUE NO SE PUEDA ESCRIBIR UN PORCENTAJE SIN DECIR DE QUÉ UNIVERSO ES.

import test from 'node:test'
import assert from 'node:assert/strict'
import { coberturaDeCatalogo, riesgoDeCotizacion, relacionar, consolidar, UNIVERSO } from './precio-universos.mjs'

test('la cobertura del catálogo es un CONTEO y lo dice: ahí no hay plata que ponderar', () => {
  const c = coberturaDeCatalogo([
    { resultado: 'VIGENTE' }, { resultado: 'ACTUALIZADO' },
    { resultado: 'NECESITA_HUMANO' }, { resultado: 'SIN_PRECIO' },
  ])
  assert.equal(c.universo, UNIVERSO.CATALOGO)
  assert.equal(c.usables, 2)
  assert.equal(c.cobertura, 0.5)
  assert.equal(c.medida, 'CONTEO')
  assert.match(c.porQue, /NO dice cuánta plata está en riesgo/)
})

test('el riesgo de una cotización se pondera por plata, y lo NO MEDIDO no entra al denominador', () => {
  const r = riesgoDeCotizacion({
    recursos: 10, resueltos: 6,
    riesgos: [{ riesgo: 900, impacto: 1000 }, { riesgo: 100, impacto: 200 }, { riesgo: null, impacto: null }],
  })
  assert.equal(r.universo, UNIVERSO.COTIZACION)
  assert.equal(r.riesgoTotal, 1000)
  assert.equal(r.impactoEnDuda, 1200, 'el impacto del no medido no se suma como cero')
  assert.equal(r.noMedidos, 1)
  assert.equal(r.medida, 'PONDERADA_POR_PLATA')
})

test('un recurso que la oferta usa y el catálogo no tiene NO es un precio vencido', () => {
  const rel = relacionar({ codigosDelCatalogo: ['1', '2', '3'], codigosDeLaCotizacion: ['1', '2', '99'] })
  assert.deepEqual(rel.fueraDelCatalogo, ['99'])
  assert.equal(rel.enElCatalogo, 2)
  assert.equal(rel.delCatalogoSinUsar, 1)
  assert.match(rel.porQue, /una definición que falta/)
})

test('LA REGLA · el consolidado NO produce un número único, y lo dice', () => {
  const c = consolidar({
    catalogo: coberturaDeCatalogo([{ resultado: 'VIGENTE' }]),
    cotizacion: riesgoDeCotizacion({ recursos: 1, resueltos: 1, riesgos: [] }),
    relacion: relacionar({}),
  })
  assert.equal(c.numeroUnico, null, 'un promedio de los dos porcentajes no contesta ninguna de las dos preguntas')
  assert.match(c.porQue, /NO hay un porcentaje único/)
  // Cada número lleva su universo al lado: sin eso, «3,7%» y «45,8%» parecen comparables.
  assert.equal(c.catalogo.universo, UNIVERSO.CATALOGO)
  assert.equal(c.cotizacion.universo, UNIVERSO.COTIZACION)
})

test('con cero recursos la cobertura es null y NO cero: no medido no es vacío', () => {
  assert.equal(coberturaDeCatalogo([]).cobertura, null)
  assert.equal(riesgoDeCotizacion({ recursos: 0, resueltos: 0 }).cobertura, null)
})

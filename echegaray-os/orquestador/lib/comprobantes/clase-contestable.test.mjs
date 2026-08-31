// «ES FACTURA» — que el freno de presupuesto/remito TENGA una salida escrita.
//
// El freno nació el 21/08 y está bien: un presupuesto no es un gasto. Pero su única salida era un
// botón, y los botones en producción están apagados. Medido el 31/08: la orden de entrega de
// Cerrajería SAN MIGUEL por $23.000 se mandó DOS veces y quedó trabada las dos, sin ninguna palabra
// que la destrabara. Es el mismo defecto que el duplicado tuvo hasta el 25/08, con otro nombre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarRespuesta, RESPUESTA } from './respuesta-texto.mjs'
import { resolverClase, indiceClaseAbierta } from './fajo.mjs'
import { faltantesDe } from './faltantes.mjs'

const orden = () => ({
  clave: 'c:27163849394|0001-00000643',
  comprobante: {
    proveedor: 'Cerrajería SAN MIGUEL', cuit: '27163849394', numero: '0001-00000643',
    fecha: '31/08/2026', total: 23000, esPresupuestoORemito: true, obra: 'LA ESTRELLA',
  },
})

test('la pregunta nombra una palabra que se puede escribir, no un botón apagado', () => {
  const f = faltantesDe(orden())
  const p = f.map((x) => x.pregunta).join(' ')
  assert.match(p, /«es factura»/, 'no ofrece ninguna palabra escrita')
  assert.doesNotMatch(p, /tocá \*\*Corregir\*\*/, 'sigue mandando a un botón que está apagado')
})

test('«es factura» destraba el ítem; «descartalo» sigue siendo el otro camino', () => {
  const fajo = { items: [orden()] }
  const r = interpretarRespuesta(fajo, 'es factura')
  assert.equal(r?.que, RESPUESTA.CLASE)
  assert.deepEqual(r.indices, [0])

  const items = resolverClase(fajo.items, 0)
  assert.ok(items, 'no resolvió')
  assert.equal(items[0].claseResuelta, 'factura')
  assert.equal(items[0].comprobante.esPresupuestoORemito, false)
  assert.equal(indiceClaseAbierta(items), -1, 'quedó preguntando lo mismo')
  assert.equal(faltantesDe(items[0]).some((x) => /presupuesto/.test(x.texto)), false)

  assert.equal(interpretarRespuesta({ items: [orden()] }, 'descartalo')?.que, RESPUESTA.DESCARTAR)
})

test('contestarla dos veces no hace nada la segunda: el mismo idempotente que el duplicado', () => {
  const items = resolverClase([orden()], 0)
  assert.equal(resolverClase(items, 0), null)
})

test('sin la pregunta abierta, «es factura» NO es para este especialista', () => {
  const sano = { items: [{ comprobante: { proveedor: 'X', numero: '0001-1', total: 1 } }] }
  assert.equal(interpretarRespuesta(sano, 'es factura'), null, 'le robó el mensaje a otro')
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipsDeCliente, chipsDeObra, leFaltaUnDato, margenDeLaFila } from './chipsCartera.ts'

// EL DEFECTO QUE ESTOS TESTS ATRAPAN — medido en producción el 09/09/2026:
// `/administracion` mostraba «Messina · $156.174.253 contratado» y `/clientes`, del mismo cliente,
// «sin contrato». Si alguien vuelve a derivar «sin contrato» del monto, el primer test se pone rojo.

const cli = (p: Partial<Parameters<typeof chipsDeCliente>[0]> = {}) =>
  ({ cuit: '30-71649049-8', telefono: '2645551234', tieneContrato: true, ...p })

test('«sin contrato» NO es «sin precio»: el papel y el monto son dos conceptos', () => {
  // Con contrato cargado el cliente no reclama nada, tenga o no precio en OBRAS: el precio lo
  // reclama la OBRA, en su fila.
  assert.deepEqual(chipsDeCliente(cli()).map((c) => c.clave), [])
  assert.deepEqual(chipsDeCliente(cli({ tieneContrato: false })).map((c) => c.clave), ['sin-contrato'])

  // Y al revés: la obra con precio en OBRAS no dice nada del papel.
  const obra = { contratado: 156_174_253, avance: 42, jefe: 'Nasser', certificacion: { texto: 'sin certificar', reclama: false } }
  assert.deepEqual(chipsDeObra(obra).map((c) => c.clave), ['certificacion'])
  assert.deepEqual(
    chipsDeObra({ ...obra, contratado: null }).map((c) => c.clave),
    ['sin-precio', 'certificacion'],
  )
  assert.equal(chipsDeObra({ ...obra, contratado: null })[0].texto, 'sin precio en OBRAS')
})

test('un control que no pudo mirar no acusa: `tieneContrato` null no dibuja «sin contrato»', () => {
  assert.deepEqual(chipsDeCliente(cli({ tieneContrato: null })).map((c) => c.clave), [])
  assert.equal(leFaltaUnDato(cli({ tieneContrato: null })), false)
})

test('«datos faltantes» es exactamente «tiene al menos un chip»', () => {
  assert.equal(leFaltaUnDato(cli()), false)
  assert.equal(leFaltaUnDato(cli({ cuit: null })), true, 'sin CUIT no se factura')
  assert.equal(leFaltaUnDato(cli({ cuit: '   ' })), true, 'un CUIT en blanco no es un CUIT')
  assert.equal(leFaltaUnDato(cli({ telefono: null })), true, 'sin teléfono no se reclama')
  assert.equal(leFaltaUnDato(cli({ tieneContrato: false })), true, 'sin contrato no hay contra qué certificar')
  assert.deepEqual(
    chipsDeCliente({ cuit: null, telefono: null, tieneContrato: false }).map((c) => c.clave),
    ['sin-cuit', 'sin-telefono', 'sin-contrato'],
    'las tres se dicen: la fila no elige una y esconde las otras',
  )
})

test('la obra dice sin medir y sin jefe, y «sin medir» no es 0 %', () => {
  const chips = chipsDeObra({
    contratado: 1, avance: null, jefe: '  ', certificacion: { texto: 'sin certificar', reclama: false },
  })
  assert.deepEqual(chips.map((c) => c.clave), ['sin-medir', 'sin-jefe', 'certificacion'])
  assert.equal(chips.find((c) => c.clave === 'certificacion')?.tono, 'pendiente')
  const cobrado = chipsDeObra({
    contratado: 1, avance: 0, jefe: 'X', certificacion: { texto: 'cert. 2 cobrado', reclama: false },
  })
  // AVANCE 0 SÍ ES UN NÚMERO: sólo `null` es «no se sabe».
  assert.deepEqual(cobrado.map((c) => c.clave), ['certificacion'])
  assert.equal(cobrado[0].tono, 'pos')
  const sinLeer = chipsDeObra({
    contratado: 1, avance: 1, jefe: 'X', certificacion: { texto: 'certificación sin leer', reclama: true },
  })
  assert.equal(sinLeer[0].tono, 'warn')
})

test('el margen es NULL cuando falta un sumando — NULL nunca es cero', () => {
  // Lo que publica OBRAS manda, aunque los costos no estén.
  assert.equal(margenDeLaFila({ margenPublicado: 88_885_620, contratado: null, costoMo: null, costoMateriales: null }), 88_885_620)
  // Sin margen publicado se deriva, y sólo si están los TRES.
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: 100, costoMo: 40, costoMateriales: 25 }), 35)
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: 100, costoMo: 40, costoMateriales: null }), null,
    'sin el costo de materiales, publicar 60 sería declarar ganancia que nadie midió')
  assert.equal(margenDeLaFila({ margenPublicado: null, contratado: null, costoMo: 40, costoMateriales: 25 }), null)
  // Un margen negativo publicado NO se confunde con «falta el dato»: es una obra que pierde plata.
  assert.equal(margenDeLaFila({ margenPublicado: -5, contratado: 10, costoMo: 9, costoMateriales: 6 }), -5)
  assert.equal(margenDeLaFila({ margenPublicado: 0, contratado: 10, costoMo: 5, costoMateriales: 5 }), 0)
})

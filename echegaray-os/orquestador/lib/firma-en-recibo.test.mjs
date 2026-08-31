// LA FIRMA DEL EMPLEADOR VA EN LA LÍNEA DEL EMPLEADOR. Los items son los reales del recibo
// «1RA. QUINCENA 082026», leídos con pdfjs: los dos rótulos conviven en el mismo renglón.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotuloDelEmpleador, ubicacionDeLaFirma, yaFirmado, MARCA, ALTO_FIRMA } from './firma-en-recibo.mjs'

const ITEMS_REALES = [
  { str: 'FIRMA DEL EMPLEADO', transform: [1, 0, 0, 1, 278.2, 35.0], width: 50.3, height: 4.5 },
  { str: 'FIRMA DEL EMPLEADOR', transform: [1, 0, 0, 1, 469.4, 35.0], width: 53.5, height: 4.5 },
]
const FIRMA = { ancho: 129, alto: 135 }

test('EL DEFECTO CARO: «EMPLEADOR» empieza con «EMPLEADO» — no puede enganchar el del trabajador', () => {
  const r = rotuloDelEmpleador(ITEMS_REALES)
  assert.ok(r, 'no encontró el rótulo')
  assert.equal(r.x, 469.4, 'agarró la línea del EMPLEADO: la firma iría donde firma la persona')
  // Y al revés: si sólo está el del empleado, no hay dónde firmar.
  assert.equal(rotuloDelEmpleador([ITEMS_REALES[0]]), null)
})

test('sin rótulo NO se estima una posición: se devuelve null', () => {
  for (const items of [[], null, [{ str: 'OBSERVACIONES', transform: [1, 0, 0, 1, 10, 10], width: 5 }],
    [{ str: 'FIRMA DEL EMPLEADOR', transform: [1, 0] }]]) {
    assert.equal(rotuloDelEmpleador(items), null, JSON.stringify(items))
  }
})

test('la firma queda CENTRADA sobre el rótulo y APOYADA arriba de su línea', () => {
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA)
  const centroRotulo = 469.4 + 53.5 / 2
  assert.equal(Math.round((u.x + u.ancho / 2) * 10) / 10, Math.round(centroRotulo * 10) / 10)
  assert.ok(u.y > 35.0, 'quedó por debajo del rótulo, encima del texto')
  assert.equal(u.alto, ALTO_FIRMA)
  // La proporción de la imagen se respeta: una firma estirada no es la firma de nadie.
  assert.equal(Math.round((u.ancho / u.alto) * 1000), Math.round((129 / 135) * 1000))
})

test('la firma no se sale de la hoja A4 ni pisa la del empleado', () => {
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA)
  assert.ok(u.x > 0 && u.x + u.ancho < 595.3, `x ${u.x}..${u.x + u.ancho} se sale de la hoja`)
  assert.ok(u.y > 0 && u.y + u.alto < 841.9)
  const finEmpleado = 278.2 + 50.3
  assert.ok(u.x > finEmpleado, 'invade la columna de la firma del empleado')
})

test('sin imagen válida no se ubica nada — no se dibuja un rectángulo vacío', () => {
  for (const img of [null, { ancho: 0, alto: 10 }, { ancho: 10, alto: 0 }, {}]) {
    assert.equal(ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), img), null)
  }
})

test('IDEMPOTENTE: un recibo ya sellado se reconoce por la marca, no mirando píxeles', () => {
  assert.equal(yaFirmado(`...texto del recibo... ${MARCA} ...`), true)
  assert.equal(yaFirmado('un recibo sin sellar'), false)
  assert.equal(yaFirmado(null), false)
})

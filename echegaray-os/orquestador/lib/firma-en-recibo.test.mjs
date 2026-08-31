// LA FIRMA DEL EMPLEADOR VA EN LA LÍNEA DEL EMPLEADOR. Los items son los reales del recibo
// «1RA. QUINCENA 082026», leídos con pdfjs: los dos rótulos conviven en el mismo renglón.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rotuloDelEmpleador, lineasDelRecuadro, ubicacionDeLaFirma, yaFirmado, MARCA, ALTO_FIRMA, AIRE,
} from './firma-en-recibo.mjs'

const ITEMS_REALES = [
  { str: 'FIRMA DEL EMPLEADO', transform: [1, 0, 0, 1, 278.2, 35.0], width: 50.3, height: 4.5 },
  { str: 'FIRMA DEL EMPLEADOR', transform: [1, 0, 0, 1, 469.4, 35.0], width: 53.5, height: 4.5 },
]
const FIRMA = { ancho: 129, alto: 135 }

// Los trazos reales de la misma página, leídos de la lista de operadores de pdfjs. El RENGLÓN de la
// firma es el de y=42,5 y el TECHO del bloque es el de y=93,3.
const TRAZOS_REALES = [
  { x1: 0, y1: 0, x2: 595.3, y2: 841.9 },          // la hoja
  { x1: 8.5, y1: 8.5, x2: 592.4, y2: 93.5 },       // el bloque de firmas
  { x1: 430.0, y1: 31.8, x2: 562.1, y2: 39.1 },    // el fondo del rótulo (NO es horizontal)
  { x1: 428.0, y1: 42.5, x2: 564.1, y2: 42.5 },    // ← el renglón sobre el que se firma
  { x1: 8.8, y1: 93.3, x2: 592.2, y2: 93.3 },      // ← el techo del bloque
  { x1: 8.5, y1: 97.6, x2: 592.4, y2: 97.6 },
]
const LINEAS = () => lineasDelRecuadro(TRAZOS_REALES, rotuloDelEmpleador(ITEMS_REALES))

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

test('las dos líneas del recuadro se LEEN del papel: renglón 42,5 y techo 93,3', () => {
  assert.deepEqual(LINEAS(), { renglon: 42.5, techo: 93.3 })
  // El fondo del rótulo (31,8→39,1) tiene alto: no es una línea y no puede confundirse con una.
  // Una línea que no cruza el rótulo entero tampoco cuenta.
  assert.deepEqual(
    lineasDelRecuadro([{ x1: 470, y1: 50, x2: 480, y2: 50 }], rotuloDelEmpleador(ITEMS_REALES)),
    { renglon: null, techo: null })
})

test('EL DEFECTO QUE MARCÓ EL DUEÑO: la firma NO puede tapar el renglón que está firmando', () => {
  const { renglon, techo } = LINEAS()
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA, { renglon, techo })
  assert.ok(u.y >= renglon + AIRE, `la firma arranca en ${u.y}: muerde el renglón de ${renglon}`)
  assert.ok(u.y + u.alto <= techo - AIRE, `la firma llega a ${u.y + u.alto}: toca el techo de ${techo}`)
})

test('la firma queda CENTRADA sobre el rótulo y APOYADA arriba de su línea', () => {
  const { renglon, techo } = LINEAS()
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA, { renglon, techo })
  const centroRotulo = 469.4 + 53.5 / 2
  assert.equal(Math.round((u.x + u.ancho / 2) * 10) / 10, Math.round(centroRotulo * 10) / 10)
  assert.ok(u.y > 35.0, 'quedó por debajo del rótulo, encima del texto')
  assert.equal(u.alto, ALTO_FIRMA)
  // La proporción de la imagen se respeta: una firma estirada no es la firma de nadie.
  assert.equal(Math.round((u.ancho / u.alto) * 1000), Math.round((129 / 135) * 1000))
})

test('si el hueco es más chico que el tope, la firma se ACHICA — nunca desborda el recuadro', () => {
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA, { renglon: 42.5, techo: 60 })
  assert.ok(u.alto < ALTO_FIRMA, 'ignoró el techo y dibujó el tamaño completo')
  assert.ok(u.y + u.alto <= 60 - AIRE)
  assert.equal(Math.round((u.ancho / u.alto) * 1000), Math.round((129 / 135) * 1000), 'se deformó')
})

test('sin líneas legibles cae al ancla vieja (el rótulo) en vez de no firmar', () => {
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA, { renglon: null, techo: null })
  assert.ok(u.y > 35.0 && u.alto === ALTO_FIRMA)
})

test('la firma no se sale de la hoja A4 ni pisa la del empleado', () => {
  const { renglon, techo } = LINEAS()
  const u = ubicacionDeLaFirma(rotuloDelEmpleador(ITEMS_REALES), FIRMA, { renglon, techo })
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

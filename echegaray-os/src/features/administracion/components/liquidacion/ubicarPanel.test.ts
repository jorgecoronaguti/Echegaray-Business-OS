// EL PANEL DEL PUNTO NO SE CORTA, NI EN EL TELÉFONO NI DENTRO DEL SCROLL DE LA TABLA.
//
// El defecto que atrapa: un panel anclado al punto con `position: absolute` dentro de la tabla se corta con el
// `overflow` de la celda y se sale de la pantalla a 390 px. Se calcula contra la VENTANA, no contra el contenedor.

import test from 'node:test'
import assert from 'node:assert/strict'
import { ubicarPanel, MARGEN } from './ubicarPanel.ts'

const celda = (left: number, top: number) => ({ left, right: left + 6, top, bottom: top + 6 })

test('en 390 px el panel entra entero aunque el punto esté pegado al borde derecho', () => {
  const u = ubicarPanel({ ancla: celda(380, 100), ventana: { ancho: 390, alto: 800 }, panel: { ancho: 280, alto: 200 } })
  assert.ok(u.left >= MARGEN, 'no se sale por la izquierda')
  assert.ok(u.left + u.ancho <= 390 - MARGEN, 'no se sale por la derecha')
})

test('en una ventana más angosta que el panel, el panel se achica en vez de cortarse', () => {
  const u = ubicarPanel({ ancla: celda(10, 100), ventana: { ancho: 270, alto: 800 }, panel: { ancho: 280, alto: 200 } })
  assert.equal(u.ancho, 270 - 2 * MARGEN)
  assert.equal(u.left, MARGEN)
})

test('abajo del punto cuando hay lugar; arriba cuando abajo no entra', () => {
  const abajo = ubicarPanel({ ancla: celda(100, 100), ventana: { ancho: 1200, alto: 800 }, panel: { ancho: 280, alto: 200 } })
  assert.equal(abajo.arriba, false)
  const arriba = ubicarPanel({ ancla: celda(100, 700), ventana: { ancho: 1200, alto: 800 }, panel: { ancho: 280, alto: 200 } })
  assert.equal(arriba.arriba, true)
  assert.ok(arriba.top + 200 <= 700, 'el panel queda arriba del punto, sin taparlo')
})

test('si no entra ni arriba ni abajo, se queda abajo y el panel scrollea: nunca fuera de la pantalla', () => {
  const u = ubicarPanel({ ancla: celda(100, 300), ventana: { ancho: 1200, alto: 500 }, panel: { ancho: 280, alto: 480 } })
  assert.ok(u.top >= MARGEN)
  assert.ok(u.top + u.altoMaximo <= 500 - MARGEN + 0.001, 'el alto máximo cabe en lo que queda de pantalla')
})

test('en el teléfono el panel no baja bajo la barra inferior: esa franja no cuenta como lugar', () => {
  const sin = ubicarPanel({ ancla: celda(100, 500), ventana: { ancho: 390, alto: 800 }, panel: { ancho: 320, alto: 190 } })
  const con = ubicarPanel({ ancla: celda(100, 500), ventana: { ancho: 390, alto: 800, reservaAbajo: 64 }, panel: { ancho: 320, alto: 190 } })
  assert.equal(sin.arriba, false)
  assert.equal(con.altoMaximo, sin.altoMaximo - 64)
  // un punto donde SIN barra el panel entra abajo y CON barra quedaría tapado: tiene que subir
  const sinBarra = ubicarPanel({ ancla: celda(100, 560), ventana: { ancho: 390, alto: 800 }, panel: { ancho: 320, alto: 190 } })
  const conBarra = ubicarPanel({ ancla: celda(100, 560), ventana: { ancho: 390, alto: 800, reservaAbajo: 64 }, panel: { ancho: 320, alto: 190 } })
  assert.equal(sinBarra.arriba, false)
  assert.equal(conBarra.arriba, true)
  assert.ok(conBarra.top + 190 <= 560, 'el panel queda arriba del punto')
})

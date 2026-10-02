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

// QA 02/10: a 390×844 el cuadro tapaba la cabecera y escondía renglones bajo un scroll que no hacía falta.
const TEL = { ancho: 390, alto: 844, reservaArriba: 48, reservaAbajo: 64 }

test('teléfono: el cuadro vive ENTRE la cabecera y la barra inferior, con todo su alto si cabe (sin scroll interno)', () => {
  for (const top of [60, 200, 420, 700]) {
    const u = ubicarPanel({ ancla: celda(200, top), ventana: TEL, panel: { ancho: 320, alto: 380 } })
    assert.ok(u.top >= 48 + MARGEN, `top ${u.top} bajo la cabecera (ancla en ${top})`)
    assert.ok(u.top + 380 <= 844 - 64 - MARGEN, `el cuadro entero queda sobre la barra inferior (ancla en ${top})`)
    assert.ok(u.altoMaximo >= 380, `el alto máximo (${u.altoMaximo}) alcanza para el contenido: no scrollea`)
  }
})

test('teléfono: si el contenido no entra ni en toda la zona visible, el alto máximo ES la zona y recién ahí scrollea', () => {
  const u = ubicarPanel({ ancla: celda(200, 400), ventana: TEL, panel: { ancho: 320, alto: 900 } })
  assert.equal(u.top, 48 + MARGEN)
  assert.equal(u.altoMaximo, 844 - 64 - MARGEN - (48 + MARGEN))
})

test('la cabecera cuenta aunque el cuadro sea chico y vaya arriba del punto', () => {
  const u = ubicarPanel({ ancla: celda(100, 70), ventana: { ancho: 390, alto: 844, reservaArriba: 48 }, panel: { ancho: 320, alto: 200 } })
  assert.ok(u.top >= 48 + MARGEN, 'no queda bajo la cabecera')
})

test('PC: al costado de la celda, no encima de la columna; a la izquierda si a la derecha no entra', () => {
  const ancla = { left: 600, right: 606, top: 300, bottom: 306 }
  const der = ubicarPanel({ ancla, ventana: { ancho: 1440, alto: 900, reservaArriba: 48 }, panel: { ancho: 320, alto: 300 }, preferirCostado: true })
  assert.equal(der.lado, 'costado')
  assert.ok(der.left >= ancla.right, 'a la derecha del punto')
  assert.ok(der.top <= ancla.top && der.top + 300 >= ancla.bottom, 'alineado al renglón del punto')
  const izq = ubicarPanel({ ancla: { ...ancla, left: 1300, right: 1306 }, ventana: { ancho: 1440, alto: 900 }, panel: { ancho: 320, alto: 300 }, preferirCostado: true })
  assert.equal(izq.lado, 'costado')
  assert.ok(izq.left + izq.ancho <= 1300, 'a la izquierda, sin tapar el punto')
  assert.ok(izq.left >= MARGEN)
})

test('PC al costado: nunca fuera de la zona visible, aunque el punto esté en el borde de arriba o de abajo', () => {
  for (const top of [50, 880]) {
    const u = ubicarPanel({ ancla: { left: 600, right: 606, top, bottom: top + 6 }, ventana: { ancho: 1440, alto: 900, reservaArriba: 48 }, panel: { ancho: 320, alto: 300 }, preferirCostado: true })
    assert.ok(u.top >= 48 + MARGEN && u.top + 300 <= 900 - MARGEN, `ancla en ${top}: top ${u.top}`)
  }
})

test('si al costado no entra (ventana angosta), cae al arriba/abajo de siempre', () => {
  const u = ubicarPanel({ ancla: celda(200, 300), ventana: { ancho: 390, alto: 844 }, panel: { ancho: 320, alto: 200 }, preferirCostado: true })
  assert.equal(u.lado, 'vertical')
})

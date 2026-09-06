// LAS PRIMITIVAS DE UN CAMINO CERRADO SIGUEN TENIENDO QUE SER CORRECTAS.
//
// La conclusión de `cotas.mjs` es un NEGATIVO —la geometría no asigna la cota al elemento— y un
// negativo sólo vale si las piezas con las que se midió estaban bien. Si `fusionarColineales` no
// pega las dos mitades de una línea de cota, la escala sale al doble y el 15% medido no dice nada
// sobre el mundo: dice que el código estaba roto. Estos tests son lo que hace defendible el cierre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numeroDe, fusionarColineales, cotasDe, escalaPorConsenso, cotaMasCercana, normalizarMarca, mismoLargo, distanciaAlSegmento, desvio, anguloDe } from './cotas.mjs'

/** Una palabra como la devuelve el extractor: caja, texto y dirección de escritura. */
const palabra = (t, x, y, { h = 6, dir = [1, 0] } = {}) => ({ t, x0: x, y0: y, x1: x + t.length * 3, y1: y + h, dir })

test('UN NÚMERO ES UN NÚMERO; UNA MARCA NO', () => {
  assert.equal(numeroDe('3,50'), 3.5, 'el plano escribe con coma y el cómputo con punto')
  assert.equal(numeroDe('350'), 350)
  assert.equal(numeroDe('V1'), null)
  assert.equal(numeroDe('Ø12'), null, 'un diámetro pegado a su símbolo no es una cota suelta')
  assert.equal(numeroDe('0'), null, 'una cota de cero no existe: es un casillero vacío')
  assert.equal(numeroDe(null), null)
})

test('LAS DOS MITADES DE UNA LÍNEA DE COTA SE VUELVEN A PEGAR', () => {
  // El texto de la cota va en el hueco del medio y parte la línea. Sin pegarlas, cada mitad mide
  // 40 pt donde la cota mide 100, y la escala del plano sale al doble.
  const c = fusionarColineales([[0, 0, 40, 0], [60, 0, 100, 0]])
  assert.equal(c.length, 1)
  assert.equal(Math.round(c[0].largo), 100)
})

test('DOS LÍNEAS PARALELAS PERO SEPARADAS NO SE PEGAN', () => {
  // Si se pegaran, la escala se calcularía sobre longitudes inventadas.
  const c = fusionarColineales([[0, 0, 40, 0], [0, 30, 40, 30]])
  assert.equal(c.length, 2)
})

test('UNA COTA ES UN NÚMERO SOBRE LA LÍNEA, PARALELO Y NO EN LA PUNTA', () => {
  const cadenas = fusionarColineales([[0, 0, 200, 0]])
  const sobre = cotasDe([palabra('4.20', 90, -8)], cadenas)
  assert.deepEqual(sobre.map((c) => c.valor), [4.2])
  assert.equal(Math.round(sobre[0].largoPt), 200)

  const enLaPunta = cotasDe([palabra('4.20', 0, -8)], cadenas)
  assert.deepEqual(enLaPunta, [], 'un número apoyado en el extremo es un rótulo, no una cota')

  const perpendicular = cotasDe([palabra('4.20', 90, -8, { dir: [0, -1] })], cadenas)
  assert.deepEqual(perpendicular, [], 'el texto de una cota se escribe PARALELO a su línea')

  assert.deepEqual(cotasDe([palabra('4.20', 90, -8)], []), [], 'sin líneas no hay cotas: el control no puede inventar una')
})

test('LA ESCALA SALE POR CONSENSO Y DECLARA CUÁNTAS COTAS LA VOTARON', () => {
  const e = escalaPorConsenso([
    { valor: 2, largoPt: 100 }, { valor: 4, largoPt: 200 }, { valor: 6, largoPt: 300 }, { valor: 9, largoPt: 100 },
  ])
  assert.equal(Math.round(e.escala * 1000) / 1000, 0.02)
  assert.equal(e.votos, 3, 'tres cotas de acuerdo y una fuera: una escala con un solo voto no es una escala')
  assert.equal(escalaPorConsenso([]).escala, null)
})

test('LA COTA MÁS CERCANA RESPETA EL RADIO — y sin radio, cualquier número sirve para cualquier cosa', () => {
  const cotas = [{ valor: 3.5, cx: 100, cy: 0, largoPt: 100 }]
  assert.equal(cotaMasCercana(cotas, [{ cx: 150, cy: 0 }])?.cota.valor, 3.5)
  assert.equal(cotaMasCercana(cotas, [{ cx: 400, cy: 0 }]), null)
})

test('EL MISMO LARGO EN OTRA UNIDAD SIGUE SIENDO EL MISMO LARGO', () => {
  assert.ok(mismoLargo(350, 3.5), 'el plano escribe 350 cm donde el cómputo guarda 3,50 m')
  assert.ok(mismoLargo(3.5, 3.5))
  assert.ok(!mismoLargo(4.2, 3.5))
  assert.ok(!mismoLargo(0, 3.5))
  assert.ok(!mismoLargo(3.5, 0))
})

test('LA MARCA SE BUSCA NORMALIZADA: «V-1» en el JSON es «V1» en el plano', () => {
  assert.equal(normalizarMarca('V-1'), 'V1')
  assert.equal(normalizarMarca('Cañó 2'), 'CANO2')
  assert.equal(normalizarMarca(null), '')
})

test('LA DISTANCIA AL SEGMENTO DICE TAMBIÉN DÓNDE CAE SOBRE ÉL', () => {
  const m = distanciaAlSegmento(50, 10, 0, 0, 100, 0)
  assert.equal(m.d, 10)
  assert.equal(m.t, 0.5, 'sin el `t` no se puede distinguir el centro de la punta, que es lo que separa una cota de un rótulo')
  assert.equal(distanciaAlSegmento(0, 0, 5, 5, 5, 5).d, Math.hypot(5, 5), 'un segmento degenerado no puede romper la cuenta')
  assert.equal(desvio(anguloDe(0, 0, 1, 0), anguloDe(0, 0, -1, 0)), 0, 'una línea no tiene sentido, tiene dirección')
})

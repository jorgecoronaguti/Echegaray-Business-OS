// EL MENSAJE ÚNICO, CONTRA EL ESPAÑOL REAL DEL DUEÑO.
//
// Lo que pidió, textual y dos veces: «solo quiero q confirme q termino todo» · «me envie solo
// mensaje de confirmacion de q fue cargado ok, cuantos fueron cargados». Los tres números que tienen
// que estar y no pueden faltar: que TERMINÓ, cuántos ENTRARON y cuántos YA ESTABAN.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parteVacia, sumarPartes, acumular, parteDeRendicion, parteDeEscritura, textoTanda } from './parte.mjs'

test('el mensaje final dice que terminó, cuántos entraron y cuántos ya estaban', () => {
  const t = textoTanda({ ...parteVacia(), recibidos: 12, cargados: 8, yaEstaban: 2, suma: 3_201_450 }, { enVuelo: 0 })
  assert.match(t, /termin/i)                 // que terminó
  assert.match(t, /8 comprobantes/)          // cuántos se cargaron
  assert.match(t, /2 ya estaban cargados/)   // cuántos ya estaban
  assert.match(t, /\$3\.201\.450/)
})

test('mientras queda algo en curso NO dice que terminó: dice que está leyendo', () => {
  const t = textoTanda({ ...parteVacia(), recibidos: 8, cargados: 4 }, { enVuelo: 1 })
  assert.match(t, /Recibí \*\*8 comprobantes\*\*/)
  assert.match(t, /leyendo/)
  assert.match(t, /Van 4 cargados/)
  assert.doesNotMatch(t, /termin/i)
})

test('lo que no se pudo leer y lo que quedó sin imputar van EN EL MISMO mensaje, y sin preguntar nada', () => {
  const t = textoTanda({
    ...parteVacia(),
    recibidos: 12, cargados: 8, yaEstaban: 2, suma: 100,
    ilegibles: [{ nombre: 'IMG_7572.HEIC', motivo: 'no pude leerlo' }],
    sinImputar: [{ fila: 841, proveedor: 'DUPEC', campos: ['obra', 'unidad'] }],
  }, { enVuelo: 0 })
  assert.match(t, /IMG_7572\.HEIC/)
  assert.match(t, /fila 841/)
  assert.match(t, /Obra/)
  assert.match(t, /Unidad de Negocio/)
  // NADA QUE CONTESTAR. Ni una pregunta, ni un "tocá", ni un "elegí": eso es lo que él sacó.
  assert.doesNotMatch(t, /\?/)
  assert.doesNotMatch(t, /tocá|toca |eleg[íi]|confirm[áa]|respondeme|contestame/i)
})

test('cargados en cero se dice cargados en cero — no "listo" a secas', () => {
  const t = textoTanda({ ...parteVacia(), recibidos: 3 }, { enVuelo: 0 })
  assert.match(t, /no cargué ninguno/)
  assert.match(t, /de los 3 que mandaste/)
})

test('sumar partes es conmutativo: los posts de una tanda terminan en cualquier orden', () => {
  const a = { ...parteVacia(), recibidos: 4, cargados: 3, suma: 100, ilegibles: [{ nombre: 'a.jpg' }] }
  const b = { ...parteVacia(), recibidos: 8, cargados: 5, yaEstaban: 2, suma: 50 }
  const ab = sumarPartes(a, b)
  const ba = sumarPartes(b, a)
  assert.equal(ab.recibidos, 12)
  assert.equal(ab.cargados, 8)
  assert.equal(ab.yaEstaban, 2)
  assert.equal(ab.suma, 150)
  assert.deepEqual({ ...ab, ilegibles: [] }, { ...ba, ilegibles: [] })
  assert.equal(ba.ilegibles.length, 1)
})

test('acumular sobre nada devuelve la parte vacía, no undefined', () => {
  assert.deepEqual(acumular([]), parteVacia())
  assert.equal(textoTanda(acumular([]), { enVuelo: 0 }).length > 0, true)
})

test('la rendición: lo que ya estaba, lo ilegible y las copias caen cada uno en su casilla', () => {
  const p = parteDeRendicion({
    total: 5,
    porAdjunto: [
      { nombre: '1.jpg', destino: 'cargado', detalle: 'ya estaba en Compras, fila 800' },
      { nombre: '2.jpg', destino: 'copia', detalle: 'otra foto de X' },
      { nombre: '3.jpg', destino: 'ilegible', detalle: 'no se ve el total' },
      { nombre: '4.jpg', destino: 'listo', detalle: 'listo para cargar' },
      { nombre: '5.jpg', destino: 'duplicado', detalle: 'puede ser la fila 840' },
    ],
  }, { seCargaron: true })
  assert.equal(p.recibidos, 5)
  assert.equal(p.yaEstaban, 1)
  assert.equal(p.copias, 1)
  assert.equal(p.ilegibles.length, 1)
  assert.equal(p.trabados.length, 1)   // el duplicado; el "listo" lo cuenta la escritura
})

test('si la escritura NO ocurrió, el que estaba LISTO se nombra: un gasto sin cargar no se calla', () => {
  const p = parteDeRendicion({
    total: 1, porAdjunto: [{ nombre: '4.jpg', destino: 'listo', detalle: 'listo para cargar' }],
  }, { seCargaron: false })
  assert.equal(p.trabados.length, 1)
  assert.match(textoTanda(p, { enVuelo: 0 }), /4\.jpg/)
})

test('la escritura aporta filas, plata y lo que quedó sin imputar — y nunca cuenta una fila sin número', () => {
  const p = parteDeEscritura({
    filas: [{ fila: 841 }, { fila: 842 }, { fila: null }],
    yaEstaban: 1, suma: 500,
    sinImputar: [{ fila: 841, campos: ['obra'] }],
    avisos: ['1 fila(s) quedaron con #ERROR en Compras — revisalas.'],
  })
  assert.equal(p.cargados, 2)
  assert.equal(p.yaEstaban, 1)
  assert.equal(p.suma, 500)
  assert.equal(p.sinImputar.length, 1)
  assert.match(textoTanda(p, { enVuelo: 0 }), /#ERROR/)
})

test('un adjunto SIN RASTRO se declara: el agujero se anuncia, no se calla', () => {
  const p = parteDeRendicion({
    total: 1, porAdjunto: [{ nombre: 'x.jpg', destino: 'sin_rastro', detalle: 'no aparece' }],
  })
  assert.match(textoTanda(p, { enVuelo: 0 }), /x\.jpg/)
  assert.match(textoTanda(p, { enVuelo: 0 }), /no aparece en ningún lado/)
})

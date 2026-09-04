// LA CALIBRACION ES EL CORAZON DE ESTA FASE: si estos numeros se mueven sin volver a medir, la
// resolucion de identidad empieza a fusionar proveedores distintos y nadie se entera.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { confianzaDeCoseno, confianzaConMargen, PISO, TECHO, CALIBRACION } from './calibracion.mjs'
import { normalizar, coseno } from './embeddings.mjs'
import { accionPara, ACCION, METODO } from './resultado.mjs'

test('la normalizacion borra la forma societaria y las tildes: es lo que hace comparable un nombre', () => {
  assert.equal(normalizar('José Sánchez S.R.L.'), 'JOSE SANCHEZ')
  assert.equal(normalizar('JOSE SANCHEZ SRL'), 'JOSE SANCHEZ')
  assert.equal(normalizar('Corralón Progreso S.A.'), 'CORRALON PROGRESO')
})

// ESTE ES EL TEST QUE IMPIDE VOLVER AL DEFECTO. 0,90 de coseno es RUIDO en este corpus.
test('un coseno de 0,90 no puede dar confianza suficiente para aplicar nada', () => {
  const c = confianzaDeCoseno(0.90)
  assert.equal(c, 0, 'por debajo del p99 del ruido medido')
  assert.equal(accionPara(c, METODO.ML_LOCAL), ACCION.DESCARTAR)
})

test('los cuatro falsos positivos REALES medidos el 04/09 se descartan', () => {
  for (const [cos, par] of [[0.9446, 'Lliteras ~ Maderas Literas SRL'], [0.9433, 'Pintureria Cordoba ~ Robles Pintureria'],
    [0.9415, 'Acerolatina SA ~ Friolatina SA'], [0.9328, 'Robles Jose Maria ~ Robles Pintureria']]) {
    const c = confianzaDeCoseno(cos)
    assert.notEqual(accionPara(c, METODO.ML_LOCAL), ACCION.APLICAR, `${par} no se puede aplicar solo`)
  }
})

test('las cuatro variantes REALES del mismo proveedor se resuelven solas', () => {
  for (const cos of [1.0, 1.0, 0.9922, 0.9666]) {
    assert.equal(accionPara(confianzaDeCoseno(cos), METODO.ML_LOCAL), ACCION.APLICAR)
  }
})

test('sin margen contra el segundo candidato no se aplica, por alto que sea el coseno', () => {
  assert.equal(accionPara(confianzaConMargen(0.99, 0.985), METODO.ML_LOCAL), ACCION.DESCARTAR)
  assert.equal(accionPara(confianzaConMargen(0.99, 0.96), METODO.ML_LOCAL), ACCION.SUGERIR)
  assert.equal(accionPara(confianzaConMargen(0.99, 0.90), METODO.ML_LOCAL), ACCION.APLICAR)
})

test('el piso y el techo son los medidos, y la calibracion declara su limitacion', () => {
  assert.equal(PISO, CALIBRACION.ruido.p99)
  assert.equal(TECHO, CALIBRACION.verdaderos.min)
  assert.ok(TECHO > CALIBRACION.ruido.max, 'el techo tiene que estar por encima del peor falso positivo')
  assert.match(CALIBRACION.limitacion, /muestra chica/)
})

test('coseno devuelve null si los vectores no son comparables', () => {
  assert.equal(coseno([1, 0], [1, 0, 0]), null)
  assert.equal(coseno(null, [1]), null)
})

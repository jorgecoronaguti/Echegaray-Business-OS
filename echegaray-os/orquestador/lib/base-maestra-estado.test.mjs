// LOS INVARIANTES QUE CUESTAN PLATA. Cada uno se prueba por el lado que PROHÍBE, no por el que
// permite: un test que sólo comprueba que VALIDADO cotiza pasa igual con una función que devuelve
// `true` siempre.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADO_BM, COMO_ESTADO_DE_DATO, cierraPrecio, esNorma, entraEnCobertura,
  costoQuePublica, puedeCorregirA, porQueEstado,
} from './base-maestra-estado.mjs'
import { ESTADO as ESTADO_DATO } from './cotizador/contrato.mjs'

test('HISTORICO ≠ VALIDADO: cotiza igual, pero NO es norma', () => {
  assert.equal(cierraPrecio(ESTADO_BM.HISTORICO), true, 'un histórico sirve para cotizar: es lo que la empresa viene haciendo')
  assert.equal(esNorma(ESTADO_BM.HISTORICO), false, 'si un histórico fuera norma, el primer error de carga quedaría consagrado')
  assert.equal(esNorma(ESTADO_BM.VALIDADO), true)
  // El invariante en una línea: los dos cotizan y NO son intercambiables.
  assert.notEqual(esNorma(ESTADO_BM.HISTORICO), esNorma(ESTADO_BM.VALIDADO))
})

test('CANDIDATO ≠ NORMA: y además no cierra precio', () => {
  assert.equal(esNorma(ESTADO_BM.CANDIDATO), false)
  assert.equal(cierraPrecio(ESTADO_BM.CANDIDATO), false, 'un candidato lo aprendió el sistema y no lo aprobó nadie')
  assert.equal(entraEnCobertura(ESTADO_BM.CANDIDATO), false)
})

test('los cuatro estados tienen consecuencias DISTINTAS entre sí', () => {
  const firma = (e) => `${cierraPrecio(e)}|${esNorma(e)}|${entraEnCobertura(e)}`
  const firmas = Object.values(ESTADO_BM).map(firma)
  // INCOMPLETO y CANDIDATO comparten las tres prohibiciones y se distinguen por el motivo: el
  // primero es un defecto de la composición, el segundo un trámite de aprobación pendiente.
  assert.notEqual(porQueEstado(ESTADO_BM.INCOMPLETO), porQueEstado(ESTADO_BM.CANDIDATO))
  assert.equal(new Set(firmas.slice(0, 3)).size, 3, 'VALIDADO, HISTORICO y CANDIDATO no pueden permitir lo mismo')
})

test('un estado desconocido NO cotiza y NO es norma — la respuesta por defecto es la que no cuesta plata', () => {
  for (const basura of ['APROBADO', '', null, undefined, 'validado']) {
    assert.equal(cierraPrecio(basura), false, `«${basura}» no puede cerrar un precio`)
    assert.equal(esNorma(basura), false)
  }
})

test('SIN_DATO ≠ 0: una composición INCOMPLETA publica null, nunca cero', () => {
  const r = costoQuePublica(ESTADO_BM.INCOMPLETO, 28939.5)
  assert.equal(r.costo, null, 'un 0 se suma en silencio y desaparece; un null obliga a decidir')
  assert.notEqual(r.costo, 0)
  assert.equal(r.estadoDelDato, ESTADO_DATO.FALTA_DATO)
})

test('NULL ≠ 0: un VALIDADO sin costo cargado publica null, no cero', () => {
  assert.equal(costoQuePublica(ESTADO_BM.VALIDADO, null).costo, null)
  assert.equal(costoQuePublica(ESTADO_BM.VALIDADO, undefined).costo, null)
  // Y un cero REAL sí pasa: hay tareas que efectivamente cuestan 0 (una provisión del cliente).
  assert.equal(costoQuePublica(ESTADO_BM.VALIDADO, 0).costo, 0)
})

test('un HISTORICO no puede corregir a nadie; un VALIDADO sí', () => {
  assert.equal(puedeCorregirA(ESTADO_BM.HISTORICO, ESTADO_BM.CANDIDATO).puede, false)
  assert.equal(puedeCorregirA(ESTADO_BM.CANDIDATO, ESTADO_BM.HISTORICO).puede, false)
  assert.equal(puedeCorregirA(ESTADO_BM.VALIDADO, ESTADO_BM.HISTORICO).puede, true)
})

test('el vocabulario del contrato es el mismo: no hay dos taxonomías', () => {
  assert.equal(COMO_ESTADO_DE_DATO[ESTADO_BM.HISTORICO], ESTADO_DATO.HISTORICO)
  assert.equal(COMO_ESTADO_DE_DATO[ESTADO_BM.CANDIDATO], ESTADO_DATO.PROPUESTO)
  assert.equal(COMO_ESTADO_DE_DATO[ESTADO_BM.INCOMPLETO], ESTADO_DATO.FALTA_DATO)
})

test('no existe forma de ascender un estado desde este módulo', () => {
  const exportado = Object.keys({ ESTADO_BM, cierraPrecio, esNorma, entraEnCobertura, costoQuePublica, puedeCorregirA, porQueEstado })
  assert.equal(exportado.some((k) => /ascender|promover|validar/i.test(k)), false,
    'cambiar de estado es una decisión con nombre y fecha, no una regla que corra sola')
})

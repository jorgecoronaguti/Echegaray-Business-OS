import test from 'node:test'
import assert from 'node:assert/strict'
import { ALIAS_VISTA, LABEL_FICHA, VISTAS_FICHA, vistaDe } from './vistasFicha.ts'

// LAS CARAS DEL LEGAJO, Y EL ENLACE QUE NO SE PUEDE ROMPER.
//
// El 18/09/2026 «Asignaciones» dejó de ser una solapa y se fundió con «Horas» en «Horas y obras».
// El defecto caro de una unificación así no es visual: es que `?v=asignaciones` —que circula por
// cuatro specs, por el chat y por lo que alguien tenga guardado— caiga en el Resumen sin decir nada.
// Un enlace que lleva a otro lado sin avisar es peor que uno que falla.

test('son seis caras y ninguna se llama «asignaciones»', () => {
  assert.equal(VISTAS_FICHA.length, 6)
  assert.ok(!VISTAS_FICHA.includes('asignaciones' as never))
  assert.ok(VISTAS_FICHA.includes('horas'))
})

test('cada cara tiene rótulo, y el de las horas nombra también a las obras', () => {
  for (const v of VISTAS_FICHA) assert.ok(LABEL_FICHA[v]?.length > 0, `${v} sin rótulo`)
  assert.match(LABEL_FICHA.horas, /obras/i)
})

test('`?v=asignaciones` no se apaga: abre la cara que lo absorbió', () => {
  assert.equal(vistaDe('asignaciones'), 'horas')
  assert.equal(ALIAS_VISTA.asignaciones, 'horas')
})

test('una cara propia gana sobre cualquier alias, y lo desconocido cae en el Resumen', () => {
  for (const v of VISTAS_FICHA) assert.equal(vistaDe(v), v)
  assert.equal(vistaDe(undefined), 'resumen')
  assert.equal(vistaDe(''), 'resumen')
  assert.equal(vistaDe('recibos'), 'resumen')
  // Un `?v=` viene del navegador: nada de lo que llegue puede hacer que la página elija una cara
  // que no existe.
  assert.ok(VISTAS_FICHA.includes(vistaDe('__proto__')))
  assert.ok(VISTAS_FICHA.includes(vistaDe('constructor')))
})

test('ningún alias apunta a una cara que no existe', () => {
  for (const [k, v] of Object.entries(ALIAS_VISTA)) {
    assert.ok(VISTAS_FICHA.includes(v), `${k} apunta a «${v}», que no es una cara`)
    assert.ok(!VISTAS_FICHA.includes(k as never), `${k} es cara Y alias a la vez`)
  }
})

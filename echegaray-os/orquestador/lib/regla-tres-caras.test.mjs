// EL COMPARADOR TIENE QUE PODER FALLAR.
//
// Un intérprete que devuelve `false` ante lo que no entiende haría que las tres caras "coincidan"
// siempre: el test de rubro-caja-tres-caras daría verde con las reglas rotas. Por eso acá se prueba
// el intérprete contra casos donde la respuesta correcta se conoce de antemano, y se prueba que
// ROMPE ante lo que no sabe leer en vez de contestar que no.
import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarSheet, evaluarSql, rubroSegun } from './regla-tres-caras.mjs'

test('la fórmula de Sheet se evalúa con la precedencia de Sheets, no con la del que la lee', () => {
  const f = { proveedor: 'Movistar', unidad: 'Civil' }
  // (proveedor en la lista) * ((unidad no es de obra) + (proveedor es de los SIEMPRE)) > 0
  const conExcepcion = '(REGEXMATCH(LOWER($E$4:$E&"");"^(movistar|rsv)$")*(((LOWER($I$4:$I)<>"civil")*(LOWER($I$4:$I)<>"mantenimiento"))+REGEXMATCH(LOWER($E$4:$E&"");"^(rsv)$")>0)>0)'
  assert.equal(evaluarSheet(conExcepcion, f), false, 'Movistar en unidad de obra NO es recurrente')
  assert.equal(evaluarSheet(conExcepcion, { ...f, proveedor: 'RSV' }), true, 'RSV lo es aunque la unidad diga obra')
  assert.equal(evaluarSheet(conExcepcion, { ...f, unidad: 'Estructura' }), true)
})

test('el punto del regex sigue siendo un punto: "sanitarios od sxaxsx" no es "s.a.s."', () => {
  // Si los literales se volvieran a escribir dentro del código generado, el `\.` se leería como
  // "cualquier carácter" y esta fila pasaría por el proveedor real. El test daría verde por el
  // motivo equivocado, que es la única forma en que un comparador miente.
  const expr = 'REGEXMATCH(LOWER($E$4:$E&"");"^(sanitarios od s\\.a\\.s\\.)$")'
  assert.equal(evaluarSheet(expr, { proveedor: 'Sanitarios OD S.A.S.' }), true)
  assert.equal(evaluarSheet(expr, { proveedor: 'sanitarios od sxaxsx' }), false)
})

test('LOWER no recorta y "<>" no se convierte en "!=="', () => {
  assert.equal(evaluarSheet('(LOWER($I$4:$I)<>"civil")', { unidad: 'CIVIL' }), false)
  assert.equal(evaluarSheet('(LOWER($I$4:$I)<>"civil")', { unidad: 'Civil ' }), true, 'un espacio al final ya no es "civil"')
  assert.equal(evaluarSheet('(LOWER($I$4:$I)="civil")', { unidad: 'Civil' }), true)
})

test('un rango de Sheet que el intérprete no conoce ROMPE, no contesta que no', () => {
  assert.throws(() => evaluarSheet('(LOWER($Z$4:$Z)="algo")', {}), /rango de Sheet que no conozco/)
})

test('el "and" del SQL liga más fuerte que el "or", igual que en Postgres', () => {
  // `a and b or c`: si el intérprete lo leyera como `a and (b or c)`, la regla de recurrentes
  // —(proveedor en la lista) and (unidad ok or proveedor siempre)— cambiaría de sentido y la
  // comparación de las tres caras dejaría de detectar el error que existe para detectar.
  const expr = "lower(coalesce(proveedor, '')) = 'x' and lower(coalesce(unidad_negocio, '')) = 'y' or lower(coalesce(obra_texto, '')) = 'z'"
  assert.equal(evaluarSql(expr, { proveedor: 'x', unidad: 'y', cliente: '' }), true)
  assert.equal(evaluarSql(expr, { proveedor: 'x', unidad: 'no', cliente: 'z' }), true)
  assert.equal(evaluarSql(expr, { proveedor: 'no', unidad: 'y', cliente: 'no' }), false)
})

test('el SQL evalúa "not in" con NULL como cadena vacía, que es lo que hace coalesce', () => {
  const expr = "lower(coalesce(unidad_negocio, '')) not in ('civil', 'mantenimiento')"
  assert.equal(evaluarSql(expr, {}), true, 'sin unidad, no está en la lista')
  assert.equal(evaluarSql(expr, { unidad: 'Civil' }), false)
  assert.equal(evaluarSql(expr, { unidad: 'Estructura' }), true)
})

test('el SQL que queda sin consumir ROMPE: media condición evaluada es peor que ninguna', () => {
  assert.throws(() => evaluarSql("lower(coalesce(proveedor, '')) = 'x' xor y", {}), /sobró SQL sin consumir/)
  assert.throws(() => evaluarSql("lower(coalesce(inventada, '')) = 'x'", {}), /columna SQL que no conozco/)
})

test('rubroSegun respeta el orden: la primera regla que matchea gana', () => {
  const reglas = [
    {
      rubro: 'PRIMERA',
      js: (r) => r.unidad === 'x',
      sheet: '(LOWER($I$4:$I)="x")',
      sql: "lower(coalesce(unidad_negocio, '')) = 'x'",
    },
    {
      rubro: 'SEGUNDA',
      js: () => true,
      sheet: '(LOWER($I$4:$I)<>"imposible")',
      sql: "lower(coalesce(unidad_negocio, '')) not in ('imposible')",
    },
  ]
  for (const cara of ['js', 'sheet', 'sql']) {
    assert.equal(rubroSegun(reglas, cara, { unidad: 'x' }, 'NADA'), 'PRIMERA', `cara ${cara}`)
    assert.equal(rubroSegun(reglas, cara, { unidad: 'otra' }, 'NADA'), 'SEGUNDA', `cara ${cara}`)
  }
  assert.throws(() => rubroSegun(reglas, 'inventada', {}, 'NADA'), /no existe la cara/)
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cantidad, dm, dmHora } from './formato.ts'

// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })` —sin año— devuelve «23/4»:
// ICU ignora el `2-digit` del mes. Se vio en la captura de Pedidos, con la columna de fechas
// desalineada fila por fila. Un test lo fija; la próxima vez que alguien "simplifique" el formato,
// se pone rojo acá y no en una captura tres semanas después.

test('la fecha corta va SIEMPRE con dos dígitos, día y mes', () => {
  assert.equal(dm('2026-04-23'), '23/04')
  assert.equal(dm('2026-08-20'), '20/08')
  assert.equal(dm('2026-12-01'), '01/12')
})

test('un timestamp completo se corta al día, sin correrse de huso', () => {
  assert.equal(dm('2026-08-20T14:05:00'), '20/08')
  assert.equal(dmHora('2026-08-20T14:05:00'), '20/08/26')
})

test('sin fecha —o con una fecha rota— devuelve null: la ausencia la escribe la celda', () => {
  for (const v of [null, undefined, '', 'no es una fecha']) {
    assert.equal(dm(v), null, `«${String(v)}» produjo una fecha`)
    assert.equal(dmHora(v), null)
  }
})

test('la cantidad respeta es-AR y el null NO se vuelve cero', () => {
  assert.equal(cantidad(1200), '1.200')
  assert.equal(cantidad(18.5), '18,5')
  assert.equal(cantidad(0), '0') // un cero CARGADO sí es un cero: se muestra
  assert.equal(cantidad(null), null)
  assert.equal(cantidad(undefined), null)
  assert.equal(cantidad(Number.NaN), null)
})

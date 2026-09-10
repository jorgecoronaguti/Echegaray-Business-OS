import test from 'node:test'
import assert from 'node:assert/strict'
import { celda, compararEspejo, desfasajeDeFilas, diferenciasDeFila } from './compras-espejo-auditoria.mjs'

test('el numeric de Postgres y el número del Sheet son el MISMO total', () => {
  assert.equal(celda('total', '100002.97'), celda('total', 100002.97))
  assert.deepEqual(diferenciasDeFila({ total: 100002.97 }, { total: '100002.97' }, ['total']), [])
})

test('la fecha date de Postgres y el ISO del Sheet son el MISMO día', () => {
  assert.equal(celda('fecha', new Date(2026, 8, 10)), '2026-09-10')
  assert.deepEqual(diferenciasDeFila({ fecha: '2026-09-10' }, { fecha: new Date(2026, 8, 10) }, ['fecha']), [])
})

test('una celda vacía y un null son lo mismo: no hay dato', () => {
  assert.equal(celda('proveedor', ''), null)
  assert.equal(celda('proveedor', null), null)
})

test('el comparador ve la fila que falta, la que sobra y la celda distinta', () => {
  const r = compararEspejo(
    [{ fila: 4, proveedor: 'Dipot', total: 100 }, { fila: 5, proveedor: 'Lliteras', total: 200 }],
    [{ fila: 4, proveedor: 'Dipot', total: '100' }, { fila: 6, proveedor: 'X', total: '9' }],
  )
  assert.deepEqual(r.faltan, [5])
  assert.deepEqual(r.sobran, [6])
  assert.equal(r.filasConDiferencia, 0)
})

test('una celda distinta se cuenta en su columna y sale entre las peores', () => {
  const r = compararEspejo(
    [{ fila: 4, proveedor: 'Dipot', total: 100 }],
    [{ fila: 4, proveedor: 'Dipot', total: '999' }],
  )
  assert.equal(r.porColumna.total, 1)
  assert.equal(r.peores[0].fila, 4)
})

// LA TRAMPA QUE HAY QUE PODER VER: el dueño inserta una fila arriba y el espejo queda corrido. Si
// este control no la detecta, «datos errados» no tiene explicación.
test('detecta el espejo corrido una fila y desde dónde', () => {
  const sheet = [
    { fila: 4, clave: 'c:1|A', total: 1 }, { fila: 5, clave: 'c:2|B', total: 2 },
    { fila: 6, clave: 'c:3|C', total: 3 }, { fila: 7, clave: 'c:4|D', total: 4 },
  ]
  const espejo = [
    { fila: 4, clave: 'c:1|A', total: 1 }, { fila: 5, clave: 'c:3|C', total: 3 },
    { fila: 6, clave: 'c:4|D', total: 4 },
  ]
  const d = desfasajeDeFilas(sheet, espejo)
  assert.equal(d.corrido, 1)  // la fila N del espejo trae lo que en el Sheet está en N+1
  assert.equal(d.desde, 5)
})

test('un espejo alineado no denuncia corrimiento', () => {
  const filas = [{ fila: 4, clave: 'c:1|A' }, { fila: 5, clave: 'c:2|B' }]
  assert.equal(desfasajeDeFilas(filas, filas).corrido, null)
})

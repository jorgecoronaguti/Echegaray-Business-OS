// LA GUARDA INVERSA EN EL CHOKE POINT — lo que el dueño vació no vuelve por NINGÚN camino.
//
// El defecto que estos tests atrapan: trece escrituras de valores del pipeline del Flujo de Caja no
// pasan por `escribirPreservando`, así que nunca consultaban la huella. Las seis de "Proveedores" y
// los dos tableros de cheques escriben por `updateCells`, un camino que ni siquiera pasaba por
// `no-borrar.mjs`. Ahí un borrado del dueño volvía en la corrida siguiente y nada lo miraba.
//
// Si se quita el gancho `antesDePreservar` de `protegerBorrado` (o su cableado en google.mjs), los
// tests (b) y (c) se ponen rojos.
import test from 'node:test'
import assert from 'node:assert/strict'
import { avisoNoRepuestas, origenDeRango, sinReponerVaciadas } from './no-reponer.mjs'
import { protegerBorrado } from './no-borrar.mjs'

test('(a) núcleo: la celda marcada y hoy vacía no se repone; la de al lado se escribe normal', () => {
  const actual = [['', 'lo que sigue']]
  const values = [['TOTAL FACTURADO', 'lo que sigue']]
  const r = sinReponerVaciadas(actual, values, new Set(['1:0']), { fila0: 1, col0: 0 })
  assert.equal(r.values[0][0], '', 'la celda que vaciaste queda vacía')
  assert.equal(r.values[0][1], 'lo que sigue')
  assert.equal(r.repuestas.length, 1)
})

test('(a2) una celda VACÍA SIN marca sí se escribe: la guarda no congela una pestaña nueva', () => {
  const r = sinReponerVaciadas([['', '']], [['Rótulo nuevo', 'otro']], new Set(['9:9']), { fila0: 1, col0: 0 })
  assert.deepEqual(r.values, [['Rótulo nuevo', 'otro']])
  assert.deepEqual(r.repuestas, [])
})

test('(a3) una celda marcada que HOY tiene algo no se toca: la marca ya no corre', () => {
  // Salida legítima de la marca: el dueño (o el OS) volvió a poner contenido ahí.
  const r = sinReponerVaciadas([['algo']], [['TOTAL']], new Set(['1:0']), { fila0: 1, col0: 0 })
  assert.equal(r.values[0][0], 'TOTAL')
  assert.deepEqual(r.repuestas, [])
})

test('(a4) el origen del rango ubica la marca: "Proveedores!C17" arranca en fila 17, columna 2', () => {
  assert.deepEqual(origenDeRango("'Proveedores'!C17"), { fila0: 17, col0: 2 })
  assert.deepEqual(origenDeRango('CAJA!$A$1'), { fila0: 1, col0: 0 })
  assert.deepEqual(origenDeRango('CAJA!AA5:AB9'), { fila0: 5, col0: 26 })
  assert.deepEqual(origenDeRango('sin rango'), { fila0: 1, col0: 0 }, 'sin ancla, el origen es A1')
})

/** Un cliente mínimo: sólo relee el destino, que es lo único que la guarda le pide. */
const cliente = (destino) => ({ async readSheetValues() { return destino } })

test('(b) el gancho corre sobre la MISMA relectura que hace la guarda de borrado', async () => {
  const visto = []
  const r = await protegerBorrado(cliente([['', 'queda']]), 'ID', [{ range: 'Proveedores!A17', values: [['REVIVO', 'queda']] }], {
    antesDePreservar: async (range, actual, values) => {
      visto.push({ range, actual })
      return values.map((f) => ['', ...f.slice(1)])
    },
  })
  assert.equal(visto.length, 1, 'se llama una vez por rango, no una lectura de más')
  assert.deepEqual(visto[0].actual, [['', 'queda']], 'recibe el destino RELEÍDO, no lo que dice el llamador')
  assert.equal(r.data[0].values[0][0], '', 'la celda que el dueño vació sale vacía hacia la API')
  assert.equal(r.data[0].values[0][1], 'queda')
})

test('(c) sin el gancho, la celda vaciada se repone — es el defecto, y así se ve', async () => {
  const r = await protegerBorrado(cliente([['', 'queda']]), 'ID', [{ range: 'Proveedores!A17', values: [['REVIVO', 'queda']] }])
  assert.equal(r.data[0].values[0][0], 'REVIVO', 'sin la guarda inversa, el borrado del dueño vuelve')
})

test('(d) la guarda de borrado sigue intacta: un vacío sobre contenido se conserva igual', async () => {
  const r = await protegerBorrado(cliente([['lo del dueño']]), 'ID', [{ range: 'Proveedores!A17', values: [['']] }], {
    antesDePreservar: async (_range, _actual, values) => values,
  })
  assert.equal(r.data[0].values[0][0], 'lo del dueño', 'no-borrar no se debilita por el gancho nuevo')
  assert.equal(r.preservadas, 1)
})

test('(e) el aviso nombra la celda en A1 y con lo que se iba a escribir', () => {
  const msg = avisoNoRepuestas('Proveedores', [{ fila: 17, col: 2, mio: 'TOTAL FACTURADO' }])
  assert.match(msg, /🚫/)
  assert.match(msg, /Proveedores/)
  assert.match(msg, /C17="TOTAL FACTURADO"/)
})

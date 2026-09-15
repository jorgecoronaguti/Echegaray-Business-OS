// LAS LETRAS DE _ARCA_RAW SALEN DEL ORDEN DE SUS RÓTULOS, DECLARADO UNA SOLA VEZ (14/09/2026).
//
// Era un mapa de letras tipeado al lado de `COLUMNAS`. Si alguien agrega o reordena una columna de la
// réplica y no toca el mapa, la verificación de lo escrito y todo lo que cite `COL` leen la de al lado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { CLAVES, COL, COLUMNAS } from './arca-raw-pestana.mjs'

test('COL es la posición de cada rótulo de COLUMNAS, con las letras que la pestaña ya tenía', () => {
  assert.deepEqual({ ...COL }, {
    periodo: 'A', libro: 'B', fecha: 'C', tipo: 'D', codigo: 'E', signo: 'F',
    puntoVenta: 'G', numero: 'H', cuit: 'I', nombre: 'J', neto: 'K', iva: 'L', total: 'M',
  })
  assert.equal(CLAVES.length, COLUMNAS.length)
  const rotuloDe = (k) => COLUMNAS[CLAVES.indexOf(k)][0]
  assert.deepEqual(['periodo', 'signo', 'cuit', 'total'].map(rotuloDe), ['Período', 'Signo', 'CUIT', 'Total'])
})

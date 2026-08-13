// QUÉ CUENTA COMO TIPO DE CAMBIO — y qué no, que es lo que importa.
//
// Los tres consumidores (la pestaña OBRAS, el extractor de Cobranzas del Libro y el auditor de
// conectividad) valúan la misma plata. Si uno aceptara lo que otro descarta, la misma venta saldría
// distinta en dos cuadros del mismo archivo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { tipoCambioDeCelda, leerTipoCambio, RANGO_TC } from './tipo-cambio.mjs'

test('un número positivo es el tipo de cambio; el resto es DESCONOCIDO, no cero ni uno', () => {
  assert.equal(tipoCambioDeCelda([[1492.524]]), 1492.524)
  // Lo que devuelve el archivo cuando GOOGLEFINANCE no responde y no hay declarado: `IFERROR(...;"")`.
  // `Number('')` es 0 y multiplicar por cero BORRA la venta del cuadro sin un solo error.
  for (const crudo of [[['']], [[0]], [[-1]], [[null]], [[]], [], null, undefined]) {
    assert.equal(tipoCambioDeCelda(crudo), null, JSON.stringify(crudo))
  }
})

test('un tipo de cambio escrito como TEXTO no se parsea a medias: es desconocido', () => {
  // Se lee con UNFORMATTED_VALUE, así que un sano llega como número. Un "1.492,524" en es-AR daría
  // NaN y un "1.492" daría 1,492 — mil veces corto, con cara de número sano. Falla cerrado.
  assert.equal(tipoCambioDeCelda([['1.492,524']]), null)
  assert.equal(tipoCambioDeCelda([['1492.524']]), null)
})

test('leerTipoCambio pide el rango con nombre y NO tira cuando no existe', () => {
  // El que aborta es el consumidor: la pestaña OBRAS no puede publicar sin TC, pero el Libro sí puede
  // seguir si ninguna fila está en dólares. Tirar acá le sacaría esa decisión.
  const pedidos = []
  const google = { readSheetValues: async (id, rango, op) => { pedidos.push([id, rango, op]); return [[1492.524]] } }
  return leerTipoCambio(google, 'ARCHIVO').then(async ({ tc }) => {
    assert.equal(tc, 1492.524)
    assert.deepEqual(pedidos, [['ARCHIVO', RANGO_TC, { render: 'UNFORMATTED_VALUE' }]])
    const roto = { readSheetValues: async () => { throw new Error('Unable to parse range') } }
    assert.deepEqual(await leerTipoCambio(roto, 'ARCHIVO'), { tc: null, crudo: null })
  })
})

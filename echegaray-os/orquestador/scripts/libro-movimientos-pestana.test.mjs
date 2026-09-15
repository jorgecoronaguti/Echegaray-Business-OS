// EL LIBRO LEE COMPRAS Y COBRANZAS SIN CORTAR EN UNA LETRA DEL LAYOUT DE HOY (14/09/2026).
//
// Leía `Compras!A1:AN` y `Cobranzas!A1:BB`. Con «Obra» insertada (Compras L, Cobranzas H) la última
// columna de Compras pasa a AO y «Valor banco» de BB a BC: quedaban afuera, y sin «Valor banco» el
// libro vuelve a esperar como cobro un valor que ya se endosó. Los extractores ubican por rótulo
// dentro de lo leído; lo que tiene que garantizar el script es que la columna esté en la lectura.
import test from 'node:test'
import assert from 'node:assert/strict'
import { RANGOS_FUENTES } from './libro-movimientos-pestana.mjs'
import { COMPRAS_CON_OBRA } from '../lib/encabezados-referencia.mjs'

const indiceDe = (l) => [...l].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
const ultimaColumna = (rango) => indiceDe(/:([A-Z]+)\d*$/.exec(rango)[1])

test('con «Obra» insertada, la lectura del libro sigue alcanzando la última columna de Compras y «Valor banco»', () => {
  assert.match(RANGOS_FUENTES.compras, /^Compras!A1:/)
  assert.match(RANGOS_FUENTES.cobranzas, /^Cobranzas!A1:/)
  assert.ok(ultimaColumna(RANGOS_FUENTES.compras) >= COMPRAS_CON_OBRA.length - 1, RANGOS_FUENTES.compras)
  // «Valor banco»: Cobranzas BB (índice 53) antes de insertar, BC (54) después.
  assert.ok(ultimaColumna(RANGOS_FUENTES.cobranzas) >= 54, RANGOS_FUENTES.cobranzas)
})

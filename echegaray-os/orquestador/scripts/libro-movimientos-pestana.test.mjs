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

test('EFECTIVO A RENDIR: consolidar espeja cada gasto «A rendir» en la línea de fondos (auditoría 22/09/2026)', async () => {
  // Sin el espejo, el gasto rendido sale del Cash Flow DOS veces: con la entrega y con el ticket.
  const { consolidar } = await import('./libro-movimientos-pestana.mjs')
  const { movimiento } = await import('../lib/libro-movimientos.mjs')
  const { RUBRO_FONDOS_A_RENDIR } = await import('../lib/cash-flow-rubros.mjs')
  const gasto = movimiento({ fecha: 46286, importe: 96400, signo: -1, estado: 'REAL', rubro: 'Materiales', instrumento: 'a_rendir',
    concepto: 'Corralón El Nogal', origen: { pestana: 'Compras', fila: 994 } })
  const { consolidado } = consolidar({ compras: [gasto] }, { debitosBanco: [], corteBanco: null, usadosBanco: new Set() })
  const espejo = consolidado.filter((m) => m.rubro === RUBRO_FONDOS_A_RENDIR)
  assert.equal(espejo.length, 1, 'el gasto «A rendir» tiene su espejo en la línea de fondos')
  assert.equal(espejo[0].signo, 1)
  assert.equal(espejo[0].importe, 96400)
  assert.equal(consolidado.reduce((a, m) => a + m.signo * m.importe, 0), 0, 'el día del ticket la caja no se mueve')
})

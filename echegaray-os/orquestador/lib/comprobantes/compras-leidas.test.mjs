// EL CARGADOR DEL CHAT LEE COMPRAS POR RÓTULO — hoy y con «Obra» insertada en L.
//
// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// `compras-vivas`, `auditoria` y `listas` leían `Compras!B4:O` y los desplegables E/J/I/B/P por letra.
// Con «Obra» en L, B4:O corta en el IVA: `r[13]` pasa a ser el IVA, el duplicado deja de encontrar la
// factura por total (el bot la carga dos veces) y el auditor declara que ninguna fila cierra. La P pasa
// a ser la fecha prevista y la lista de tipos de pago vuelve vacía. Cada test corre la MISMA fila contra
// los dos encabezados: si alguien vuelve a leer por posición, el del layout con «Obra» se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from '../encabezados-referencia.mjs'
import { comprasDelCargador } from './compras-leidas.mjs'
import { hojaDesdeBaO } from './compras-leidas.fixture.mjs'
import { EN } from './auditoria.mjs'
import { indiceDeCompras } from './compras-vivas.mjs'
import { rangosDeListas, listasDeCompras } from './listas.mjs'
import { auditar } from '../../scripts/auditar-comprobantes-cargados.mjs'
import { DEFECTO } from './auditoria.mjs'

const SANA = {
  categoria: 'B', fecha: '13/08/2026', proveedor: 'DUPEC', modalidad: 'Pago', tipo: 'F A',
  numero: '0004-00036542', unidad: 'Construcción', obra: 'MESSINA', detalle: 'Hormigón',
  concepto: 'Hormigón H21', importe: 100, iva: 21, total: 121,
}

function fila(o) {
  const r = new Array(14).fill('')
  for (const [k, i] of Object.entries(EN)) if (o[k] != null) r[i] = o[k]
  return r
}

const LAYOUTS = [['hoy (25/08)', COMPRAS_2508], ['con «Obra» en L', COMPRAS_CON_OBRA]]

const googleCon = (hoja) => ({ readSheetValues: async () => hoja })

for (const [nombre, enc] of LAYOUTS) {
  test(`comprasDelCargador devuelve la misma fila B..O — ${nombre}`, () => {
    const { filas, letras } = comprasDelCargador(hojaDesdeBaO([fila(SANA)], enc, { obraFila: () => 'OB-0012 · MESSINA' }))
    assert.deepEqual(filas[0].slice(0, 14), fila(SANA))
    assert.equal(letras.total, enc === COMPRAS_2508 ? 'O' : 'P')
    assert.equal(filas[0][14], enc === COMPRAS_2508 ? undefined : 'OB-0012 · MESSINA', 'la columna nueva viaja al final')
  })

  test(`el duplicado se indexa por el TOTAL, no por el IVA — ${nombre}`, async () => {
    const indice = await indiceDeCompras(googleCon(hojaDesdeBaO([fila(SANA)], enc)), { fileId: 'x' })
    assert.equal(indice.ok, true)
    const [reg] = indice.porNumero.get('0004-00036542') ?? []
    assert.equal(reg?.total, 121)
    assert.equal(reg?.concepto, 'Hormigón H21')
    assert.equal(reg?.fila, 4)
  })

  test(`el auditor no inventa aritmética rota y nombra la letra VIVA — ${nombre}`, async () => {
    const hoja = hojaDesdeBaO([fila(SANA), fila({ ...SANA, numero: '0004-00036543', importe: 90 })], enc)
    const port = { query: async () => ({ rows: [] }) }
    const r = await auditar({ google: googleCon(hoja), port, todas: true })
    const arit = r.hallazgos.filter((h) => h.defecto === DEFECTO.ARITMETICA)
    assert.deepEqual(arit.map((h) => h.fila), [5], 'sólo la fila con Importe 90 no cierra')
    assert.equal(arit[0].columna, enc === COMPRAS_2508 ? 'M' : 'N', '«revisá la M» después de la inserción es Concepto')
  })

  test(`los desplegables se piden en su columna real — ${nombre}`, async () => {
    const esperado = enc === COMPRAS_2508
      ? ['Compras!E4:E12', 'Compras!J4:J12', 'Compras!I4:I12', 'Compras!B4:B12', 'Compras!P4:P12']
      : ['Compras!E4:E12', 'Compras!J4:J12', 'Compras!I4:I12', 'Compras!B4:B12', 'Compras!Q4:Q12']
    assert.deepEqual(rangosDeListas(enc), esperado)
    let pedidos = null
    const google = {
      readSheetValues: async () => [[...enc]],
      readSheetValidations: async (_id, rangos) => { pedidos = rangos; return [] },
    }
    assert.equal((await listasDeCompras(google, { fileId: 'x' })).ok, true)
    assert.deepEqual(pedidos, esperado)
  })
}

test('un rótulo que falta rompe con su nombre: no hay letra de respaldo', () => {
  const sinTotal = COMPRAS_CON_OBRA.map((r) => (r === 'Total' ? 'Totales' : r))
  assert.throws(() => comprasDelCargador([sinTotal]), /«Total»/)
})

test('sin fila de rótulos legible las listas dicen «no sé», no «no está»', async () => {
  const google = { readSheetValues: async () => [['ID']], readSheetValidations: async () => [] }
  const r = await listasDeCompras(google, { fileId: 'x' })
  assert.equal(r.ok, false)
  assert.match(r.error, /Proveedor/)
})

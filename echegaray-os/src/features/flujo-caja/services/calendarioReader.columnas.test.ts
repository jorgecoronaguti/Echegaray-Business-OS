import { test } from 'node:test'
import assert from 'node:assert/strict'
import { movimientosDeCobranzas, movimientosDeCompras } from './calendarioReader.ts'
import {
  COBRANZAS_1409, COBRANZAS_CON_OBRA, COMPRAS_2508, COMPRAS_CON_OBRA,
} from '../../../../orquestador/lib/encabezados-referencia.mjs'

// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// El calendario leía `Compras!A5:Y940` y `Cobranzas!A5:Q200` y después `r[14]`, `r[23]`: posiciones.
// Con «Obra» insertada (Compras L, Cobranzas H) el Total de Compras pasa a ser el IVA y el TOTAL a
// cobrar de Cobranzas pasa a ser «Retenciones / descuentos»: el calendario sigue publicando días con
// plata, de la columna de al lado. La misma fila, armada por rótulo, corre contra los dos encabezados:
// si alguien vuelve a leer por posición, el del layout con «Obra» se pone rojo.

type Celda = string | number | boolean | null
const hoja = (encabezado: readonly (string | null)[], filas: Record<string, Celda>[]): Celda[][] => [
  [...encabezado],
  ...filas.map((o) => encabezado.map((r) => (r != null && r in o ? o[r] : ''))),
]

const PAGO = {
  Proveedor: 'DUPEC', 'Unidad de Negocio': 'Civil', Concepto: 'Hormigón', IVA: 21, Total: 121,
  'Tipo pago': 'Transferencia', 'Fecha prevista de pago (día)': 46300, Estado: 'Pendiente', Obra: 'OB-0012 · MESSINA',
}
const COBRO = {
  Unidad: 'Civil', 'Obra / Cliente': 'MESSINA', 'Retenciones / descuentos': 5, 'TOTAL a cobrar (neto de retenciones)': 1000,
  Estado: 'Facturado', 'Fecha cobro': 46301, Obra: 'OB-0012 · MESSINA',
}

for (const [nombre, compras, cobranzas] of [
  ['hoy', COMPRAS_2508, COBRANZAS_1409],
  ['con «Obra» insertada', COMPRAS_CON_OBRA, COBRANZAS_CON_OBRA],
] as const) {
  test(`pagos por rótulo — ${nombre}`, () => {
    assert.deepEqual(movimientosDeCompras(hoja(compras, [PAGO])), [
      { fecha: '2026-10-05', tipo: 'pago', quien: 'DUPEC', detalle: 'Civil · Hormigón', monto: -121 },
    ])
  })

  test(`cobros por rótulo — ${nombre}`, () => {
    assert.deepEqual(movimientosDeCobranzas(hoja(cobranzas, [COBRO])), [
      { fecha: '2026-10-06', tipo: 'cobro', quien: 'MESSINA', detalle: 'Civil · Facturado', monto: 1000 },
    ])
  })
}

test('un rótulo que falta rompe con su nombre: no publica montos de otra columna', () => {
  const sinTotal = COMPRAS_CON_OBRA.map((r) => (r === 'Total' ? 'Totales' : r))
  assert.throws(() => movimientosDeCompras(hoja(sinTotal, [PAGO])), /«Total»/)
})

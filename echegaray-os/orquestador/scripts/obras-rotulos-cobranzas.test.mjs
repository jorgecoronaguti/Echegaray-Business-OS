// LOS RÓTULOS DE COBRANZAS CAMBIARON Y NO PUEDEN MOVER UNA COLUMNA (04/09/2026)
//
// El 04/09 los encabezados del archivo se renombraron —C de "Fecha de emisión" a "Fecha de Venta",
// P de "Fecha de Venta" a "Fecha de Factura"— y OBRAS y Calendario de Cobros dejaron de generarse.
// El arreglo actualiza los rótulos, y este test existe para probar lo único que importa: que las
// COLUMNAS resueltas sigan siendo exactamente las de antes. Un rótulo se cambia sin consecuencia;
// una columna que se corre cambia la antigüedad de la cartera, los vencidos y el año de la venta.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverColumnas, ROTULOS_COBRANZAS } from './obras-pestana.mjs'

/** La fila 4 REAL del archivo, leída el 04/09/2026 después del renombre. */
const ENCABEZADO_HOY = [
  'ID', 'Categoría', 'Fecha de Venta', 'Factura', 'N° Comprobante', 'Unidad', 'Obra / Cliente',
  'ORDEN DE  COMPRA', 'Concepto', 'Monto neto', 'IVA', 'Retenciones / descuentos',
  'TOTAL a cobrar (neto de retenciones)', 'Forma de Cobro', 'Estado', 'Fecha de Factura',
  'Fecha cobro', 'Mes cobro (auto)', 'Probabilidad %',
]

const conMoneda = (fila) => { const f = fila.slice(); f[26] = 'Moneda'; return f }

test('con los rótulos de HOY, la fecha del reloj de vencidos sigue siendo la columna C', () => {
  const cols = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_HOY)], ROTULOS_COBRANZAS, 3)
  assert.equal(cols.fechaEmision, 'C')
})

test('con los rótulos de HOY, la fecha de venta sigue siendo la columna P y NO salta a C', () => {
  const cols = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_HOY)], ROTULOS_COBRANZAS, 3)
  assert.equal(cols.fechaVenta, 'P')
})

// LA PRUEBA DE QUE EL ARREGLO NO MOVIÓ NADA. No se compara contra el encabezado viejo —ése ya no
// existe en el archivo— sino contra el mapeo que el repo declara desde antes del renombre en
// `obras-grilla.mjs`. Si un rótulo nuevo corriera una columna, este test lo caza.
test('todas las columnas resueltas coinciden con el mapeo declarado en obras-grilla', () => {
  const cols = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_HOY)], ROTULOS_COBRANZAS, 3)
  const declarado = { cliente: 'G', concepto: 'I', neto: 'J', total: 'M', retenciones: 'L', estado: 'O', fechaCobro: 'Q', fechaVenta: 'P', fechaEmision: 'C', forma: 'N', categoria: 'B', oc: 'H', moneda: 'AA' }
  for (const [campo, letra] of Object.entries(declarado)) {
    assert.equal(cols[campo], letra, `${campo} se movió de ${letra} a ${cols[campo]}`)
  }
})

test('sin ninguna de las dos fechas, el escritor ROMPE en vez de publicar una alarma en cero', () => {
  const sinFecha = conMoneda(ENCABEZADO_HOY).map((r) => (/^Fecha de (Venta|Factura)$/.test(r) ? 'Otra cosa' : r))
  assert.throws(() => resolverColumnas([[], [], [], sinFecha], ROTULOS_COBRANZAS, 3), /no está en la fila de encabezado/)
})

/** La fila 4 como estaba ANTES del renombre del 04/09. */
const ENCABEZADO_ANTES = ENCABEZADO_HOY.map((r) => (
  r === 'Fecha de Venta' ? 'Fecha de emisión' : r === 'Fecha de Factura' ? 'Fecha de Venta' : r))

// AHORA SÍ SE PUEDE EXIGIR: con la columna reservada, los dos encabezados resuelven el mismo mapeo.
// La primera versión de este arreglo no podía, y por eso rompió seis tests de Cobranzas que la
// suite completa atrapó — el test dirigido del archivo tocado no alcanzaba para verlo.
test('el encabezado ANTERIOR resuelve exactamente las mismas columnas que el de hoy', () => {
  const hoy = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_HOY)], ROTULOS_COBRANZAS, 3)
  const antes = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_ANTES)], ROTULOS_COBRANZAS, 3)
  assert.deepEqual(hoy, antes)
  assert.equal(hoy.fechaEmision, 'C')
  assert.equal(hoy.fechaVenta, 'P')
})

test('ningún campo comparte columna con otro: una celda es de un solo campo', () => {
  const cols = resolverColumnas([[], [], [], conMoneda(ENCABEZADO_HOY)], ROTULOS_COBRANZAS, 3)
  const letras = Object.entries(cols).filter(([k]) => k !== 'desde').map(([, v]) => v)
  assert.equal(new Set(letras).size, letras.length, 'hay una columna asignada dos veces')
})

// El plan de escritura de la columna «Obra» de Cobranzas (H) contra el encabezado REAL de la pestaña.
// Lo que se prueba sobre todo es cuándo NO escribe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { huellaDeCobranza, planificarObraCobranza } from './bisturi-cobranzas-obra.mjs'
import { COBRANZAS_1409, COBRANZAS_CON_OBRA } from './encabezados-referencia.mjs'

function filaDe(encabezado, valores) {
  const f = new Array(encabezado.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[encabezado.indexOf(rotulo)] = v
  return f
}
const COBRO = { ID: 10, 'N° Comprobante': '01-00000204', 'Obra / Cliente': 'ARCOR', 'TOTAL a cobrar (neto de retenciones)': 1066808.4 }
const OBRA = 'OB-0001 · AR - MANTENIMIENTO'
const CAMBIO = {
  id: 'k-1', pestana: 'Cobranzas', fila: 14, sheet_id: 10, valor_anterior: null, valor_nuevo: OBRA, pedido_por: 'u-1',
  clave: huellaDeCobranza({ comprobante: '01-00000204', cliente: 'ARCOR', total: 1066808 }),
}
const OBRAS = [
  { id: 'arcor', codigo: 'OB-0001', nombre: 'AR - MANTENIMIENTO', cliente_texto: 'ARCOR', fusionada_en: null },
  { id: 'sf1', codigo: 'OB-0011', nombre: 'SF - PISOS INDUSTRIALES', cliente_texto: 'San Francisco', fusionada_en: null },
  { id: 'sf2', codigo: 'OB-0010', nombre: 'SF - ENTREPISO Y ESCALERA', cliente_texto: 'San Francisco', fusionada_en: null },
]
const conObra = (obra, extra = {}) => filaDe(COBRANZAS_CON_OBRA, { ...COBRO, ...extra, Obra: obra })
const plan = (over = {}) => planificarObraCobranza({ cambio: CAMBIO, encabezado: COBRANZAS_CON_OBRA, fila: conObra(''), obras: OBRAS, ...over })

test('la huella tiene la MISMA forma que la arma cobranza_obra_asignar en SQL: comprobante|cliente|total redondeado', () => {
  assert.equal(huellaDeCobranza({ comprobante: ' 01-00000204 ', cliente: 'ARCOR', total: 1066808.4 }), '01-00000204|ARCOR|1066808')
  assert.equal(huellaDeCobranza({ comprobante: null, cliente: 'MESSINA', total: '2741732' }), '|MESSINA|2741732')
  assert.equal(huellaDeCobranza({ comprobante: '', cliente: 'ADDATO', total: null }), '|ADDATO|', 'sin total el tramo va vacío, no «0»')
})

test('escribe H de ESA fila, por rótulo: con «Obra» insertada tras «Obra / Cliente» es la H', () => {
  const p = plan()
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Cobranzas!H14')
  assert.equal(p.valor, OBRA)
})

test('sin N° de comprobante la huella sigue valiendo: cliente y total identifican la fila', () => {
  const cambio = { ...CAMBIO, clave: huellaDeCobranza({ comprobante: '', cliente: 'ARCOR', total: 1066808 }) }
  assert.equal(plan({ cambio, fila: conObra('', { 'N° Comprobante': '' }) }).accion, 'escribir')
  // …pero si la fila tiene comprobante y la huella no, es otra cobranza.
  assert.equal(plan({ cambio }).motivo, 'huella_distinta')
})

test('la fila se corrió (otro ID, otro cliente u otro total): se RECHAZA sin escribir', () => {
  assert.equal(plan({ fila: conObra('', { ID: 11 }) }).motivo, 'huella_distinta')
  assert.equal(plan({ fila: conObra('', { 'Obra / Cliente': 'MESSINA' }) }).motivo, 'huella_distinta')
  assert.equal(plan({ fila: conObra('', { 'TOTAL a cobrar (neto de retenciones)': 999 }) }).motivo, 'huella_distinta')
  // Un peso de diferencia por el redondeo de la fórmula del total no es otra fila.
  assert.equal(plan({ fila: conObra('', { 'TOTAL a cobrar (neto de retenciones)': 1066808.9 }) }).accion, 'escribir')
  assert.equal(plan({ cambio: { ...CAMBIO, clave: null } }).motivo, 'sin_huella')
})

test('la celda ya tiene valor y no es el esperado: no se pisa; si ya dice lo pedido, ya_aplicado', () => {
  const p = plan({ fila: conObra('Sin obra – SAN FRANCISCO') })
  assert.equal(p.accion, 'rechazar'); assert.equal(p.motivo, 'celda_cambio')
  const q = plan({ fila: conObra(OBRA) })
  assert.equal(q.accion, 'ya_aplicado'); assert.equal(q.actual, OBRA)
})

test('sin columna «Obra» en Cobranzas difiere; sin catálogo difiere; valor que no es opción rechaza', () => {
  assert.equal(plan({ encabezado: COBRANZAS_1409, fila: filaDe(COBRANZAS_1409, COBRO) }).motivo, 'sin_columna_obra')
  assert.equal(plan({ obras: [] }).motivo, 'sin_catalogo')
  assert.equal(plan({ cambio: { ...CAMBIO, valor_nuevo: 'OB-0001 · X' } }).motivo, 'valor_invalido')
  assert.equal(plan({ cambio: { ...CAMBIO, fila: 4 } }).motivo, 'fila_invalida')
})

test('«Sin obra – SAN FRANCISCO» (canónico, el del desplegable) vale con el mapa de clientes y no sin él', () => {
  const cambio = { ...CAMBIO, valor_nuevo: 'Sin obra – SAN FRANCISCO' }
  assert.equal(plan({ cambio }).motivo, 'valor_invalido')
  const clienteAlias = new Map([['san francisco', 'SAN FRANCISCO']])
  assert.equal(plan({ cambio, clienteAlias }).accion, 'escribir')
})

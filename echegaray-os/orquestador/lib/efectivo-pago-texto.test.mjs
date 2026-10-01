import test from 'node:test'
import assert from 'node:assert/strict'
import { armarPadron, interpretarPago, pareceUnPago, itemDePago, textoDePregunta, formaDePago } from './efectivo-pago-texto.mjs'

const padron = armarPadron([
  { id: 'rodrigo', nombre_completo: 'SOSA RODRIGO', nombre_para_mostrar: 'Rodrigo Sosa', apodos: [] },
  { id: 'emi-m', nombre_completo: 'MALDONADO EMILIANO', nombre_para_mostrar: 'Emiliano Maldonado', apodos: [] },
  { id: 'emi-g', nombre_completo: 'GONZALEZ EMILIANO', nombre_para_mostrar: 'Emiliano Gonzalez', apodos: [] },
])
const proveedores = [
  { id: 'p-nasser', nombre: 'Nasser Hermanos', razon_social: null, subcontratista: true },
  { id: 'p-hormi', nombre: 'Hormiserv SA', razon_social: null, subcontratista: false },
  { id: 'p-corralon', nombre: 'Corralon Progreso', razon_social: null, subcontratista: false },
]
const obras = [
  { id: 'o-quatt', nombre: 'Quattropani', alias: [] },
  { id: 'o-mess', nombre: 'Messina', alias: [] },
]
const subcontratos = [
  { id: 's1', obra_id: 'o-quatt', obra_nombre: 'Quattropani', proveedor_id: 'p-nasser', proveedor_texto: 'Nasser Hermanos', nombre: 'Albañilería', alcance: null, precio_contratado: 9000000 },
]
const rodados = [{ id: 'r1', codigo: 'RO-003', nombre: 'Ford F100', patente: null }]
const ctx = { hoy: '2026-09-30', padron, proveedores, obras, subcontratos, rodados }

test('los tres mensajes que fallaron el 30/09 se entienden', () => {
  const a = interpretarPago('hoy le pague 100 a rodrigo', ctx)
  assert.equal(a.estado, 'listo'); assert.equal(a.tipo, 'sueldo')
  assert.equal(a.persona.id, 'rodrigo'); assert.equal(a.importe, 100); assert.equal(a.fecha, '2026-09-30')

  const b = interpretarPago('hoy le pague 150000 de adelanto a emiliano maldonado', ctx)
  assert.equal(b.estado, 'listo'); assert.equal(b.tipo, 'sueldo')
  assert.equal(b.persona.id, 'emi-m'); assert.equal(b.importe, 150000)

  const c = interpretarPago('se pagaron 220000 en efectivo de arreglo de fordf100', ctx)
  assert.equal(c.estado, 'listo'); assert.equal(c.tipo, 'gasto')
  assert.equal(c.importe, 220000); assert.equal(c.forma, 'Efectivo')
  assert.equal(c.rodado?.codigo, 'RO-003'); assert.equal(c.tipoCosto, 'Indirecto')
})

test('lo de siempre no cambia: una entrega («150 a Jorge», «le di 20000 a X») no es un pago', () => {
  for (const t of ['150 a Jorge', '20000 a emiliano maldonado', 'le di 150 a Jorge', 'le di 20 mil a Pastrán']) {
    assert.equal(pareceUnPago(t), false, t)
    assert.equal(interpretarPago(t, ctx).estado, 'nada', t)
  }
})

test('ambigüedad de nombre: lista, como la entrega', () => {
  const r = interpretarPago('le pague 5000 a emiliano', ctx)
  assert.equal(r.estado, 'pregunta'); assert.equal(r.falta, 'persona_ambigua'); assert.equal(r.candidatos.length, 2)
  assert.match(textoDePregunta(r), /1 · /)
})

test('sin monto dice qué entendió y qué falta', () => {
  const r = interpretarPago('le pague a rodrigo', ctx)
  assert.equal(r.estado, 'pregunta'); assert.equal(r.falta, 'monto')
  assert.match(textoDePregunta(r), /importe/)
})

test('fechas: ayer, el 24/09, sin fecha', () => {
  assert.equal(interpretarPago('ayer pague 1000 a rodrigo', ctx).fecha, '2026-09-29')
  assert.equal(interpretarPago('el 24/09 pague 1000 a rodrigo', ctx).fecha, '2026-09-24')
  assert.equal(interpretarPago('pague 1000 a rodrigo', ctx).fecha, '2026-09-30')
})

test('gasto sin ticket: proveedor y obra si se nombran, nunca A rendir', () => {
  const r = interpretarPago('compré 3 bolsas de cemento por 40000 en Corralon Progreso para Messina', ctx)
  assert.equal(r.tipo, 'gasto'); assert.equal(r.importe, 40000)
  assert.equal(r.proveedor.id, 'p-corralon'); assert.equal(r.obra.id, 'o-mess')
  const it = itemDePago(r)
  assert.equal(it.comprobante.formaPago, 'Efectivo'); assert.equal(it.comprobante.pagado, 40000)
  assert.equal(it.comprobante.proveedor, 'Corralon Progreso')
  assert.doesNotMatch(JSON.stringify(it), /rendir/i)
  const g = interpretarPago('pagué 50000 de gasoil', ctx)
  assert.equal(g.tipo, 'gasto'); assert.equal(g.proveedor, null); assert.equal(g.tipoCosto, 'Indirecto')
})

test('subcontratista: obra deducida del único subcontrato activo', () => {
  const r = interpretarPago('le pagué 500000 a Nasser por Quattropani', ctx)
  assert.equal(r.estado, 'listo'); assert.equal(r.tipo, 'subcontrato')
  assert.equal(r.proveedor.id, 'p-nasser'); assert.equal(r.obra.id, 'o-quatt'); assert.equal(r.tipoCosto, 'Directo')
  assert.equal(r.forma, 'Efectivo')
  const sinObra = interpretarPago('le pagué 500000 a Nasser', ctx)
  assert.equal(sinObra.tipo, 'subcontrato'); assert.equal(sinObra.obra.id, 'o-quatt')
})

test('subcontratista con varios subcontratos pregunta listando; transferencia se respeta', () => {
  const dos = [...subcontratos, { ...subcontratos[0], id: 's2', obra_id: 'o-mess', obra_nombre: 'Messina', nombre: 'Revoques' }]
  const r = interpretarPago('pagué 1.200.000 a Nasser en efectivo', { ...ctx, subcontratos: dos })
  assert.equal(r.estado, 'pregunta'); assert.equal(r.falta, 'subcontrato_varios'); assert.equal(r.candidatos.length, 2)
  assert.match(textoDePregunta(r), /Messina/)
  assert.equal(formaDePago('transferí 300000 a Nasser'), 'Transferencia')
  assert.equal(interpretarPago('transferí 300000 a Nasser por Messina', { ...ctx, subcontratos: dos }).forma, 'Transferencia')
})

test('transferencia a una persona del plantel no se carga: se dice', () => {
  assert.equal(interpretarPago('le transferí 100 a rodrigo', ctx).estado, 'fuera')
})

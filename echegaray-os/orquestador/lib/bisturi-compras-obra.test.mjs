// El plan de escritura de la columna «Obra» contra los encabezados REALES de Compras, antes y después
// de la inserción. Lo que se prueba sobre todo es cuándo NO escribe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { planificarObra, relecturaConfirma } from './bisturi-compras-obra.mjs'
import { COMPRAS_2508, COMPRAS_CON_OBRA } from './encabezados-referencia.mjs'
import { claveDeCompra } from './compras-fila.mjs'

/** Una fila por rótulo: el test no sabe letras, igual que el código. */
function filaDe(encabezado, valores) {
  const f = new Array(encabezado.length).fill('')
  for (const [rotulo, v] of Object.entries(valores)) f[encabezado.indexOf(rotulo)] = v
  return f
}

const COMPRA = {
  ID: 53, Proveedor: 'CORRALÓN EL NORTE', Tipo: 'F A', 'N° Comprobante': '0003-00012345',
  'CUIT (OS)': '30712345678', Total: 121000, Importe: 100000, IVA: 21000,
}
const CLAVE = claveDeCompra({ cuit: '30712345678', tipo: 'F A', comprobante: '0003-00012345', proveedor: 'CORRALÓN EL NORTE' })
const CAMBIO = {
  id: 'k-1', fila: 57, clave: CLAVE, sheet_id: 53, valor_anterior: null,
  valor_nuevo: 'OB-0021 · ME - PLAYÓN DE AZUFRE', pedido_por: 'u-1', intentos: 1,
}
const conObra = (obra) => filaDe(COMPRAS_CON_OBRA, { ...COMPRA, Obra: obra })

test('la clave de la fixture existe: sin ella los rechazos por huella serían triviales', () => {
  assert.ok(CLAVE, 'claveDeCompra tiene que dar una clave para una factura con número')
})

test('encuentra la columna por su rótulo: tras la inserción escribe L de ESA fila y nada más', () => {
  const p = planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Compras!L57')
  assert.equal(p.valor, 'OB-0021 · ME - PLAYÓN DE AZUFRE')
})

test('la letra sale del rótulo, no de una constante: con «Obra» en otro lugar escribe ahí', () => {
  const movido = [...COMPRAS_2508, 'Obra']              // al final: AO, como en el diseño viejo
  const p = planificarObra({ cambio: CAMBIO, encabezado: movido, fila: filaDe(movido, COMPRA) })
  assert.equal(p.accion, 'escribir')
  assert.equal(p.celda, 'Compras!AO57')
})

test('sin la columna «Obra» NO escribe: difiere con motivo y deja la fila pendiente', () => {
  const p = planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_2508, fila: filaDe(COMPRAS_2508, COMPRA) })
  assert.equal(p.accion, 'diferir')
  assert.equal(p.motivo, 'sin_columna_obra')
  assert.equal(p.celda, undefined)
})

test('con «Obra» repetida aborta: difiere sin elegir una a ciegas', () => {
  const doble = [...COMPRAS_CON_OBRA, 'Obra']
  const p = planificarObra({ cambio: CAMBIO, encabezado: doble, fila: filaDe(COMPRAS_CON_OBRA, COMPRA) })
  assert.equal(p.accion, 'diferir')
  assert.equal(p.motivo, 'layout_ambiguo')
  assert.match(p.detalle, /«Obra» aparece 2 veces/)
})

test('si la fila ya es otra compra (alguien insertó arriba), rechaza aunque el ID coincida', () => {
  const otra = filaDe(COMPRAS_CON_OBRA, { ...COMPRA, 'N° Comprobante': '0003-00099999', Obra: '' })
  const p = planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: otra })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'huella_distinta')
})

test('si el ID no coincide también rechaza', () => {
  const p = planificarObra({ cambio: { ...CAMBIO, sheet_id: 54 }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'huella_distinta')
})

test('sin clave de comprobante no hay identidad: rechaza antes de mirar la celda', () => {
  const p = planificarObra({ cambio: { ...CAMBIO, clave: null }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'sin_huella')
})

test('si la celda cambió desde que la pantalla la miró (`esperado` distinto), NO la pisa', () => {
  const p = planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('ES-TAL · Estructura – Taller') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'celda_cambio')
  assert.match(p.detalle, /ES-TAL/)
})

test('cambiar una obra por otra pasa si la celda dice lo que la pantalla vio', () => {
  const p = planificarObra({
    cambio: { ...CAMBIO, valor_anterior: 'ES-ADM · Estructura – Administración' },
    encabezado: COMPRAS_CON_OBRA, fila: conObra('  ES-ADM · Estructura – Administración '),
  })
  assert.equal(p.accion, 'escribir')
})

test('idempotente: si la celda ya dice lo pedido, no vuelve a escribir', () => {
  const p = planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: conObra('OB-0021 · ME - PLAYÓN DE AZUFRE') })
  assert.equal(p.accion, 'ya_aplicado')
})

test('un valor fuera del desplegable se rechaza sin leer nada más', () => {
  const p = planificarObra({ cambio: { ...CAMBIO, valor_nuevo: 'la de Arcor' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(p.accion, 'rechazar')
  assert.equal(p.motivo, 'valor_invalido')
})

test('«Sin obra – cliente» y vaciar la celda son valores legítimos', () => {
  const sin = planificarObra({ cambio: { ...CAMBIO, valor_nuevo: 'Sin obra – LA ESTRELLA' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') })
  assert.equal(sin.accion, 'escribir')
  const vaciar = planificarObra({
    cambio: { ...CAMBIO, valor_anterior: 'OB-0007 · X', valor_nuevo: '' }, encabezado: COMPRAS_CON_OBRA, fila: conObra('OB-0007 · X'),
  })
  assert.equal(vaciar.accion, 'escribir')
  assert.equal(vaciar.valor, '')
})

test('una fila de encabezado o sin ID no es un renglón de datos', () => {
  assert.equal(planificarObra({ cambio: { ...CAMBIO, fila: 3 }, encabezado: COMPRAS_CON_OBRA, fila: conObra('') }).motivo, 'fila_invalida')
  const sinId = filaDe(COMPRAS_CON_OBRA, { ...COMPRA, ID: '' })
  assert.equal(planificarObra({ cambio: CAMBIO, encabezado: COMPRAS_CON_OBRA, fila: sinId }).motivo, 'fila_vacia')
})

test('la relectura compara texto normalizado: igual confirma, distinto no', () => {
  assert.equal(relecturaConfirma(' OB-0021 · X ', 'OB-0021 · X'), true)
  assert.equal(relecturaConfirma('ES-ADM · Estructura – Administración', 'OB-0021 · X'), false)
  assert.equal(relecturaConfirma(null, ''), true)
})

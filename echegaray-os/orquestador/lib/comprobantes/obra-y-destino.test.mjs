import test from 'node:test'
import assert from 'node:assert/strict'
import { destinosDeObra, obraParaLaColumna, pestanaDelComprobante } from './obra-y-destino.mjs'
import { CATALOGOS } from './obra-y-destino.fixture.mjs'

// La columna «Obra» registra una DECISIÓN. Cada test de acá fija un caso donde escribir algo sería
// fabricarla, o uno donde no escribir obligaría al dueño a tipear lo que el papel ya dice.

const D = destinosDeObra(CATALOGOS)

test('J + K que nombran una obra con código → el rótulo del desplegable', () => {
  const r = obraParaLaColumna({ obra: 'MESSINA', detalle: 'Planta de BSA', unidad: 'Civil' }, D)
  assert.equal(r.valor, 'OB-0007 · ME - PLANTA DE BSA')
  assert.equal(r.obra_id, 'me-bsa')
  assert.equal(obraParaLaColumna({ obra: 'MESSINA', detalle: 'Bases de Tanque' }, D).valor, 'OB-0008 · ME - BASES DE TANQUE')
  assert.equal(obraParaLaColumna({ obra: 'LA ESTRELLA', detalle: 'Galpon 9' }, D).valor, 'OB-0020 · LE - GALPÓN 9')
})

test('el cliente con UNA sola obra no tiene nada que decidir', () => {
  const r = obraParaLaColumna({ obra: 'Quattropani - Melisa García SAS', detalle: 'Salones Comerciales' }, D)
  assert.equal(r.valor, 'OB-0030 · QP - SALONES COMERCIALES')
})

test('San Francisco sin detalle NO se imputa a ninguna obra ni a «Sin obra»: se pregunta', () => {
  // Gerson Castro, «San Francisco», K vacía. Seis obras en la base real: elegir una es adivinar, y
  // «Sin obra – SAN FRANCISCO» es una decisión del dueño que nadie tomó.
  const r = obraParaLaColumna({ obra: 'San Francisco', detalle: '' }, D)
  assert.equal(r.valor, null)
  assert.match(r.porque, /SAN FRANCISCO/)
})

test('Administración → ES-ADM, Taller → ES-TAL', () => {
  assert.equal(obraParaLaColumna({ obra: 'Administracion', detalle: 'Refaccion Oficina', unidad: 'Estructura' }, D).valor,
    'ES-ADM · Estructura – Administración')
  assert.equal(obraParaLaColumna({ obra: 'Taller', unidad: 'Estructura' }, D).valor, 'ES-TAL · Estructura – Taller')
})

test('EL DEFECTO: una obra sacada del HISTORIAL no se escribe como decisión', () => {
  const c = { obra: 'MESSINA', detalle: 'Planta de BSA', obraVia: 'historial' }
  assert.equal(obraParaLaColumna(c, D).valor, null)
  assert.equal(obraParaLaColumna({ ...c, obraVia: undefined, detalleVia: 'historial' }, D).valor, null)
  assert.equal(obraParaLaColumna({ ...c, obraVia: 'anotacion' }, D).valor, 'OB-0007 · ME - PLANTA DE BSA', 'lo del papel sí')
})

test('la obra que contradice la Unidad no se escribe, y se nombra', () => {
  const r = obraParaLaColumna({ obra: 'Administracion', unidad: 'Civil' }, D)
  assert.equal(r.valor, null)
  assert.match(r.porque, /Unidad «Civil»/)
})

test('una obra sin código no es opción del desplegable', () => {
  const r = obraParaLaColumna({ obra: 'ARCOR', detalle: 'Playon' }, D)
  assert.equal(r.valor, null)
  assert.match(r.porque, /código interno/)
})

test('la obra elegida por una persona se valida: un texto que no es opción no llega a la celda', () => {
  assert.equal(obraParaLaColumna({ obraFila: 'OB-0008 · ME - BASES DE TANQUE' }, D).valor, 'OB-0008 · ME - BASES DE TANQUE')
  assert.equal(obraParaLaColumna({ obraFila: 'OB-9999 · INVENTADA' }, D).valor, null)
  assert.equal(obraParaLaColumna({ obraFila: 'la de Messina' }, D).valor, null)
})

test('sin catálogo no hay propuesta: la celda queda como hoy', () => {
  assert.equal(obraParaLaColumna({ obra: 'MESSINA', detalle: 'Planta de BSA' }, null).valor, null)
})

test('la pestaña sale de rubro-caja: gremiales y F931 → Cargas Sociales, ARCA/Impuestos/banco → Impuestos y Financieros', () => {
  assert.equal(pestanaDelComprobante({ proveedor: 'UOCRA' }).pestana, 'Cargas Sociales')
  assert.equal(pestanaDelComprobante({ proveedor: 'IERIC' }).pestana, 'Cargas Sociales')
  assert.equal(pestanaDelComprobante({ proveedor: 'Sindicatos', obra: 'F931' }).pestana, 'Cargas Sociales')
  assert.equal(pestanaDelComprobante({ proveedor: 'ARCA' }).pestana, 'Impuestos y Financieros')
  assert.equal(pestanaDelComprobante({ proveedor: 'Municipalidad', unidad: 'Impuestos' }).pestana, 'Impuestos y Financieros')
  assert.equal(pestanaDelComprobante({ proveedor: 'Banco' }).pestana, 'Impuestos y Financieros')
  // El contrapeso: una compra de obra sigue siendo Compras.
  assert.equal(pestanaDelComprobante({ proveedor: 'Corralón Progreso', unidad: 'Civil', obra: 'MESSINA' }).pestana, 'Compras')
  assert.equal(pestanaDelComprobante({ proveedor: 'Corralón Progreso' }).pestana, 'Compras')
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { MIA_PROBADA, VACIO, esEspejo, esVacio, permiteBorradoExplicito, preservarNoVacias, protegerBorrado, refA1, sinCentinela, tabDe } from './no-borrar.mjs'

test('una celda vacía NUNCA reemplaza una que tenía algo', () => {
  const { values, preservadas } = preservarNoVacias([['dato del dueño', 'x']], [['', 'y']])
  assert.deepEqual(values, [['dato del dueño', 'y']])
  assert.equal(preservadas.length, 1)
})

test('el 0 y el false son DATOS, no vacíos — borrarlos sería el mismo bug al revés', () => {
  // El arqueo de caja del dueño es CERO. Si un `0` contara como vacío, esta guarda lo "preservaría"
  // pisándolo con el valor viejo, que es justamente lo contrario de lo que se pide.
  assert.equal(esVacio(0), false)
  assert.equal(esVacio(false), false)
  const { values } = preservarNoVacias([[999]], [[0]])
  assert.deepEqual(values, [[0]], 'un 0 nuevo SÍ tiene que poder pisar un 999 viejo')
})

test('el centinela VACIO tampoco puede borrar: la regla es absoluta', () => {
  // En el resto del repo el centinela significa "mi celda, intencionalmente vacía". Acá no alcanza:
  // el dueño pidió que NUNCA se borre nada suyo, y esta guarda no distingue intenciones.
  const { values } = preservarNoVacias([['lo del dueño']], [[VACIO]])
  assert.deepEqual(values, [['lo del dueño']])
})

test('una grilla MÁS CORTA no borra la cola — el caso del generador que muere a mitad', () => {
  // Es literalmente lo que pasó los últimos dos días: systemd mataba al generador y la pestaña
  // quedaba escrita hasta donde llegó. Las filas que la grilla nueva no menciona no se tocan.
  const actual = [['a'], ['b'], ['c'], ['d']]
  const { values } = preservarNoVacias(actual, [['a2'], ['b2']])
  assert.deepEqual(values, [['a2'], ['b2']], 'sólo se devuelven las 2 filas: las otras 2 ni se mencionan')
})

test('una fila con celdas de más a la derecha no borra las columnas del dueño', () => {
  const { values } = preservarNoVacias([['x', 'suyo', 'tambien suyo']], [['y', '', '']])
  assert.deepEqual(values, [['y', 'suyo', 'tambien suyo']])
})

test('vacío sobre vacío pasa: no hay nada que proteger', () => {
  const { values, preservadas } = preservarNoVacias([['', null]], [['', '']])
  assert.deepEqual(values, [['', '']])
  assert.equal(preservadas.length, 0)
})

test('los espejos SÍ se pueden vaciar: si la fuente se achica, la réplica tiene que achicarse', () => {
  for (const t of ['_BANCO_RAW', '_ARCA_RAW', '_J_OBREROS']) assert.equal(esEspejo(t), true)
  for (const t of ['CAJA', 'Compras', 'Cash Flow Semanal']) assert.equal(esEspejo(t), false)
})

test('clearValues sólo se permite en un espejo', () => {
  assert.equal(permiteBorradoExplicito("'_BANCO_RAW'!A4:F100"), true)
  assert.equal(permiteBorradoExplicito("'CAJA'!A1:Z200"), false)
  assert.equal(permiteBorradoExplicito("'Cheques Emitidos'!A1"), false)
})

test('tabDe entiende las comillas y los apóstrofes de los nombres reales', () => {
  assert.equal(tabDe("'Cash Flow Semanal'!A1:B2"), 'Cash Flow Semanal')
  assert.equal(tabDe('CAJA!A1'), 'CAJA')
  assert.equal(tabDe('sin bang'), null)
})

test('refA1 nombra la celda preservada para que el aviso sea accionable', () => {
  assert.equal(refA1("'CAJA'!A1:Z200", 0, 0), 'A1')
  assert.equal(refA1("'CAJA'!C10:F20", 2, 1), 'D12')
  assert.equal(refA1("'Compras'!Z4:AZ900", 0, 1), 'AA4')
})

test('si NO se puede releer el destino, el rango se DESCARTA (falla cerrado)', async () => {
  const cliente = { readSheetValues: async () => { throw new Error('sin red') } }
  const r = await protegerBorrado(cliente, 'F', [{ range: "'CAJA'!A1:B2", values: [['x']] }])
  assert.deepEqual(r.data, [])
  assert.deepEqual(r.descartados, ["'CAJA'!A1:B2"])
})

test('el caso completo, de punta a punta', async () => {
  const cliente = { readSheetValues: async () => [['viejo1', 'nota del dueño'], ['viejo2', 'otra']] }
  const r = await protegerBorrado(cliente, 'F', [{ range: "'CAJA'!A1:B2", values: [['nuevo1', ''], ['nuevo2', '']] }])
  assert.deepEqual(r.data[0].values, [['nuevo1', 'nota del dueño'], ['nuevo2', 'otra']])
  assert.equal(r.preservadas, 2)
  assert.ok(r.detalle[0].includes('B1'), r.detalle.join(' '))
})

test('un espejo no paga la lectura de más: pasa derecho', async () => {
  let leyo = false
  const cliente = { readSheetValues: async () => { leyo = true; return [] } }
  const r = await protegerBorrado(cliente, 'F', [{ range: "'_BANCO_RAW'!A4:F9", values: [['']] }])
  assert.equal(leyo, false)
  assert.deepEqual(r.data[0].values, [['']])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL TERCER ESTADO (13/08): "ESTA CELDA ES MÍA, ESTÁ PROBADO, Y VA VACÍA"
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// El dueño: "estoy eliminando cosas de las pestañas que no me interesan q se vean y me las estas
// volviendo a poner". Esta guarda tenía dos estados y le faltaba el que distingue. Sin el tercero,
// una celda que el OS mismo escribió queda blindada para siempre con el mismo blindaje que protege
// el trabajo del dueño — y eso es lo que le pasó a `Cash Flow Semanal!A106="AH7"`.

test('lo que la huella probó MÍO se limpia de verdad (antes se reponía en cada corrida)', () => {
  const { values, limpiadas, preservadas } = preservarNoVacias([['residuo de mi layout viejo', 'nota del dueño']], [[MIA_PROBADA, '']])
  assert.deepEqual(values, [['', 'nota del dueño']], 'la mía queda VACÍA; la del dueño se conserva')
  assert.equal(limpiadas.length, 1, 'se cuenta aparte: el log tiene que poder decir "limpio LO MÍO"')
  assert.equal(preservadas.length, 1, 'y "conservo esto otro", que es lo que no puede probar')
})

test('el centinela probado NUNCA llega al Sheet, ni siquiera donde no hay nada que preservar', () => {
  // Escribirlo literal ya pasó: 61 celdas de CAJA quedaron mostrando "::VACIO::". Que la celda de
  // destino esté vacía no puede ser la diferencia entre traducirlo y mandarlo crudo.
  const { values } = preservarNoVacias([['']], [[MIA_PROBADA]])
  assert.deepEqual(values, [['']])
  assert.deepEqual(sinCentinela([[MIA_PROBADA, 'x']]), [['', 'x']])
})

test('un espejo tampoco recibe el centinela crudo', async () => {
  const cliente = { readSheetValues: async () => [] }
  const r = await protegerBorrado(cliente, 'F', [{ range: "'_BANCO_RAW'!A4:F9", values: [[MIA_PROBADA, 'dato']] }])
  assert.deepEqual(r.data[0].values, [['', 'dato']])
})

test('el tercer estado NO afloja el segundo: sin centinela, se conserva igual que siempre', () => {
  // El seguro de todo esto. Si `MIA_PROBADA` se colara como "cualquier vacío", la guarda dejaría de
  // proteger y volveríamos a la forma exacta de las siete pérdidas.
  const { values, limpiadas } = preservarNoVacias([['lo del dueño']], [['']])
  assert.deepEqual(values, [['lo del dueño']])
  assert.deepEqual(limpiadas, [])
  assert.equal(esVacio(MIA_PROBADA), true, 'es un vacío, pero uno que viene con prueba adjunta')
})

test('protegerBorrado informa las dos cosas por separado: lo que limpia y lo que conserva a ciegas', async () => {
  const cliente = { readSheetValues: async () => [['mi residuo', 'nota del dueño']] }
  const r = await protegerBorrado(cliente, 'F', [{ range: "'CAJA'!A1:B1", values: [[MIA_PROBADA, '']] }])
  assert.deepEqual(r.data[0].values, [['', 'nota del dueño']])
  assert.equal(r.limpiadas, 1)
  assert.equal(r.preservadas, 1)
  assert.ok(r.detalleLimpiadas[0].includes('A1'), r.detalleLimpiadas.join(' '))
  assert.ok(r.detalle[0].includes('B1'), r.detalle.join(' '))
})

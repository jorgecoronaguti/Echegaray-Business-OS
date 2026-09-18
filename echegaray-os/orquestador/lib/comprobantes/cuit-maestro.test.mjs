// EL CUIT CONFIRMADO POR ARCA COMPLETA EL MAESTRO — Y SÓLO ÉSE, Y SÓLO SI FALTA.
import test from 'node:test'
import assert from 'node:assert/strict'
import { completarCuitsDelMaestro, cuitsParaCompletar } from './cuit-maestro.mjs'

const MAESTRO = {
  ok: true,
  proveedores: [
    { id: 'neu', nombre: 'NEUMAGOM SAS', cuit: null },
    { id: 'vdp', nombre: 'VILLA DEL PINO', cuit: null },
    { id: 'cor', nombre: 'Corralon Progreso', cuit: '23369111574' },
  ],
}

test('Neumagom, fila 981 del 17/09: el maestro no tenía el CUIT y ARCA lo confirmó → se completa', () => {
  const plan = [{ proveedor: 'Neumagom SAS', cuitConfirmado: '30691853825' }]
  assert.deepEqual(cuitsParaCompletar(plan, MAESTRO), [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: '30691853825' }])
})

test('sin confirmación de ARCA no se toca el maestro: el CUIT leído de la foto se come dígitos (VILLA DEL PINO)', () => {
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'VILLA DEL PINO', cuitConfirmado: null, cuit: '30716304677' }], MAESTRO), [])
})

test('un proveedor que ya tiene CUIT no se pisa, aunque ARCA traiga otro', () => {
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'Corralon Progreso', cuitConfirmado: '20111111112' }], MAESTRO), [])
})

test('un CUIT que ya es de OTRO proveedor no se asigna: la contradicción la resuelve una persona', () => {
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: '23369111574' }], MAESTRO), [])
})

test('dos CUIT distintos para el mismo nombre en la misma tanda → ninguno', () => {
  const plan = [{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: '30691853825' }, { proveedor: 'NEUMAGOM SAS', cuitConfirmado: '30691853826' }]
  assert.deepEqual(cuitsParaCompletar(plan, MAESTRO), [])
  const repetido = [{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: '30691853825' }, { proveedor: 'neumagom sas', cuitConfirmado: '30691853825' }]
  assert.equal(cuitsParaCompletar(repetido, MAESTRO).length, 1, 'el mismo CUIT dos veces es uno')
})

test('sin maestro (la base no contestó) no se decide nada', () => {
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: '30691853825' }], { ok: false, proveedores: [] }), [])
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: '30691853825' }], null), [])
})

test('la escritura devuelve lo que la BASE confirmó, y el SQL repite las guardas', async () => {
  const consultas = []
  const query = async (sql, params) => { consultas.push({ sql, params }); return { rows: params[1] === 'neu' ? [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: params[0] }] : [] } }
  const r = await completarCuitsDelMaestro(query, [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: '30691853825' }, { id: 'otro', nombre: 'X', cuit: '20111111112' }])
  assert.deepEqual(r, [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: '30691853825' }])
  assert.equal(consultas.length, 2)
  assert.match(consultas[0].sql, /cuit is null/)
  assert.match(consultas[0].sql, /not exists/)
  await assert.rejects(() => completarCuitsDelMaestro(null, []), /query/)
})

// ── La vía de ARCA, que es lo que hace que «confirmado» signifique algo (18/09/2026) ──

test('EL CUIT DE OTRO EMISOR NO ENTRA AL MAESTRO: `coincide` por fecha+total no identifica a nadie', async () => {
  // El caso: foto sin CUIT legible (o con el CUIT mal leído) + una única fila del libro con la misma
  // fecha y el mismo total, emitida por OTRO. `conciliarConArca` devuelve `coincide` vía fecha+total
  // con el `emisorCuit` ajeno. Si eso llegara al maestro, el proveedor quedaría con el CUIT de otra
  // empresa y su cuenta corriente se parte. Lo frena `emisorConfirmado` ANTES de armar el plan:
  // `cuitConfirmado` ya no existe para esa vía, así que acá no hay nada que decidir.
  const { emisorConfirmado, VIA } = await import('./arca.mjs')
  const ajeno = { estado: 'coincide', via: VIA.FECHA_TOTAL, emisorCuit: '30111111117' }
  // EL CONTRASTE, que es lo que prueba que la guarda hace algo: con la regla vieja —cualquier
  // `estado: 'coincide'` con `emisorCuit`— el CUIT de la otra empresa entraba a la ficha de Neumagom.
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: ajeno.emisorCuit }], MAESTRO),
    [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: '30111111117' }], 'así entraba antes del 18/09')
  // Con la guarda por vía, no hay CUIT que pasar y no hay nada que escribir.
  const plan = [{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: emisorConfirmado(ajeno) }]
  assert.deepEqual(cuitsParaCompletar(plan, MAESTRO), [])
  // Y por CAE o por CUIT, la misma fila sí confirma.
  const propio = { estado: 'coincide', via: VIA.CAE, emisorCuit: '30691853825' }
  assert.deepEqual(cuitsParaCompletar([{ proveedor: 'NEUMAGOM SAS', cuitConfirmado: emisorConfirmado(propio) }], MAESTRO),
    [{ id: 'neu', nombre: 'NEUMAGOM SAS', cuit: '30691853825' }])
})

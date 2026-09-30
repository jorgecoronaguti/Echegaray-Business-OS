import test from 'node:test'
import assert from 'node:assert/strict'
import { intervalo, leerArgs, paraAvisar, textoDeFila, textoDeGrupo } from './control-de-fallas.mjs'

test('intervalo y argumentos', () => {
  assert.equal(intervalo('8h'), '8 hours')
  assert.equal(intervalo('3d'), '3 days')
  assert.equal(intervalo('90m'), '90 minutes')
  assert.throws(() => intervalo('ayer'))
  assert.deepEqual(leerArgs(['--usuario', 'hys@ecsas.com.ar', '--desde', '2d']), { desde: '2d', usuario: 'hys@ecsas.com.ar', digest: null, avisar: false })
  assert.throws(() => leerArgs(['--borrar']))
})

test('paraAvisar: sólo lo que no se avisó antes', () => {
  const gs = [{ tipo: 'error_servidor', firma: 'a' }, { tipo: 'error_cliente', firma: 'a' }, { tipo: 'error_servidor', firma: 'b' }]
  assert.deepEqual(paraAvisar(gs, ['error_servidor|a']).map((g) => `${g.tipo}|${g.firma}`), ['error_cliente|a', 'error_servidor|b'])
  assert.equal(paraAvisar(gs, gs.map((g) => `${g.tipo}|${g.firma}`)).length, 0)
})

test('textos: el grupo nuevo se marca, la fila dice a dónde la mandaron', () => {
  const g = { tipo: 'error_servidor', veces: 3, primera: '2026-09-30T12:00:00Z', ultima: '2026-09-30T13:00:00Z', vista_por_primera_vez: '2026-09-30T12:00:00Z',
    mensaje: 'Event handlers cannot be passed', rutas: ['/obras/hoy'], quienes: ['MALDONADO'], digest: '3902547586', despliegues: ['d339c734'] }
  const t = textoDeGrupo(g)
  assert.match(t, /^🆕 servidor · 3×/)
  assert.match(t, /digest 3902547586/)
  assert.doesNotMatch(textoDeGrupo({ ...g, vista_por_primera_vez: '2026-09-01T00:00:00Z' }), /🆕/)
  assert.match(textoDeFila({ hora: '30/09 10:00:00', tipo: 'redireccion', metodo: 'GET', ruta: '/obras', consulta: '', estado: 307, destino: '/obras/hoy', dispositivo: 'pc', prestada: false, detalle: null }), /→ \/obras\/hoy \(307\)/)
})

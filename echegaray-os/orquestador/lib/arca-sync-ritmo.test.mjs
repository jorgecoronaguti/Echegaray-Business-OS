import test from 'node:test'
import assert from 'node:assert/strict'
import { tocaHoy, prioritariosEntre, ultimaBajadaDe, finDeVentana, fechaLocal } from './arca-sync-ritmo.mjs'

const DIAS = [1, 11, 18]
const V_SEP = '2026-09-10→2026-10-10'
const V_OCT = '2026-10-10→2026-11-10'
const base = { fuente: 'proveedor', dias: DIAS }

test('la ventana actual (4 usadas de 10, reserva 2): corre el 18/09 y guarda la del 01/10', () => {
  // 17/09: disponible = 10 − 2 − 4 = 4 → 2 corridas; prioritarios por delante: 18/09 y 01/10.
  assert.equal(tocaHoy({ ...base, hoy: '2026-09-17', disponible: 4, ventana: V_SEP, ultimaBajada: '2026-09-17' }).toca, false)
  assert.equal(tocaHoy({ ...base, hoy: '2026-09-18', disponible: 4, ventana: V_SEP, ultimaBajada: '2026-09-17' }).toca, true)
  // Después del 18: queda 1 corrida y el 01/10 por delante → ningún día intermedio la gasta.
  for (const hoy of ['2026-09-22', '2026-09-25', '2026-09-27']) {
    assert.equal(tocaHoy({ ...base, hoy, disponible: 2, ventana: V_SEP, ultimaBajada: '2026-09-18' }).toca, false, hoy)
  }
  assert.equal(tocaHoy({ ...base, hoy: '2026-10-01', disponible: 2, ventana: V_SEP, ultimaBajada: '2026-09-18' }).toca, true)
})

test('una ventana entera: usa las 4 corridas (11, 18, una extra en el hueco largo, 01) y nunca queda en cero antes del 01', () => {
  let disponible = 8
  let ultima = null
  const corridas = []
  for (let d = new Date('2026-10-10T00:00:00Z'); d < new Date('2026-11-10T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
    const hoy = d.toISOString().slice(0, 10)
    const r = tocaHoy({ ...base, hoy, disponible, ventana: V_OCT, ultimaBajada: ultima })
    if (r.toca) { corridas.push(hoy); disponible -= 2; ultima = hoy }
  }
  assert.deepEqual(corridas, ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'])
  assert.equal(disponible, 0)
})

test('si el dueño gastó a mano, el día 01 conserva su corrida', () => {
  // Ventana oct con 2 corridas manuales el 12/10: disponible 4 después del 11 → quedan 18/10 y 01/11.
  let disponible = 4
  let ultima = '2026-10-12'
  const corridas = []
  for (let d = new Date('2026-10-13T00:00:00Z'); d < new Date('2026-11-10T00:00:00Z'); d = new Date(d.getTime() + 86400000)) {
    const hoy = d.toISOString().slice(0, 10)
    if (tocaHoy({ ...base, hoy, disponible, ventana: V_OCT, ultimaBajada: ultima }).toca) { corridas.push(hoy); disponible -= 2; ultima = hoy }
  }
  assert.deepEqual(corridas, ['2026-10-18', '2026-11-01'])
})

test('sin cuota real del proveedor sólo corren los días prioritarios; sin cuota, nunca', () => {
  assert.equal(tocaHoy({ ...base, fuente: 'local', hoy: '2026-10-25', disponible: 8, ventana: '2026-10', ultimaBajada: '2026-10-11' }).toca, false)
  assert.equal(tocaHoy({ ...base, fuente: 'local', hoy: '2026-10-11', disponible: 8, ventana: '2026-10' }).toca, true)
  assert.equal(tocaHoy({ ...base, hoy: '2026-10-01', disponible: 1, ventana: V_SEP }).toca, false)
})

test('auxiliares', () => {
  assert.equal(finDeVentana(V_SEP), '2026-10-10')
  assert.equal(finDeVentana('2026-09'), null)
  assert.deepEqual(prioritariosEntre('2026-09-17', '2026-10-10', DIAS), ['2026-09-18', '2026-10-01'])
  assert.equal(ultimaBajadaDe({ eventos: [{ fecha: '2026-09-17' }, { fecha: '2026-08-24' }] }), '2026-09-17')
  assert.equal(ultimaBajadaDe({}), null)
})

test('la fecha del ritmo es la LOCAL: el 30/09 a las 22:00 en San Juan no es el 01/10', () => {
  const noche = new Date('2026-10-01T01:00:00Z') // 30/09 22:00 en UTC−3
  const tz = process.env.TZ
  process.env.TZ = 'America/Argentina/San_Juan'
  try {
    assert.equal(fechaLocal(noche), '2026-09-30')
  } finally {
    if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz
  }
  assert.equal(tocaHoy({ ...base, hoy: '2026-09-30', disponible: 2, ventana: V_SEP, ultimaBajada: '2026-09-18' }).toca, false)
})

test('un día prioritario no gasta dos veces el mismo día, y eso NO es una falla', () => {
  const r = tocaHoy({ ...base, hoy: '2026-09-18', disponible: 4, ventana: V_SEP, ultimaBajada: '2026-09-18' })
  assert.equal(r.toca, false)
  assert.ok(!r.prioritarioSinCuota)
})

test('un día prioritario SIN cuota avisa para fallar fuerte; un día común sin cuota sale callado', () => {
  assert.equal(tocaHoy({ ...base, hoy: '2026-10-01', disponible: 0, ventana: V_SEP }).prioritarioSinCuota, true)
  assert.equal(tocaHoy({ ...base, hoy: '2026-09-25', disponible: 0, ventana: V_SEP }).prioritarioSinCuota, false)
})

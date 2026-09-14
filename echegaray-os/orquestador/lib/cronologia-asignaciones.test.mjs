// La cronología de obra de cada empleado: lo que se GUARDA no puede decir dos obras el mismo día.
// Los casos salen de la base del 14/09/2026 (Reta, Pastran, Zogbe, Agüero, Rosales).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MARCA_RECONSTRUIDA, cederAnteLaApp, planDeAsignacion, superposiciones, tramoEfectivo,
} from './cronologia-asignaciones.mjs'
import { SQL, aplicarEnMemoria, planDeNormalizacion } from './cronologia-normalizar.mjs'
import { planDeConjunto } from './asignaciones-desde-hh.mjs'

const R = `${MARCA_RECONSTRUIDA} · 08/09/2026`
const fila = (id, persona_id, obra_id, desde, hasta, extra = {}) =>
  ({ id, persona_id, obra_id, desde, hasta, notas: null, creado_en: `${desde ?? '2026-09-07'}T15:00:00Z`, ...extra })

// ─── a) mover a alguien cierra la anterior ──────────────────────────────────────────────────────

test('mover a alguien desde D cierra la anterior de OTRA obra en D−1', () => {
  const plan = planDeAsignacion([fila('p', 'reta', 'pisos', '2026-08-01', null)],
    { obra_id: 'quattro', desde: '2026-09-09', hasta: null })
  assert.deepEqual(plan.cerrar, [{ id: 'p', hasta: '2026-09-08', continua: null }])
})

test('también se cierra la que ya tenía fin pero cubría D (no sólo las abiertas)', () => {
  const plan = planDeAsignacion([fila('p', 'reta', 'pisos', '2026-08-01', '2026-09-30')],
    { obra_id: 'quattro', desde: '2026-09-09', hasta: null })
  assert.deepEqual(plan.cerrar.map((c) => [c.id, c.hasta]), [['p', '2026-09-08']])
})

test('la que empezó en D se CIERRA en D y no se borra: queda cargada antes y pierde por carga posterior', () => {
  const plan = planDeAsignacion([fila('q', 'aguero', 'quattro', '2026-09-08', null)],
    { obra_id: 'pisos', desde: '2026-09-08', hasta: null })
  assert.deepEqual(plan.cerrar, [{ id: 'q', hasta: '2026-09-08', continua: null }])
  assert.deepEqual(plan.reemplazar, [])
})

test('CARGA POSTERIOR (dueño 14/09): el día suelto del mismo D cargado ANTES se anula — Reta, Quiroga A., Maldonado', () => {
  const casos = [
    [fila('reta-mes', 'reta', 'messina', '2026-09-09', '2026-09-09', { creado_en: '2026-09-08T19:06:41.811Z' }),
      { obra_id: 'quattro', desde: '2026-09-09', hasta: null, creado_en: '2026-09-09T14:06:09.328Z' }],
    [fila('qa-q', 'quiroga-a', 'quattro', '2026-09-09', '2026-09-09', { creado_en: '2026-09-08T19:09:49.224Z' }),
      { obra_id: 'messina', desde: '2026-09-09', hasta: null, creado_en: '2026-09-09T14:08:04.155Z' }],
    [fila('mal-e', 'maldonado', 'entrepiso', '2026-09-08', '2026-09-08', { creado_en: new Date('2026-09-08T15:23:28.655Z') }),
      { obra_id: 'quattro', desde: '2026-09-08', hasta: null, creado_en: new Date('2026-09-08T15:23:31.641Z') }],
  ]
  for (const [suelto, nueva] of casos) {
    assert.deepEqual(planDeAsignacion([suelto], nueva),
      { cerrar: [], reemplazar: [], recortar: [], anular: [{ id: suelto.id }] }, suelto.id)
  }
})

test('el día suelto cargado DESPUÉS del tramo largo sigue siendo la excepción: no se anula', () => {
  const suelto = fila('s', 'reta', 'messina', '2026-09-09', '2026-09-09', { creado_en: new Date('2026-09-09T12:00:00Z') })
  const plan = planDeAsignacion([suelto], { obra_id: 'quattro', desde: '2026-09-09', hasta: null, creado_en: new Date('2026-09-09T10:00:00Z') })
  assert.deepEqual(plan.anular, [])
})

test('la que sigue después de un tramo con fin se recorta; la que la envuelve avisa qué continúa', () => {
  const futura = fila('f', 'x', 'messina', '2026-09-20', '2026-10-30')
  const larga = fila('l', 'x', 'galpon', '2026-08-01', null)
  const plan = planDeAsignacion([futura, larga], { obra_id: 'quattro', desde: '2026-09-15', hasta: '2026-09-25' })
  assert.deepEqual(plan.recortar, [{ id: 'f', desde: '2026-09-26' }])
  assert.deepEqual(plan.cerrar, [{ id: 'l', hasta: '2026-09-14', continua: { obra_id: 'galpon', desde: '2026-09-26', hasta: null } }])
})

// ─── la excepción: un día suelto no parte el tramo ──────────────────────────────────────────────

test('un día suelto no parte el tramo largo: guardar el 09/09 en Messina no cierra Quattropani', () => {
  const plan = planDeAsignacion([fila('q', 'reta', 'quattro', '2026-09-08', null)],
    { obra_id: 'messina', desde: '2026-09-09', hasta: '2026-09-09' })
  assert.deepEqual(plan, { cerrar: [], reemplazar: [], recortar: [], anular: [] })
})

test('un día suelto de la app no parte la reconstruida ni la normalización lo toca', () => {
  const r = fila('r', 'zogbe', 'galpon', '2026-07-16', '2026-08-14', { notas: R })
  const suelto = fila('s', 'zogbe', 'la-estrella', '2026-08-05', '2026-08-05')
  assert.deepEqual(cederAnteLaApp([r], [r, suelto]).map((t) => [t.desde, t.hasta]), [['2026-07-16', '2026-08-14']])
  assert.deepEqual(planDeNormalizacion([r, suelto], { fecha: '14/09/2026' }).cambios, [])
})

// ─── b) la reconstrucción no pisa lo cargado en la app ──────────────────────────────────────────

test('ROSALES: la fila sin desde vale desde su creación y no borra ocho meses de JORNALES', () => {
  const app = fila('a', 'rosales', 'entrepiso', null, '2026-09-07', { creado_en: '2026-09-07T19:07:11Z' })
  assert.deepEqual(tramoEfectivo(app), { desde: '2026-09-07', hasta: '2026-09-07', sinFecha: false })
  const tramos = [
    { persona_id: 'rosales', obra_id: 'san-francisco', desde: '2026-01-05', hasta: '2026-03-31' },
    { persona_id: 'rosales', obra_id: 'quattro', desde: '2026-09-01', hasta: '2026-09-07' },
  ]
  assert.deepEqual(cederAnteLaApp(tramos, [app]).map((t) => [t.obra_id, t.desde, t.hasta]),
    [['san-francisco', '2026-01-05', '2026-03-31'], ['quattro', '2026-09-01', '2026-09-06']])
})

test('el timer (planDeConjunto) no inserta días que ya cubre la app en otra obra, y los parte si hace falta', () => {
  const app = fila('a', 'x', 'pisos', '2026-08-10', '2026-08-20')
  const tramo = { persona_id: 'x', obra_id: 'san-francisco', desde: '2026-08-01', hasta: '2026-08-31', abierto: false, dias: 20, horas: 180 }
  const plan = planDeConjunto([tramo], [app], { hoy: '2026-09-14' })
  assert.deepEqual(plan.insertar.map((i) => [i.desde, i.hasta]), [['2026-08-01', '2026-08-09'], ['2026-08-21', '2026-08-31']])
})

test('el timer y la normalización llegan al MISMO conjunto: la corrida siguiente no reescribe nada', () => {
  const app = fila('a', 'x', 'pisos', '2026-08-10', '2026-08-20')
  const vieja = fila('r', 'x', 'san-francisco', '2026-08-01', '2026-08-31', { notas: R })
  const normal = aplicarEnMemoria([app, vieja], planDeNormalizacion([app, vieja], { fecha: '14/09/2026' }))
  const tramo = { persona_id: 'x', obra_id: 'san-francisco', desde: '2026-08-01', hasta: '2026-08-31', abierto: false }
  const plan = planDeConjunto([tramo], normal, { hoy: '2026-09-14' })
  assert.deepEqual([plan.insertar.length, plan.borrar.length], [0, 0])
})

// ─── c) el orquestador nunca toca filas de la app ───────────────────────────────────────────────

const REAL = [
  fila('reta-pisos', 'reta', 'pisos', null, '2026-09-07', { creado_en: '2026-09-07T18:50:08Z' }),
  fila('reta-q-r', 'reta', 'quattro', '2026-08-17', '2026-09-07', { notas: R, creado_en: '2026-09-08T20:18:08Z' }),
  fila('reta-q-8', 'reta', 'quattro', '2026-09-08', '2026-09-08', { creado_en: '2026-09-08T14:41:00Z' }),
  fila('reta-mes', 'reta', 'messina', '2026-09-09', '2026-09-09', { creado_en: '2026-09-08T19:06:41Z' }),
  fila('reta-q-9', 'reta', 'quattro', '2026-09-09', null, { creado_en: '2026-09-09T14:06:09Z' }),
  fila('pas-gal', 'pastran', 'galpon', null, '2026-09-07', { creado_en: '2026-08-20T20:46:20Z' }),
  fila('pas-ins', 'pastran', 'electrica', null, '2026-09-07', { creado_en: '2026-09-07T19:00:26Z' }),
  fila('pas-r', 'pastran', 'la-estrella', '2026-08-17', '2026-08-17', { notas: R, creado_en: '2026-09-08T20:18:08Z' }),
  fila('zog-pis', 'zogbe', 'pisos', null, '2026-09-07', { creado_en: '2026-09-07T18:49:55Z' }),
  fila('zog-gal', 'zogbe', 'galpon', '2026-08-20', '2026-09-07', { creado_en: '2026-08-20T12:00:00Z' }),
  fila('zog-r', 'zogbe', 'entrepiso', '2026-09-02', '2026-09-04', { notas: R, creado_en: '2026-09-08T20:18:08Z' }),
  fila('pet', 'petina', 'quattro', null, null, { creado_en: '2026-09-07T18:51:20Z' }),
  fila('pet-r', 'petina', 'sf', '2026-08-19', '2026-08-31', { notas: R, creado_en: '2026-09-08T20:18:08Z' }),
  fila('ahu', 'ahumada', 'limpieza', null, '2026-06-30', { notas: ' · cerrada 08/09/2026 al egreso', creado_en: '2026-08-18T21:39:21Z' }),
  fila('ahu-r', 'ahumada', 'messina', '2026-06-16', '2026-06-30', { notas: R, creado_en: '2026-09-08T20:18:08Z' }),
]

test('la normalización a una fila de persona sólo le cierra `hasta` o la anula por nota: ni desde, ni borra, ni inserta', () => {
  const { cambios } = planDeNormalizacion(REAL, { fecha: '14/09/2026' })
  const dePersona = cambios.filter((c) => !(c.fila.notas ?? '').includes(MARCA_RECONSTRUIDA))
  assert.ok(dePersona.some((c) => c.tipo === 'cerrar'), 'el caso tiene que ejercer el cierre')
  for (const c of dePersona) {
    assert.ok(['cerrar', 'anular'].includes(c.tipo), c.tipo)
    assert.equal(c.despues.desde, c.antes.desde)
    if (c.tipo === 'anular') assert.equal(c.despues.hasta, c.antes.hasta)
    assert.ok(c.notas.startsWith(c.antes.notas ?? ''), 'la constancia se agrega, no reemplaza')
  }
})

test('las sentencias del orquestador: persona sólo cambia hasta/notas; borrar y recortar exigen la marca', () => {
  assert.match(SQL.cerrarDePersona, /set hasta = \$2::date, notas = \$3\s+where id = \$1/)
  assert.match(SQL.cerrarDePersona, /not like '%historial reconstruido desde JORNALES \(sheet\)%'/)
  for (const s of [SQL.borrarReconstruida, SQL.recortarReconstruida]) {
    assert.match(s, / like '%historial reconstruido desde JORNALES \(sheet\)%'/)
    assert.doesNotMatch(s, /not like/)
  }
})

test('PASTRAN con `creado_en` como Date (pg): lo cargado después cierra lo anterior, no al revés', () => {
  const galpon = fila('g', 'pastran', 'galpon', null, '2026-09-07', { creado_en: new Date('2026-08-20T20:46:20Z') })
  const electrica = fila('e', 'pastran', 'electrica', null, '2026-09-07', { creado_en: new Date('2026-09-07T19:00:26Z') })
  const { cambios, paraDueno } = planDeNormalizacion([electrica, galpon], { fecha: '14/09/2026' })
  assert.deepEqual(cambios.map((c) => [c.tipo, c.fila.id, c.despues.hasta]), [['cerrar', 'g', '2026-09-06']])
  assert.deepEqual(paraDueno, [])
})

test('RETA 09/09 en la normalización: el día en Messina queda ANULADO con nota, sin tocar sus fechas ni borrarse', () => {
  const { cambios, paraDueno } = planDeNormalizacion(REAL, { fecha: '14/09/2026' })
  const c = cambios.find((x) => x.fila.id === 'reta-mes')
  assert.equal(c?.tipo, 'anular')
  assert.deepEqual(c.despues, { desde: '2026-09-09', hasta: '2026-09-09' })
  assert.match(c.notas, /ANULADA por cronología/)
  assert.ok(!paraDueno.some((p) => p.fila.id === 'reta-mes'))
})

// ─── el invariante ──────────────────────────────────────────────────────────────────────────────

test('INVARIANTE: después de normalizar no quedan dos obras el mismo día salvo días sueltos y lo listado', () => {
  const plan = planDeNormalizacion(REAL, { fecha: '14/09/2026' })
  const antes = superposiciones(REAL).filter((p) => !p.mismaObra && !p.unDia)
  assert.ok(antes.length > 0, 'el caso tiene que arrancar roto')
  const listadas = new Set(plan.paraDueno.flatMap((p) => [p.fila.id, p.contra.id]))
  const quedan = superposiciones(aplicarEnMemoria(REAL, plan))
    .filter((p) => !p.mismaObra && !p.unDia && !(listadas.has(p.a.id) && listadas.has(p.b.id)))
  assert.deepEqual(quedan.map((p) => `${p.a.id}×${p.b.id} ${p.clase}`), [])
})

test('normalizar dos veces no cambia nada la segunda', () => {
  const una = aplicarEnMemoria(REAL, planDeNormalizacion(REAL, { fecha: '14/09/2026' }))
  assert.deepEqual(planDeNormalizacion(una, { fecha: '14/09/2026' }).cambios, [])
})

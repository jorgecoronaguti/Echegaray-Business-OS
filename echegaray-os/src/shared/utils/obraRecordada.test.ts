import test from 'node:test'
import assert from 'node:assert/strict'
import { COOKIE_OBRA, conObraRecordada, leerObraRecordada, obraDeCookieValida, obrasAsignadasVigentes } from './obraRecordada.ts'

// LA OBRA RECORDADA (24/09/2026): qué se guarda y qué asignación cuenta como «hoy».

test('la cookie sólo guarda algo con forma de id de obra', () => {
  assert.equal(COOKIE_OBRA, 'os_obra')
  assert.equal(obraDeCookieValida('quattropani'), 'quattropani')
  assert.equal(obraDeCookieValida(' messina-playon-azufre '), 'messina-playon-azufre')
  for (const raro of [null, undefined, '', '../x', 'a b', '<script>', '-empieza-con-guion', 'x'.repeat(101)]) {
    assert.equal(obraDeCookieValida(raro), null, `«${raro}» se aceptó`)
  }
})

test('asignación vigente: misma regla que public.asignacion_vigente, la más reciente primero', () => {
  const hoy = '2026-09-24'
  // Las filas reales de Emiliano Maldonado el 24/09/2026 (timestamps de la base, se mira el día).
  const filas = [
    { obra_id: 'quattropani', desde: '2026-09-08T03:00:00.000Z', hasta: null },
    { obra_id: 'quattropani', desde: '2026-09-07T03:00:00.000Z', hasta: '2026-09-07T03:00:00.000Z' },
    { obra_id: 'la-estrella', desde: '2026-03-30T03:00:00.000Z', hasta: '2026-08-07T03:00:00.000Z' },
    { obra_id: 'san-francisco', desde: '2026-01-05', hasta: '2026-01-31' },
  ]
  assert.deepEqual(obrasAsignadasVigentes(filas, hoy), ['quattropani'])
  assert.deepEqual(obrasAsignadasVigentes([
    { obra_id: 'a', desde: null, hasta: null },
    { obra_id: 'b', desde: '2026-09-20', hasta: '2026-09-24' },
    { obra_id: 'c', desde: '2026-09-25', hasta: null },
    { obra_id: null, desde: null, hasta: null },
  ], hoy), ['b', 'a'], 'hasta = hoy cuenta; desde mañana no; sin obra se ignora')
})

test('el navegador lee la cookie y los enlaces a /obra/* la llevan', () => {
  assert.equal(leerObraRecordada('a=1; os_obra=quattropani; b=2'), 'quattropani')
  assert.equal(leerObraRecordada('os_obra=..%2Fx'), null)
  assert.equal(leerObraRecordada(''), null)
  assert.equal(leerObraRecordada('os_obra=%E0%A4%A'), null, 'un valor mal codificado no rompe')
  assert.equal(conObraRecordada('/obra/hoy', 'quattropani'), '/obra/hoy?obra=quattropani')
  assert.equal(conObraRecordada('/obra/personas?ver=todos', 'quattropani'), '/obra/personas?ver=todos&obra=quattropani')
  assert.equal(conObraRecordada('/obra/hoy?obra=sf', 'quattropani'), '/obra/hoy?obra=sf', 'la obra de la URL manda')
  assert.equal(conObraRecordada('/obras', 'quattropani'), '/obras', 'la cartera no es una ruta del jefe')
  assert.equal(conObraRecordada('/administracion/personas', 'quattropani'), '/administracion/personas')
  assert.equal(conObraRecordada('/obra/hoy', null), '/obra/hoy')
})

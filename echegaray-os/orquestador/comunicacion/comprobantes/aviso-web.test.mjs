// UN COMPROBANTE DE LA WEB QUE ESPERA A LA PERSONA TIENE QUE AVISARLE — sin Postgres ni Mattermost.
//
// El caso (29/09): cinco tickets de Nievas subidos por la app quedaron `en_espera` (la compuerta M05
// espera que la persona confirme lo leído) y NADIE se lo dijo: el vigía sólo mira Mattermost porque un
// fajo web no tiene hilo. Sin aviso, la rendición no avanza y nada grita.

import test from 'node:test'
import assert from 'node:assert/strict'
import { avisarFajosWeb, textoDelAvisoWeb, agruparPorPersona } from './aviso-web.mjs'

const F = (id, usuario, total, extra = {}) => ({
  id, plataforma_user_id: usuario, plataforma_username: 'Juan Pablo Nievas', aviso_post_id: null,
  leidos: [{ proveedor: 'Combustibles', total, numero: '0035-00006334' }], ...extra,
})

function deps({ destino = { canal: 'dm1', quien: 'persona' }, falla = false } = {}) {
  const enviados = [], sellos = []
  return {
    enviados, sellos,
    listar: async () => [F('a', 'u1', 22000), F('b', 'u1', 18900), F('c', 'u2', 5000)],
    destinoDe: async (uid) => (uid === 'u2' ? { canal: 'dmDueno', quien: 'dueno' } : destino),
    enviar: async (canal, texto) => { if (falla) throw new Error('MM 500'); enviados.push({ canal, texto }); return `post-${enviados.length}` },
    sellar: async (ids, sello) => { sellos.push({ ids, sello }) },
  }
}

test('un mensaje por persona, con todos sus comprobantes, y sella cada fajo', async () => {
  const d = deps()
  const r = await avisarFajosWeb(d)
  assert.equal(d.enviados.length, 2)
  assert.deepEqual(d.sellos.map((s) => s.ids), [['a', 'b'], ['c']])
  assert.match(d.enviados[0].texto, /22\.000/)
  assert.match(d.enviados[0].texto, /18\.900/)
  assert.match(d.enviados[0].texto, /rendir\/confirmar/)
  assert.equal(r.avisados, 3)
})

test('sin identidad de Mattermost va al dueño y lo dice', async () => {
  const d = deps()
  await avisarFajosWeb(d)
  assert.match(d.enviados[1].texto, /Juan Pablo Nievas/)
  assert.match(d.enviados[1].texto, /no tiene Mattermost|no pude avisarle/i)
})

test('si Mattermost falla NO sella: se reintenta en el tick siguiente', async () => {
  const d = deps({ falla: true })
  const r = await avisarFajosWeb(d)
  assert.equal(d.sellos.length, 0)
  assert.equal(r.fallidos, 3)
})

test('sin destino alguno no sella ni calla: lo cuenta como fallido', async () => {
  const d = deps({ destino: null })
  const r = await avisarFajosWeb(d)
  assert.equal(r.fallidos >= 2, true)
  assert.equal(d.sellos.some((s) => s.ids.includes('a')), false)
})

test('agrupa y el texto nombra el motivo real, no «quedó sin cargar»', () => {
  const g = agruparPorPersona([F('a', 'u1', 1), F('b', 'u1', 2)])
  assert.equal(g.size, 1)
  const t = textoDelAvisoWeb({ fajos: [...g.values()][0], paraDueno: false })
  assert.doesNotMatch(t, /quedó sin cargar/)
  assert.match(t, /confirm/i)
})

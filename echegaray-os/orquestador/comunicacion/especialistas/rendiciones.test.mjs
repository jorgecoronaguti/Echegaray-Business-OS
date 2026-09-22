// El canal de rendiciones (22/09/2026): a qué entrega va el ticket y quién puede rendir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirEntrega, textoAmbigua, especialista, TEXTO } from './rendiciones.mjs'

const A = { id: 'a', codigo: 'ER-0147', obra: 'Galpón 8', obra_codigo: 'OB-0020', estructura: false }
const B = { id: 'b', codigo: 'ER-0144', obra: null, estructura: true }
const C = { id: 'c', codigo: 'ER-0150', obra: 'Salón comercial', estructura: false }

test('una sola entrega abierta: va a ésa, diga lo que diga el texto', () => {
  assert.equal(elegirEntrega([A], 'cualquier cosa').entrega, A)
})

test('varias: decide el código o la obra; si el texto no decide, NO se adivina', () => {
  assert.equal(elegirEntrega([A, B, C], 'flete er-150').entrega, C)
  assert.equal(elegirEntrega([A, B, C], 'ER 0144').entrega, B)
  assert.equal(elegirEntrega([A, B, C], 'áridos para el galpon 8').entrega, A)
  assert.deepEqual(elegirEntrega([A, B, C], 'áridos'), { entrega: null, motivo: 'ambigua' })
  assert.deepEqual(elegirEntrega([], 'x'), { entrega: null, motivo: 'ninguna' })
})

test('la pregunta de cuál entrega no publica plata: el canal lo ve todo el grupo', () => {
  const t = textoAmbigua([A, B])
  assert.match(t, /ER-0147/)
  assert.match(t, /Estructura/)
  assert.doesNotMatch(t, /\$|\d{3}\.\d{3}/)
  assert.doesNotMatch(TEXTO.AYUDA, /\$\s?\d/)
})

test('sólo reclama en su área; con foto rinde, sin foto explica', async () => {
  assert.equal(await especialista.reconoce('hola', { area: 'compras', fileIds: ['x'] }), null)
  assert.equal((await especialista.reconoce('', { area: 'rendicion', fileIds: ['x'] })).destino, 'rendir')
  assert.equal((await especialista.reconoce('cómo rindo', { area: 'rendicion', fileIds: [] })).destino, 'ayuda')
})

function portFalso({ canal = true, persona = 'p1', abiertas = [A] } = {}) {
  const q = []
  return {
    q,
    async query(sql, args) {
      q.push(sql)
      if (/comunicacion\.canales_area/.test(sql)) return { rows: canal ? [{ canal_nombre: 'Rendiciones' }] : [] }
      if (/comunicacion\.identidades/.test(sql)) return { rows: persona ? [{ perfil_id: 'u1', persona_id: persona }] : [{ perfil_id: 'u1', persona_id: null }] }
      if (/from public\.efectivo_entrega e/.test(sql)) return { rows: abiertas }
      return { rows: [] }
    },
  }
}
const actor = { plataforma_user_id: 'mm1', channel_id: 'ch1', root_post_id: 'post1' }

test('las puertas fallan cerrado ANTES de bajar un archivo: canal ajeno, sin legajo, sin entrega', async () => {
  for (const [port, estado] of [
    [portFalso({ canal: false }), 'rechazado_canal'],
    [portFalso({ persona: null }), 'rechazado_sin_persona'],
    [portFalso({ abiertas: [] }), 'rechazado_sin_entrega'],
    [portFalso({ abiertas: [A, C] }), 'pregunta_entrega'],
  ]) {
    const r = await especialista.atender({ texto: '', port, actor, fileIds: ['f1'], postId: 'post1' })
    assert.equal(r.estado, estado)
    assert.ok(!port.q.some((s) => /insert into public\.efectivo_comprobante/.test(s)), `${estado}: no registró nada`)
  }
})

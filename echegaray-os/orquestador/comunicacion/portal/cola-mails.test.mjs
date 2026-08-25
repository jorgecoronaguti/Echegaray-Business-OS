import test from 'node:test'
import assert from 'node:assert/strict'
import { enviarUno, procesarCola, sigueCorrespondiendo, filaDeMail } from './cola-mails.mjs'
import { habilitacionPortal } from './plantillas.mjs'

const MAIL = {
  id: 'm-1', para: 'maria@arcor.com', asunto: 'Tu acceso', cuerpo_html: '<p>hola</p>',
  plantilla: 'habilitacion_portal', intentos: 1,
}

function doblePort({ acceso = [{ revocado_at: null }], cola = [] } = {}) {
  const updates = []; const pend = [...cola]
  return {
    updates,
    async query(sql, params) {
      if (/from public\.cliente_acceso/.test(sql)) return { rows: acceso }
      if (/set estado = 'procesando'/.test(sql)) { const m = pend.shift(); return { rows: m ? [m] : [] } }
      updates.push({ sql, params }); return { rows: [] }
    },
  }
}
const dobleGmail = () => { const enviados = []; return { enviados, async gmailSend(a) { enviados.push(a); return { id: 'g1' } } } }

test('el cuerpo va como HTML: sin eso el cliente ve las etiquetas crudas', async () => {
  const g = dobleGmail()
  await enviarUno({ port: doblePort(), google: g, mail: MAIL })
  assert.equal(g.enviados[0].html, true)
  assert.equal(g.enviados[0].body, '<p>hola</p>')
  assert.equal(g.enviados[0].to, 'maria@arcor.com')
})

test('si el acceso se REVOCÓ entre el click y el envío, el mail NO sale', async () => {
  const g = dobleGmail()
  const port = doblePort({ acceso: [{ revocado_at: '2026-08-25T10:00:00Z' }] })
  const r = await enviarUno({ port, google: g, mail: MAIL })
  assert.equal(r, 'cancelado')
  assert.equal(g.enviados.length, 0, 'decirle «ya tenés acceso» a quien se lo acaban de sacar')
  assert.match(port.updates.at(-1).params[1], /revocó/)
})

test('si el acceso desapareció, tampoco sale', async () => {
  const g = dobleGmail()
  assert.equal(await enviarUno({ port: doblePort({ acceso: [] }), google: g, mail: MAIL }), 'cancelado')
  assert.equal(g.enviados.length, 0)
})

test('si no se puede confirmar el acceso, falla CERRADO: no se manda', async () => {
  const port = { async query(sql) { if (/cliente_acceso/.test(sql)) throw new Error('base caída'); return { rows: [] } } }
  const r = await sigueCorrespondiendo(port, MAIL)
  assert.equal(r.ok, false)
  assert.match(r.motivo, /no pude confirmar/)
})

test('la comprobación de revocación es sólo para la habilitación, no para el aviso de vencimiento', async () => {
  const r = await sigueCorrespondiendo(doblePort({ acceso: [] }), { ...MAIL, plantilla: 'aviso_vencimiento' })
  assert.equal(r.ok, true)
})

test('el estado se marca ANTES de enviar: un mail no se puede des-enviar', async () => {
  let orden = []
  const port = {
    async query(sql) {
      if (/cliente_acceso/.test(sql)) return { rows: [{ revocado_at: null }] }
      // El reciclado de colgados corre siempre al principio y no es parte del orden que se mide.
      if (/estado = 'procesando' and tomado_at/.test(sql)) return { rows: [] }
      if (/set estado = 'procesando'/.test(sql)) { orden.push('tomar'); return { rows: [MAIL] } }
      orden.push('cerrar'); return { rows: [] }
    },
  }
  const g = { enviados: [], async gmailSend(a) { orden.push('enviar'); this.enviados.push(a); return { id: 'x' } } }
  await procesarCola({ port, google: g, max: 1 })
  assert.deepEqual(orden.slice(0, 2), ['tomar', 'enviar'], 'se reserva la fila y recién ahí se manda')
})

test('una falla de Gmail con reintentos vuelve a pendiente; agotados, error terminal', async () => {
  const roto = { async gmailSend() { throw new Error('429 rate limit') } }
  const p1 = doblePort({ cola: [{ ...MAIL, intentos: 1 }] })
  await procesarCola({ port: p1, google: roto, max: 1 })
  assert.equal(p1.updates.at(-1).params[1], 'pendiente')

  const p2 = doblePort({ cola: [{ ...MAIL, intentos: 3 }] })
  await procesarCola({ port: p2, google: roto, max: 1 })
  assert.equal(p2.updates.at(-1).params[1], 'error')
})

test('filaDeMail normaliza el destinatario: el CHECK de la tabla exige minúsculas sin espacios', () => {
  const f = filaDeMail({
    para: '  Maria@ARCOR.com ', pedido_por: 'u1', cliente_id: 'c1',
    plantilla: habilitacionPortal({ para: 'maria@arcor.com', cliente_nombre: 'ARCOR', acceso_id: 'a1' }),
  })
  assert.equal(f.para, 'maria@arcor.com')
  assert.equal(f.plantilla, 'habilitacion_portal')
  assert.equal(f.clave_unica, 'habilitacion:a1')
  assert.ok(f.cuerpo_html.includes('<img'))
})

// LO QUE ESTAS PRUEBAS IMPIDEN: que la ficha del cliente diga que un mail salió cuando sólo se encoló.
// El 25/09/2026 decía «Invitación reenviada.» y ningún mail había salido nunca.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SIN_CUENTA, lecturaDelMail, mailsDeLaUltimaPublicacion, remitenteAnda, resumenAviso, textoEnCola,
  ultimoPorDestinatario, type MailCola,
} from './mailCola.ts'
import { SIN_CUENTA as SIN_CUENTA_WORKER } from '../../../../orquestador/comunicacion/portal/cola-mails.mjs'

const base: MailCola = {
  para: 'maria@arcor.com', estado: 'pendiente', pedido_at: '2026-09-25T18:00:00Z',
  enviado_at: null, error: null, clave_unica: null,
}

test('el motivo que escribe el worker es el que reconoce la web', () => {
  assert.equal(SIN_CUENTA, SIN_CUENTA_WORKER)
})

test('en cola NUNCA se lee como enviado', () => {
  for (const m of [base, { ...base, estado: 'procesando' as const }, { ...base, error: `${SIN_CUENTA} (administracion@ecsas.com.ar)` }]) {
    const l = lecturaDelMail(m)
    assert.doesNotMatch(l.texto, /enviad|reenviad|salió\b(?! )/)
    assert.match(l.texto, /en cola/)
    assert.equal(l.tono, 'warn')
  }
  assert.match(lecturaDelMail({ ...base, error: `${SIN_CUENTA} (x)` }).texto, /falta conectar la cuenta que envía/)
})

test('enviado se dice con la hora de San Juan; error, con el motivo', () => {
  const env = lecturaDelMail({ ...base, estado: 'enviado', enviado_at: '2026-09-25T17:43:00Z' })
  assert.equal(env.texto, 'mail enviado 25/09 14:43')
  assert.equal(env.tono, 'pos')
  const err = lecturaDelMail({ ...base, estado: 'error', error: 'el acceso se revocó después de encolar el mail' })
  assert.match(err.texto, /no salió: el acceso se revocó/)
  assert.equal(err.tono, 'neg')
})

test('«anda» exige evidencia: un envío real y ninguna fila trabada por falta de cuenta', () => {
  assert.equal(remitenteAnda(null, false), false, 'sin ningún envío en la historia no hay evidencia')
  assert.equal(remitenteAnda('2026-09-25T17:43:00Z', true), false)
  assert.equal(remitenteAnda('2026-09-25T17:43:00Z', false), true)
  assert.equal(textoEnCola(false), 'queda en cola; sale cuando esté conectada la cuenta que envía')
  assert.equal(textoEnCola(true, true), 'quedan en cola; salen en los próximos minutos')
})

test('el último mail por destinatario gana, venga en el orden que venga', () => {
  const viejo = { ...base, estado: 'enviado' as const, pedido_at: '2026-09-20T10:00:00Z', enviado_at: '2026-09-20T10:01:00Z' }
  const m = ultimoPorDestinatario([base, viejo])
  assert.equal(m.get('maria@arcor.com')?.estado, 'pendiente')
})

test('el aviso del esquema es el de la ÚLTIMA publicación, no la suma de todas', () => {
  const pub = (at: string, para: string, estado: MailCola['estado']): MailCola => ({
    ...base, para, estado, pedido_at: at, enviado_at: estado === 'enviado' ? at : null,
    clave_unica: `esquema:c1:${at}:${para}`,
  })
  const mails = [
    pub('2026-09-20T10:00:00.000Z', 'a@x.com', 'enviado'),
    pub('2026-09-25T18:00:00.000Z', 'a@x.com', 'pendiente'),
    pub('2026-09-25T18:00:00.000Z', 'b@x.com', 'pendiente'),
  ]
  const ultima = mailsDeLaUltimaPublicacion(mails)
  assert.equal(ultima.length, 2)
  const r = resumenAviso(ultima)
  assert.ok(r)
  assert.equal(r.tono, 'warn')
  assert.match(r.texto, /2 en cola, todavía sin salir/)
  assert.doesNotMatch(r.texto, /enviado/)
  assert.equal(resumenAviso([]), null)
})

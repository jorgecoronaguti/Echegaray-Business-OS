import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarMail, pareceMail } from './acceso.ts'

test('el mail se compara siempre normalizado', () => {
  assert.equal(normalizarMail('  Marta@LaEstrella.COM '), 'marta@laestrella.com')
  // Si esto fallara, el administrador cargaría uno y el cliente escribiría el otro.
  assert.equal(normalizarMail('M.RUIZ@x.com'), normalizarMail('m.ruiz@x.com'))
})

test('lo que no parece un mail no llega ni a consultar la base', () => {
  assert.ok(pareceMail('m.ruiz@laestrella.com'))
  for (const malo of ['', 'marta', 'marta@', '@x.com', 'a b@x.com', 'marta@x']) {
    assert.equal(pareceMail(malo), false, `${malo} pasó`)
  }
})


// EL CUERPO HTML DEL PORTAL. Sin esto, el cliente recibía las etiquetas crudas en pantalla:
// `buildRawEmail` fijaba `Content-Type: text/plain` para todo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRawEmail } from './google.mjs'

const decodificar = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

const base = { to: 'maria@arcor.com', subject: 'Tu acceso', body: '<p>Hola <b>María</b></p>' }

test('con html:true el mensaje declara text/html', () => {
  const mime = decodificar(buildRawEmail({ ...base, html: true }))
  assert.match(mime, /Content-Type: text\/html; charset="UTF-8"/)
  assert.ok(!/Content-Type: text\/plain/.test(mime), 'no puede quedar el text/plain viejo')
  assert.match(mime, /<p>Hola <b>María<\/b><\/p>/)
})

test('SIN el flag sigue siendo text/plain — el cambio es retrocompatible', () => {
  // Todos los llamadores que ya existían (el chat, los reportes) no pasan `html`.
  const mime = decodificar(buildRawEmail({ ...base, body: 'texto pelado' }))
  assert.match(mime, /Content-Type: text\/plain; charset="UTF-8"/)
  assert.ok(!/text\/html/.test(mime))
})

test('con adjuntos el tipo del CUERPO también respeta el flag, no sólo el caso simple', () => {
  const adj = [{ filename: 'a.pdf', mimeType: 'application/pdf', dataBase64: 'AAAA' }]
  const conHtml = decodificar(buildRawEmail({ ...base, html: true, attachments: adj }))
  assert.match(conHtml, /Content-Type: multipart\/mixed/)
  assert.match(conHtml, /Content-Type: text\/html; charset="UTF-8"/)

  const sinHtml = decodificar(buildRawEmail({ ...base, attachments: adj }))
  assert.match(sinHtml, /Content-Type: text\/plain; charset="UTF-8"/)
})

test('el asunto con acentos viaja en encoded-word, no crudo', () => {
  const mime = decodificar(buildRawEmail({ ...base, subject: 'Vencimiento del día 1° — Certificación' }))
  assert.match(mime, /Subject: =\?UTF-8\?B\?/)
})

test('un destinatario inválido corta con error claro en vez de mandar a una dirección rota', () => {
  assert.throws(() => buildRawEmail({ to: 'juan@gmail', subject: 'x', body: 'y' }), /destinatario inválido/)
  assert.throws(() => buildRawEmail({ to: '', subject: 'x', body: 'y' }), /falta el destinatario/)
})

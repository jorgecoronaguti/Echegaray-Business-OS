import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarMail, pareceMail, generarCodigo, hashearCodigo, codigoCoincide, evaluarCodigo,
  venceEn, INTENTOS_MAX,
} from './acceso.ts'

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

test('el código es de seis dígitos, con ceros a la izquierda incluidos', () => {
  for (let i = 0; i < 400; i++) assert.match(generarCodigo(), /^\d{6}$/)
})

test('el hash va salado con el mail: dos personas con el mismo código no comparten hash', () => {
  assert.notEqual(hashearCodigo('a@x.com', '123456'), hashearCodigo('b@x.com', '123456'))
  assert.equal(hashearCodigo('A@X.com', '123456'), hashearCodigo('a@x.com', '123456'))
  // Y el código NO se puede leer del hash.
  assert.doesNotMatch(hashearCodigo('a@x.com', '123456'), /123456/)
})

test('el código correcto entra y el de al lado no', () => {
  const h = hashearCodigo('a@x.com', '004321')
  assert.ok(codigoCoincide('a@x.com', '004321', h))
  assert.equal(codigoCoincide('a@x.com', '004322', h), false)
  assert.equal(codigoCoincide('otro@x.com', '004321', h), false)
})

const fila = (extra = {}) => ({
  hash: hashearCodigo('a@x.com', '111111'),
  vence_en: venceEn(),
  usado_en: null as Date | null,
  intentos: 0,
  ...extra,
})

test('sin código guardado no se entra — y el motivo no revela si el mail existe', () => {
  assert.deepEqual(evaluarCodigo(null, 'a@x.com', '111111'), { ok: false, motivo: 'vencido' })
})

test('un código ya usado no vuelve a servir', () => {
  assert.deepEqual(evaluarCodigo(fila({ usado_en: new Date() }), 'a@x.com', '111111'), { ok: false, motivo: 'usado' })
})

test('vencido es vencido aunque el código sea el bueno', () => {
  const viejo = fila({ vence_en: new Date(Date.now() - 1000) })
  assert.deepEqual(evaluarCodigo(viejo, 'a@x.com', '111111'), { ok: false, motivo: 'vencido' })
})

test('el tope de intentos se mira ANTES de comparar', () => {
  // Si se mirara después, cada intento fallido seguiría regalando una comparación: el tope no frena
  // nada y seis dígitos se barren igual.
  const quemado = fila({ intentos: INTENTOS_MAX })
  assert.deepEqual(evaluarCodigo(quemado, 'a@x.com', '111111'), { ok: false, motivo: 'quemado' },
    'con el código CORRECTO y el tope alcanzado, no entra')
})

test('el camino feliz', () => {
  assert.deepEqual(evaluarCodigo(fila(), 'a@x.com', '111111'), { ok: true })
})

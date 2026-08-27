import test from 'node:test'
import assert from 'node:assert/strict'
import { navegar, validarGuion } from './navegador-web.mjs'

test('el navegador no completa credenciales, lo pida quien lo pida', () => {
  const casos = [
    [{ accion: 'ir', url: 'https://banco.example' }, { accion: 'escribir', selector: '#password', texto: 'hola' }],
    [{ accion: 'ir', url: 'https://banco.example' }, { accion: 'escribir', selector: '#usuario', texto: 'mi contraseña es 1234' }],
    [{ accion: 'ir', url: 'https://x.example' }, { accion: 'escribir', selector: 'input[name=token]', texto: 'abc' }],
  ]
  for (const g of casos) {
    const r = validarGuion(g)
    assert.equal(r.ok, false)
    assert.match(r.motivo, /no completa campos de credenciales/)
  }
})

test('el guión no puede llevar el navegador a la red interna', () => {
  assert.match(validarGuion([{ accion: 'ir', url: 'http://localhost:3000/api/caja' }]).motivo, /red interna/)
  assert.match(validarGuion([{ accion: 'ir', url: 'http://169.254.169.254/' }]).motivo, /red interna/)
})

test('el guión está acotado: empieza yendo, acciones conocidas y tope de pasos', () => {
  assert.match(validarGuion([]).motivo, /vac[íi]o/)
  assert.match(validarGuion([{ accion: 'click', selector: 'a' }]).motivo, /primer paso/)
  assert.match(validarGuion([{ accion: 'ir', url: 'https://x.example' }, { accion: 'evaluar', js: 'fetch("/robar")' }]).motivo, /acción desconocida/)
  assert.match(validarGuion([{ accion: 'ir', url: 'https://x.example' }, { accion: 'click' }]).motivo, /necesita selector/)
  const largo = [{ accion: 'ir', url: 'https://x.example' }, ...Array.from({ length: 20 }, () => ({ accion: 'esperar', ms: 10 }))]
  assert.match(validarGuion(largo).motivo, /el máximo es/)
})

test('un guión válido pasa la barrera', () => {
  const r = validarGuion([
    { accion: 'ir', url: 'https://www.argentina.gob.ar/normativa' },
    { accion: 'escribir', selector: '#q', texto: 'CIRSOC 201' },
    { accion: 'click', selector: 'button[type=submit]' },
    { accion: 'esperar', ms: 2000 },
    { accion: 'captura' },
  ])
  assert.equal(r.ok, true)
})

test('un guión rechazado NUNCA llega a abrir un navegador', async () => {
  // Si la barrera se saltease, esto tardaría segundos y levantaría Chromium. Devuelve el motivo.
  const r = await navegar([{ accion: 'ir', url: 'file:///etc/passwd' }])
  assert.match(r.error, /guión rechazado/)
})

// ArmarRecibo ofrece DOS acciones y FirmoEnPapel abre la cámara del teléfono. Se lee el fuente (el repo no
// monta componentes en node --test; misma técnica que `canonico-cliente-ficha-v2.test.ts`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
const armar = leer('./ArmarRecibo.tsx')

test('el recibo se arma con exactamente dos acciones: guardar e imprimir, y mandar al teléfono', () => {
  const botones = armar.match(/<button\b/g) ?? []
  assert.equal(botones.length, 2)
  assert.match(armar, /data-testid="recibo-guardar-imprimir"[\s\S]*?Guardar e imprimir/)
  assert.match(armar, /data-testid="recibo-enviar-a-firmar"[\s\S]*?Mandar al teléfono para firmar/)
})

test('no vuelven las opciones que imprimían sin dejar rastro', () => {
  for (const muerto of ['recibo-imprimir"', 'recibo-pdf"', 'Imprimir sin registrar', 'Guardar PDF', 'Aceptar e imprimir']) {
    assert.ok(!armar.includes(muerto), `volvió «${muerto}»`)
  }
})

test('Guardar e imprimir sella en el legajo ANTES de abrir la impresión', () => {
  const f = armar.slice(armar.indexOf('const aceptarEImprimir'))
  assert.ok(f.indexOf('aceptarRecibo(') < f.indexOf('imprimir()'))
})

test('los dos botones se apilan a ancho completo en 390 px (flex-basis 220 con wrap)', () => {
  assert.equal((armar.match(/flex: '1 1 220px'/g) ?? []).length, 2)
})

test('«Firmó en papel» abre la cámara trasera y ofrece marcar sin foto', () => {
  const papel = leer('../../FirmoEnPapel.tsx')
  assert.match(papel, /capture="environment"/)
  assert.match(papel, /data-testid="recibo-papel-sin-foto"/)
  assert.match(papel, /minHeight: 44/)
  const lista = leer('../../RecibosEmitidos.tsx')
  assert.match(lista, /\(r\.estado === 'emitido' \|\| r\.estado === 'enviado'\) && !estaFirmado\(r\)/)
})

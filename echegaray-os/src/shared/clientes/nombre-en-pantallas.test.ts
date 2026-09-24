// EL NOMBRE DE UN CLIENTE SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026). La regla, en `nombre.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clienteDeObra, nombreDeCliente } from './nombre.ts'

test('el cliente se llama por su nombre comercial; sin él, por su razón social', () => {
  assert.equal(nombreDeCliente({ nombre_comercial: 'Franco Quattropani', razon_social: 'Melisa García SAS' }), 'Franco Quattropani')
  assert.equal(nombreDeCliente({ nombre_comercial: '  ', razon_social: 'Inter Motor SRL' }), 'Inter Motor SRL')
  assert.equal(nombreDeCliente({ nombre_comercial: 'ARCOR' }), 'ARCOR', 'lo curado por una persona no se reescribe')
  assert.equal(nombreDeCliente(null), null)
})

test('la obra dice el cliente VINCULADO; la etiqueta de planilla sólo cuando no hay vínculo', () => {
  assert.equal(clienteDeObra({ cliente_nombre: 'Messina', cliente_texto: 'Messinas' }), 'Messina')
  assert.equal(clienteDeObra({ cliente_nombre: 'Franco Quattropani', cliente_texto: 'Quattropani - Melisa García SAS' }), 'Franco Quattropani')
  assert.equal(clienteDeObra({ cliente_nombre: null, cliente_texto: ' Galpones ' }), 'Galpones')
  assert.equal(clienteDeObra({ cliente_nombre: null, cliente_texto: null }), null)
})

const SRC = new URL('../../', import.meta.url).pathname
const PROPIOS = new Set(['shared/clientes/nombre.ts', 'shared/clientes/nombresDeClientes.ts'])
// El portal y la solapa Cobranzas de la ficha los trabajan otros frentes (24/09).
const FUERA = /^(app\/portal|features\/portal|features\/clientes\/components\/cobranzas)\//

function hallazgos(re: RegExp, salvo?: RegExp): string[] {
  const out: string[] = []
  for (const f of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
    if (!/\.(ts|tsx)$/.test(f) || /\.test\.tsx?$/.test(f) || PROPIOS.has(f) || FUERA.test(f)) continue
    readFileSync(join(SRC, f), 'utf8').split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l) || /\/\/ crudo:/.test(l)) return
      if (re.test(l) && !(salvo && salvo.test(l))) out.push(`${f}:${i + 1}  ${l.trim().slice(0, 110)}`)
    })
  }
  return out
}

test('ninguna pantalla elige por su cuenta entre el cliente vinculado y la etiqueta de la planilla', () => {
  assert.deepEqual(hallazgos(/cliente_nombre\s*\?\?\s*[\w?.]*cliente_texto/), [], 'usar clienteDeObra()')
  assert.deepEqual(hallazgos(/\bcliente:\s*\(?[\w?.]*\.cliente_texto\b/, /clienteDeObra/), [], 'cliente_texto como nombre del cliente: usar el vinculado')
})

test('el slug nunca se dibuja como nombre del cliente', () => {
  assert.deepEqual(hallazgos(/(Nombre|nombre)\w*:?\s*[^,]*\?\?\s*[\w?.]*cliente_slug\b/), [])
})

test('nadie publica `nombre_comercial` crudo como nombre: pasa por nombreDeCliente / nombresDeClientes', () => {
  assert.deepEqual(hallazgos(/\[\s*\w+\.id,\s*\w+\.nombre_comercial\s*\]|\bnombre:\s*[^,]*\.nombre_comercial\b/, /nombreDeCliente/), [])
})

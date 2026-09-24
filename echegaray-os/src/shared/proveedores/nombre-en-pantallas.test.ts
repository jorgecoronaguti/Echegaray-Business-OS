// EL NOMBRE DE UN PROVEEDOR SE ESCRIBE EN UN SOLO LUGAR (dueño, 24/09/2026). La regla, en `nombre.ts`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { claveCuit, nombreDeProveedor, nombrePorCuit } from './nombre.ts'

test('el CUIT es la identidad: se compara por sus 11 dígitos, con o sin guiones', () => {
  assert.equal(claveCuit('27-36911157-4'), '27369111574')
  assert.equal(claveCuit(' 30716490498 '), '30716490498')
  assert.equal(claveCuit('123'), null, 'un número que no es un CUIT no identifica a nadie')
  assert.equal(claveCuit(null), null)
})

test('el papel de ARCA dice el titular; la pantalla dice el nombre del maestro para ese CUIT', () => {
  const maestro = new Map([['27369111574', 'Corralon Progreso']])
  assert.equal(nombrePorCuit(maestro, '27-36911157-4', 'PEREZ GARCIA MARISOL BIBIANA'), 'Corralon Progreso')
  assert.equal(nombrePorCuit(maestro, '30999999990', 'OTRO SRL'), 'OTRO SRL', 'sin maestro para ese CUIT, el papel')
  assert.equal(nombrePorCuit(maestro, null, '  '), null)
  assert.equal(nombreDeProveedor({ nombre: ' ', razon_social: 'TELEFONICA MOVILES ARGENTINA SA' }), 'TELEFONICA MOVILES ARGENTINA SA')
})

const SRC = new URL('../../', import.meta.url).pathname

test('ninguna pantalla pone al titular de ARCA como nombre del proveedor (va al lado, como detalle)', () => {
  const out: string[] = []
  for (const f of readdirSync(SRC, { recursive: true, encoding: 'utf8' })) {
    if (!f.endsWith('.tsx') || /\.test\.tsx?$/.test(f) || /^(app|features)\/portal\//.test(f)) continue
    readFileSync(join(SRC, f), 'utf8').split('\n').forEach((l, i) => {
      if (/\{\s*[\w.?]*emisor_nombre[^}]*(\|\||\?\?)/.test(l) && !/!==\s*[\w.?]*proveedor/.test(l)) out.push(`${f}:${i + 1}  ${l.trim()}`)
    })
  }
  assert.deepEqual(out, [], 'usar el proveedor resuelto por CUIT (nombrePorCuit)')
})

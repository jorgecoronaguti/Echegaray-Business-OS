import test from 'node:test'
import assert from 'node:assert/strict'
import { esVistaCartera, separarArchivados } from './cartera.ts'

// `separarArchivados` y `totalesCartera` los prueba también `orquestador/lib/cliente-cartera.test.mjs`,
// que es más viejo que este archivo. Acá se prueba SÓLO lo que la pantalla decide hoy.

test('archivar tiene efecto: el archivado sale de la lista y se puede contar aparte', () => {
  const partido = separarArchivados([
    { cliente_id: 'a', activo: true }, { cliente_id: 'b', activo: false },
  ])
  assert.deepEqual(partido.activos.map((c) => c.cliente_id), ['a'])
  assert.deepEqual(partido.archivados.map((c) => c.cliente_id), ['b'])
})

// ═══ «DATOS FALTANTES» YA NO ES UNA VISTA (10/09/2026) ═══
//
// El dueño mandó sacar dos veces las aclaraciones «sin teléfono · sin contrato · sin jefe · sin
// medir» de la pantalla de clientes («quiero info precisa»), y el filtro las devolvía: contaba a
// los clientes por lo que les falta sin que nada en pantalla dijera qué era.
//
// LO QUE ATRAPA ESTE TEST: que alguien vuelva a admitir `?vista=sin-datos`. Sin él, agregar la
// clave al arreglo compila y la pantalla vuelve a recortar por un criterio que dejó de existir.

test('`?vista=sin-datos` dejó de ser una vista y no vuelve por la URL', () => {
  assert.equal(esVistaCartera('sin-datos'), false)
  assert.equal(esVistaCartera('todo'), true)
  assert.equal(esVistaCartera('activos'), true)
  assert.equal(esVistaCartera(undefined), false)
  assert.equal(esVistaCartera('cualquiera'), false)
})

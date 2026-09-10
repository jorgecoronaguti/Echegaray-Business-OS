import test from 'node:test'
import assert from 'node:assert/strict'
import { clasificar } from './censo-carpetas.mjs'

// EL DEFECTO: un LEFT JOIN sin coincidencia devuelve las columnas en NULL, no una fila ausente.
// Tratar ese `trashed: null` como «la carpeta está viva» clasificaría como `ok` a una obra cuya
// carpeta el catálogo no conoce — y el censo diría que no falta nada.
test('la carpeta declarada que el join no encontró es no_indexada, no ok', () => {
  const [r] = clasificar('obra', [{
    id: 'o1', nombre: 'ME - BSA', carpeta_id: 'CARP9',
    path: null, trashed: null, ausente_en_drive: null, web_view_link: null, archivos: '0',
  }])
  assert.equal(r.estado, 'no_indexada')
})

test('sin carpeta declarada el censo dice sin_declarar y no inventa una consulta', () => {
  const [r] = clasificar('obra', [{
    id: 'o2', nombre: 'ME - PLAYÓN', carpeta_id: null,
    path: null, trashed: null, ausente_en_drive: null, web_view_link: null, archivos: null,
  }])
  assert.equal(r.estado, 'sin_declarar')
  assert.equal(r.archivos, 0)
})

test('la carpeta viva se cuenta con sus archivos, y el conteo llega como texto desde pg', () => {
  const [r] = clasificar('cliente', [{
    id: 'c1', nombre: 'Messina', carpeta_id: 'CARP1',
    path: 'administracion/PRESUPUESTOS - CLIENTES/MESSINA', trashed: false, ausente_en_drive: false,
    web_view_link: null, archivos: '139',
  }])
  assert.equal(r.estado, 'ok')
  assert.equal(r.archivos, 139)
})

// Una carpeta en la papelera se lee vacía: el censo tiene que separarla de «no tiene archivos».
test('la carpeta en la papelera no se cuenta como viva aunque el join la haya encontrado', () => {
  const [r] = clasificar('persona', [{
    id: 'p1', nombre: 'X', carpeta_id: 'CARP1', path: 'a/b', trashed: true,
    ausente_en_drive: false, web_view_link: null, archivos: '0',
  }])
  assert.equal(r.estado, 'en_papelera')
})

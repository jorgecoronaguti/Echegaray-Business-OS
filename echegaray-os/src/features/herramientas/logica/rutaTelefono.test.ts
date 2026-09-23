import test from 'node:test'
import assert from 'node:assert/strict'
import { rutaTelefonoDeHerramientas as r } from './rutaTelefono.ts'

test('cada ruta de escritorio de Herramientas tiene su equivalente de teléfono', () => {
  assert.equal(r('/herramientas'), '/campo/herramientas')
  assert.equal(r('/herramientas/inventario'), '/campo/herramientas/buscar')
  assert.equal(r('/herramientas/inventario', '?activo=ALA-004'), '/campo/herramientas/a/ALA-004')
  assert.equal(r('/herramientas/ubicaciones'), '/campo/herramientas')
  assert.equal(r('/herramientas/ubicaciones', '?u=obra:OB-0008'), '/campo/herramientas/lugar?en=obra%3AOB-0008')
  assert.equal(r('/herramientas/movimientos'), '/campo/herramientas/movimientos')
  assert.equal(r('/herramientas/mantenimiento', '?revision=FOR-001'), '/campo/herramientas/a/FOR-001/revision')
  assert.equal(r('/herramientas/mantenimiento'), '/campo/herramientas')
  assert.equal(r('/herramientas/etiquetas'), '/campo/herramientas')
  assert.equal(r('/administracion/compras'), null, 'lo que no es Herramientas no se toca')
})

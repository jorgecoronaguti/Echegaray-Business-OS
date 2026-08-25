// LA LUPA DEL HEADER, PROBADA SIN NAVEGADOR.
//
// Las tres reglas que se ejercitan son las que hacen que un buscador MIENTA:
//
//   1. «Nada coincide» dicho mientras la consulta todavía viaja afirma un resultado que nadie leyó.
//   2. «Nada coincide» dicho después de un error afirma que el dato no existe cuando lo que pasó fue
//      que no se pudo mirar (`control-que-no-pudo-mirar`).
//   3. Un encabezado de maestro sobre cero filas empuja fuera de la vista al único hallazgo real.

import test from 'node:test'
import assert from 'node:assert/strict'
import { agrupar, estadoDeLupa, leyenda, MINIMO } from './buscadorGlobal.ts'
import type { Hallazgo } from './entradaService.ts'

const h = (maestro: Hallazgo['maestro'], nombre: string): Hallazgo => ({
  clave: `${maestro}-${nombre}`, nombre, detalle: null, maestro, href: '/x',
})

test('mientras la consulta viaja NO se dice «nada coincide»', () => {
  // El defecto: `hallazgos.length === 0` es cierto durante todo el viaje de la primera tecla, y con
  // esa sola condición el desplegable afirma que la persona no está cargada antes de haber mirado.
  assert.equal(estadoDeLupa({ q: 'agu', cargando: true, error: null, hallazgos: [] }), 'buscando')
  assert.equal(estadoDeLupa({ q: 'agu', cargando: false, error: null, hallazgos: null }), 'buscando')
  assert.equal(estadoDeLupa({ q: 'agu', cargando: false, error: null, hallazgos: [] }), 'sin_resultados')
})

test('un error NO se dibuja como «no hay nada»: un control que no pudo mirar no dice «no está»', () => {
  const e = estadoDeLupa({ q: 'corralon', cargando: false, error: 'permission denied', hallazgos: [] })
  assert.equal(e, 'error')
  assert.equal(leyenda(e, 'corralon', 'permission denied'), 'permission denied')
  assert.notEqual(leyenda(e, 'corralon', 'permission denied'), 'Nada se llama «corralon».')
})

test('con menos del mínimo se explica el mínimo, no se contesta que no hay', () => {
  assert.equal(estadoDeLupa({ q: 'a', cargando: false, error: null, hallazgos: null }), 'corto')
  assert.equal(leyenda('corto', 'a', null), `Escribí al menos ${MINIMO} letras.`)
  assert.equal(estadoDeLupa({ q: '   ', cargando: false, error: null, hallazgos: null }), 'inicio')
})

test('con resultados no hay leyenda: la lista habla sola', () => {
  const e = estadoDeLupa({ q: 'agu', cargando: false, error: null, hallazgos: [h('Persona', 'Agüero')] })
  assert.equal(e, 'con_resultados')
  assert.equal(leyenda(e, 'agu', null), null)
})

test('los grupos vacíos no se dibujan, y el orden no depende del resultado', () => {
  const g = agrupar([h('Proveedor', 'Corralón Sur'), h('Cliente', 'Messina'), h('Proveedor', 'Corralón Norte')])
  assert.deepEqual(g.map((x) => x.maestro), ['Cliente', 'Proveedor'], 'Persona no tuvo hallazgos: no va')
  assert.deepEqual(g.map((x) => x.titulo), ['Clientes', 'Proveedores'])
  assert.equal(g[1].hallazgos.length, 2)
  assert.deepEqual(agrupar([]), [])
})

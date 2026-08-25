import test from 'node:test'
import assert from 'node:assert/strict'
import { armarSenales, resumirTrabajo } from './senalesProveedores.ts'

// LO QUE ESTOS TESTS ATRAPAN es el defecto de la primera línea de la pantalla, que es la línea que
// decide qué se hace hoy en Administración. Los tres modos de falla, en orden de daño:
//
//   1. Una lectura que falló dibujada como «no hay nada pendiente». Es el peor: la pantalla se ve
//      idéntica a la de una empresa al día. Si alguien vuelve a escribir `if (n > 0)` sobre un
//      número que puede ser `null`, la señal desaparece y estos tests se ponen rojos.
//   2. Una fila que cuenta pero no dice qué bloquea ni trae verbo: vuelve a ser el chip que el
//      patrón v2 salió a reemplazar.
//   3. Un verbo que aterriza en la pantalla en general en vez del filtro que produjo el número.

const HREFS = { sinCuit: '/administracion/proveedores?cuit=falta', sinResolver: '/administracion/proveedores?vista=resolver' }
const ok = (n: number) => ({ data: n, error: null })
const roto = { data: null, error: 'permission denied for view' }

test('una lectura que FALLÓ se dibuja igual, con la cifra en ausencia — no se omite', () => {
  const s = armarSenales(roto, ok(0), HREFS)
  assert.equal(s.length, 1, 'la señal desapareció: la pantalla afirmaría que no hay nada sin CUIT')
  assert.equal(s[0].numero, null)
  assert.notEqual(s[0].numero, 0)
  assert.match(s[0].bloquea, /no puede afirmar/i)
})

test('las dos lecturas rotas dan DOS señales, ninguna silenciosa', () => {
  const s = armarSenales(roto, roto, HREFS)
  assert.equal(s.length, 2)
  assert.deepEqual(s.map((x) => x.numero), [null, null])
})

test('cero NO se dibuja: nada que resolver es silencio normal', () => {
  assert.deepEqual(armarSenales(ok(0), ok(0), HREFS), [])
})

test('cada señal trae QUÉ BLOQUEA y su VERBO — no un chip que cuenta', () => {
  const s = armarSenales(ok(14), ok(82), HREFS)
  assert.equal(s.length, 2)
  for (const x of s) {
    assert.ok(x.bloquea.length > 12, `la señal ${x.clave} no dice qué bloquea`)
    assert.ok(x.accion.length > 0, `la señal ${x.clave} no trae verbo`)
    // El verbo es una acción, no un sustantivo ni un «Ver».
    assert.doesNotMatch(x.accion, /^ver$/i)
  }
  assert.equal(s[0].bloquea, 'No cruzan con ARCA ni con el banco')
  assert.equal(s[1].bloquea, 'El gasto queda fuera de la cuenta del proveedor')
})

test('el verbo aterriza en el FILTRO que produjo el número, no en la pantalla', () => {
  const s = armarSenales(ok(14), ok(82), HREFS)
  assert.equal(s[0].href, HREFS.sinCuit)
  assert.equal(s[1].href, HREFS.sinResolver)
  // Un href pelado a la ruta sería el defecto: cae en la lista completa.
  for (const x of s) assert.notEqual(x.href, '/administracion/proveedores')
})

test('una sola señal habla en singular: «1 proveedor sin CUIT», «No cruza»', () => {
  const s = armarSenales(ok(1), ok(1), HREFS)
  assert.equal(s[0].texto, 'proveedor sin CUIT')
  assert.equal(s[0].bloquea, 'No cruza con ARCA ni con el banco')
  assert.equal(s[1].texto, 'nombre de Compras sin resolver')
})

test('el resumen suma los registros de las señales contadas', () => {
  assert.equal(resumirTrabajo(armarSenales(ok(14), ok(82), HREFS)), '2 señales · 96 registros')
  assert.equal(resumirTrabajo(armarSenales(ok(1), ok(0), HREFS)), '1 señal · 1 registro')
  assert.equal(resumirTrabajo([]), 'nada pendiente')
})

test('con una señal sin contar, el resumen dice que el total es un PISO', () => {
  // El defecto: publicar «2 señales · 82 registros» cuando uno de los dos no se pudo contar da un
  // total con forma de completo sobre una suma que le falta un sumando.
  const r = resumirTrabajo(armarSenales(roto, ok(82), HREFS))
  assert.equal(r, '2 señales · al menos 82 registros')
  assert.doesNotMatch(r, /^2 señales · 82/)
})

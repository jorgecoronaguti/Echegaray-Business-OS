import { test } from 'node:test'
import assert from 'node:assert/strict'
import { esEleccionDeVista } from './vistaRecordada.ts'

// UNA PRECARGA NO ES UNA ELECCIÓN.
//
// Next precarga todos los `<Link>` visibles, y cada precarga es un GET a esa URL. La barra de
// filtros tiene seis pastillas: sin este filtro el navegador guardaba seis preferencias sin que
// nadie tocara nada, y la última en llegar ganaba. Medido contra producción el 19/08: se elegía
// «Terminación» y la vista volvía con `etapa=inicio` o con la pastilla «Todas».
//
// En desarrollo no se reproducía —ahí la precarga es mucho menos agresiva—, así que el defecto sólo
// existía donde el dueño lo iba a usar. Por eso la regla se prueba acá, sin navegador.

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null })

test('una navegación de verdad se guarda', () => {
  assert.equal(esEleccionDeVista('GET', h({})), true)
})

test('una navegación de cliente TAMBIÉN se guarda: la produce alguien tocando algo', () => {
  // Con el árbol de estado: viene de una pantalla, o sea que alguien tocó algo.
  assert.equal(esEleccionDeVista('GET', h({ rsc: '1', 'next-router-state-tree': '%5B%22%22%5D' })), true)
})

test('una precarga NO se guarda, en ninguna de sus formas', () => {
  assert.equal(esEleccionDeVista('GET', h({ 'next-router-prefetch': '1' })), false)
  // Next 16 precarga por SEGMENTO y esa variante no manda la cabecera de arriba.
  assert.equal(esEleccionDeVista('GET', h({ 'next-router-segment-prefetch': '/_index' })), false)
  assert.equal(esEleccionDeVista('GET', h({ purpose: 'prefetch' })), false)
  assert.equal(esEleccionDeVista('GET', h({ 'x-purpose': 'preview' })), false)
})

test('un pedido RSC SIN árbol de estado es una precarga aunque no lo diga', () => {
  // El candado que no depende de que Next mantenga el nombre de sus cabeceras: una navegación real
  // viene de algún lado y lo declara; una precarga no viene de ningún lado.
  assert.equal(esEleccionDeVista('GET', h({ rsc: '1' })), false)
})

test('una precarga que además es RSC sigue siendo precarga', () => {
  assert.equal(esEleccionDeVista('GET', h({ rsc: '1', 'next-router-prefetch': '1' })), false)
})

test('lo que no es GET no elige nada', () => {
  assert.equal(esEleccionDeVista('POST', h({})), false)
})

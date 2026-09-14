// LOS DOS DEFECTOS QUE ESTE TEST ATRAPA, Y SON OPUESTOS:
//
//   1. NO PRENDER cuando el clic sí navega  → la pantalla se queda quieta y el dueño vuelve a
//      escribir *"no responde, no se mueve, nada"*. Es el defecto original.
//   2. PRENDER cuando el clic NO navega     → una barra de progreso corriendo para siempre arriba de
//      una pantalla que nunca va a cambiar. Es el defecto que introduce el arreglo si se escribe a
//      la ligera, y enseña a ignorar la única señal de carga que tiene el sistema.

import test from 'node:test'
import assert from 'node:assert/strict'
import { abreNavegacionInterna, pedidoVigente, type PedidoDeNavegacion } from './navegacion.ts'

// Reproduce la secuencia de rutas que ve el componente render a render, aplicando lo que él aplica.
function recorrer(pedido: PedidoDeNavegacion | null, rutas: string[]): boolean[] {
  return rutas.map((ruta) => {
    pedido = pedidoVigente(pedido, ruta)
    return pedido !== null
  })
}

test('ATRÁS al origen no revive el indicador de una navegación ya cumplida', () => {
  const pedido = { desde: '/clientes?', n: 1 }
  // clic en /clientes (espera) → llega la ficha → ATRÁS vuelve a /clientes
  assert.deepEqual(recorrer(pedido, ['/clientes?', '/clientes/quattropani?', '/clientes?']), [true, false, false])
})

test('mientras la ruta no cambia, el pedido sigue vigente: la navegación lenta se sigue viendo', () => {
  const pedido = { desde: '/os?', n: 1 }
  assert.deepEqual(recorrer(pedido, ['/os?', '/os?', '/os?']), [true, true, true])
  assert.equal(pedidoVigente(null, '/os?'), null)
})

const ACTUAL = 'https://app.ecsas.com.ar/os'
const clic = (parcial: Partial<Parameters<typeof abreNavegacionInterna>[0]>) =>
  abreNavegacionInterna({ href: null, urlActual: ACTUAL, botonPrincipal: true, ...parcial })

test('un clic en un link interno a otra ruta prende el indicador', () => {
  for (const href of ['/obras', '/obras/le-comedor', 'https://app.ecsas.com.ar/clientes', '/obras?archivadas=1']) {
    assert.equal(clic({ href }), true, `no prendió para ${href}`)
  }
})

test('el link relativo se resuelve contra la ruta actual', () => {
  assert.equal(abreNavegacionInterna({ href: 'gantt', urlActual: 'https://app.ecsas.com.ar/obras', botonPrincipal: true }), true)
})

test('no prende cuando el clic abre otra pestaña: la pantalla actual no cambia', () => {
  assert.equal(clic({ href: '/obras', conModificador: true }), false)
  assert.equal(clic({ href: '/obras', botonPrincipal: false }), false)
  assert.equal(clic({ href: '/obras', target: '_blank' }), false)
})

test('no prende con descarga, protocolo ajeno ni sitio externo', () => {
  assert.equal(clic({ href: '/api/descargas/informe.pdf', descarga: true }), false)
  assert.equal(clic({ href: 'mailto:jorge@ecsas.com.ar' }), false)
  assert.equal(clic({ href: 'tel:+542645550000' }), false)
  assert.equal(clic({ href: 'https://docs.google.com/spreadsheets/d/abc' }), false)
})

test('no prende si el destino es la ruta donde ya estoy — incluido el ancla de la misma página', () => {
  assert.equal(clic({ href: '/os' }), false)
  assert.equal(clic({ href: '#pendientes' }), false)
  assert.equal(abreNavegacionInterna({
    href: '/obras?archivadas=1',
    urlActual: 'https://app.ecsas.com.ar/obras?archivadas=1',
    botonPrincipal: true,
  }), false)
})

test('no prende si otro ya se hizo cargo del clic, ni sin href', () => {
  assert.equal(clic({ href: '/obras', yaPrevenido: true }), false)
  assert.equal(clic({ href: null }), false)
})

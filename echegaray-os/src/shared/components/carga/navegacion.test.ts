// LOS DOS DEFECTOS QUE ESTE TEST ATRAPA, Y SON OPUESTOS:
//
//   1. NO PRENDER cuando el clic sí navega  → la pantalla se queda quieta y el dueño vuelve a
//      escribir *"no responde, no se mueve, nada"*. Es el defecto original.
//   2. PRENDER cuando el clic NO navega     → una barra de progreso corriendo para siempre arriba de
//      una pantalla que nunca va a cambiar. Es el defecto que introduce el arreglo si se escribe a
//      la ligera, y enseña a ignorar la única señal de carga que tiene el sistema.

import test from 'node:test'
import assert from 'node:assert/strict'
import { abreNavegacionInterna } from './navegacion.ts'

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

// LAS DOS MITADES DEL CONSENTIMIENTO DE GOOGLE TIENEN QUE SER PÚBLICAS.
//
// El 21/08/2026 sólo lo era la vuelta. `/api/oauth/start` —la IDA— quedó detrás del guard de
// sesión, y el guard hacía exactamente lo que le corresponde: 307 al login. El efecto es
// silencioso y desconcertante, porque quien abre ese link es justamente alguien cuya cuenta
// todavía NO está autorizada: pide autorizar Google y aterriza en una pantalla de login del OS,
// que es otra cosa. Ni el typecheck ni el build lo ven — un 307 no es un error de compilación.
//
// La prueba mide las dos mitades juntas: si mañana alguien saca una, se pone roja.

import test from 'node:test'
import assert from 'node:assert/strict'
import { esRutaPublica } from './index.ts'

test('las dos mitades del OAuth de Google se abren sin sesión', () => {
  assert.equal(esRutaPublica('/api/oauth/start'), true, 'la ida a Google exigía sesión: el consentimiento no arranca')
  assert.equal(esRutaPublica('/api/oauth/callback'), true, 'la vuelta de Google llega sin sesión por definición')
})

test('lo que NO está en la lista blanca sigue pidiendo sesión', () => {
  // `/signup` y `/descargar` estaban en la lista hasta el 27/08/2026, y se fueron con sus páginas:
  // el alta libre (que convivía con el alta gobernada de `/administracion/usuarios`) y la landing
  // congelada de la extensión (la viva es `/descargas`). Si alguien devuelve una de las dos
  // entradas sin la pantalla, deja abierta una URL que ya no explica nada.
  for (const r of ['/api/oauth', '/api/oauth-start', '/flujo-caja', '/obras', '/api/otra-cosa', '/',
    '/signup', '/descargar']) {
    assert.equal(esRutaPublica(r), false, `${r} quedó pública sin que nadie lo decidiera`)
  }
})

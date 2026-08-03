// EL UNIVERSO DE TESORERÍA — qué pantallas se relevan y por qué las otras no.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PANTALLAS_MERCADO, PANTALLAS_ACOTADAS, RUTAS_INFORMATIVAS, esDeTesoreria, pantallaDe,
} from './universo-mercado.mjs'
import { esAptoTesoreria } from './instrumentos.mjs'
import { evaluarNavegacion } from './balanz-denylist.mjs'

test('las pantallas que no dan un solo instrumento apto NO se relevan', () => {
  // Medido sobre las 4.394 observaciones reales del ledger: corporativos (787 instrumentos),
  // cedears (320), bonos (190) y acciones (20) aportaron CERO aptos para tesorería. Son, exactamente,
  // las cuatro que reventaban los topes — y cedears sola tarda 11,5 minutos de scroll por corrida.
  for (const ruta of ['corporativos', 'cedears', 'bonos', 'acciones']) {
    assert.ok(!RUTAS_INFORMATIVAS.some((r) => r.includes(ruta)), `${ruta} no tiene por qué relevarse`)
  }
  for (const ruta of ['fondos', 'letras', 'cauciones']) {
    assert.ok(RUTAS_INFORMATIVAS.some((r) => r.includes(ruta)), `${ruta} SÍ produce instrumentos de tesorería`)
  }
})

test('el universo se DERIVA del criterio de aptitud: no hay una segunda lista que desincronizar', () => {
  // Si mañana el dueño decide que una ON corta sí es tesorería, alcanza con `apta_tesoreria` en
  // `instrumentos.mjs`. Este test se pone rojo si alguien vuelve a escribir la lista a mano.
  for (const p of PANTALLAS_MERCADO) {
    assert.equal(
      RUTAS_INFORMATIVAS.includes(p.ruta), esAptoTesoreria(p.publica),
      `${p.ruta} publica ${p.publica}: relevarla o no lo decide esAptoTesoreria, no una lista aparte`,
    )
  }
  assert.equal(RUTAS_INFORMATIVAS.length + PANTALLAS_ACOTADAS.length, PANTALLAS_MERCADO.length)
})

test('toda exclusión viaja con su motivo escrito', () => {
  // Una pantalla excluida sin motivo es un olvido disfrazado de decisión.
  assert.ok(PANTALLAS_ACOTADAS.length >= 4)
  for (const p of PANTALLAS_ACOTADAS) {
    assert.match(p.motivo, /no es instrumento de tesorería de corto plazo/)
    assert.ok(p.motivo.length > 60, `motivo demasiado corto para explicar nada: ${p.motivo}`)
  }
})

test('la pantalla se identifica por su ruta, no por su query', () => {
  // `corporativos?all=1` y `corporativos` son la MISMA pantalla, y la URL que devuelve `relevar` es
  // absoluta. Si esto se rompe, la exclusión deja de aplicarse justo donde importa.
  assert.equal(pantallaDe('https://clientes.balanz.com/app/cotizaciones/corporativos?all=1').publica, 'on')
  assert.equal(pantallaDe('/app/cotizaciones/corporativos').publica, 'on')
  assert.equal(esDeTesoreria('https://clientes.balanz.com/app/cotizaciones/cedears'), false)
  assert.equal(esDeTesoreria('https://clientes.balanz.com/app/cotizaciones/cauciones'), true)
})

test('una pantalla DESCONOCIDA se exige completa: el default cae del lado de exigir', () => {
  // El riesgo del cambio es perdonar de más. Si alguien agrega una ruta y se olvida de declararla,
  // su relevamiento truncado tiene que seguir contando como defecto.
  assert.equal(pantallaDe('/app/cotizaciones/loquesea'), null)
  assert.equal(esDeTesoreria('/app/cotizaciones/loquesea'), true)
  assert.equal(esDeTesoreria(''), true)
  assert.equal(esDeTesoreria(undefined), true)
})

test('las rutas que quedan siguen pasando la barrera', () => {
  for (const r of RUTAS_INFORMATIVAS) {
    assert.equal(evaluarNavegacion(`https://clientes.balanz.com${r}`).permitido, true, r)
  }
})

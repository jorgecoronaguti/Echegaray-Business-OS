// EL BACKOFF DE GOOGLE, Y POR QUÉ SON DOS ESCALERAS Y NO UNA.
//
// Un 5xx es un hipo del servidor: se pasa en segundos. Un 429 de Sheets es otra cosa — es una
// VENTANA DE CUOTA que se renueva POR MINUTO ("Read requests per minute per user"). Reintentar un
// 429 durante 11 segundos no es un backoff corto: es un backoff IMPOSIBLE, porque no existe forma
// de que 11 segundos crucen una ventana de 60. La lectura moría igual, sólo que 11 segundos después.
//
// Lo destapó el trabajo en paralelo: con dos tareas leyendo el Flujo de Fondos a la vez, toda
// lectura terminaba en `google api 429` a mitad de camino. Del lado de la ESCRITURA esta lección ya
// estaba pagada (un 429 partió una pestaña al medio) — nunca se había aplicado a la LECTURA, que
// comparte la misma función.
//
// Este test mide la propiedad que importa, no la implementación: que la escalera de cuota alcance
// para cruzar el minuto. Si alguien la vuelve a acortar "porque tarda mucho", acá se entera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ESPERAS_429, ESPERAS_5XX } from './google.mjs'

const suma = (a) => a.reduce((t, n) => t + n, 0)

test('la escalera de cuota cruza la ventana de un minuto', () => {
  assert.ok(
    suma(ESPERAS_429) > 60_000,
    `la cuota de Sheets se renueva cada 60 s y la escalera suma ${suma(ESPERAS_429)} ms: no puede salvar un 429`,
  )
})

test('la escalera de 5xx no espera de más — un hipo del servidor no es una ventana de cuota', () => {
  assert.ok(suma(ESPERAS_5XX) < 15_000, `${suma(ESPERAS_5XX)} ms es demasiado para un 5xx`)
})

test('las dos escaleras son crecientes: cada intento espera más que el anterior', () => {
  for (const escalera of [ESPERAS_429, ESPERAS_5XX]) {
    for (let i = 1; i < escalera.length; i++) {
      assert.ok(escalera[i] > escalera[i - 1], `escalera no creciente en el paso ${i}: ${escalera}`)
    }
  }
})

test('un 429 se reintenta más veces que un 5xx: la ventana es más larga que el hipo', () => {
  assert.ok(ESPERAS_429.length > ESPERAS_5XX.length)
})

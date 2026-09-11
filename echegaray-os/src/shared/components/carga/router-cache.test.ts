import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// El dueño, 11/09/2026: *«app.ecsas.com.ar está muy lenta, parece que renderiza todo siempre que me
// muevo de sección en sección»*.
//
// La causa es una línea de configuración que NO estaba: `experimental.staleTimes.dynamic`. El Client
// Router Cache de Next guarda el payload RSC de cada pantalla visitada, y su tiempo de reuso por
// defecto para rutas dinámicas es CERO. En este OS todas las rutas son dinámicas, así que ir a Obras
// y volver a Clientes era un render de servidor completo por cada paso, siempre, incluso volviendo a
// la pantalla que se acababa de mirar.
//
// ESTE TEST LEE LA CONFIGURACIÓN, y es a propósito: el defecto no se ve en ninguna pantalla —todo
// funciona, sólo que cada movimiento cuesta un render— y no hay valor de retorno que comprobar. Si
// alguien borra la clave, esto se pone rojo.
//
// CUIDA LOS DOS BORDES, no uno:
//
//   · CERO (o ausente) es el defecto original: el router no reusa nada.
//   · DEMASIADO ALTO es el defecto opuesto y es peor, porque no se siente lento: se siente rápido y
//     miente. Este OS muestra plata —caja, cobranzas, márgenes—, y una pantalla económica servida de
//     un caché viejo es un número viejo presentado como fresco, que es exactamente lo que la Regla
//     de Oro 2 prohíbe. El tope es UN MINUTO: cubre el rebote entre dos secciones, que es el uso
//     real, y nada más.
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))

/** El valor de una clave numérica dentro del bloque `staleTimes` de `next.config.ts`. */
function staleTime(clave: 'dynamic' | 'static'): number | null {
  const fuente = readFileSync(RAIZ + 'next.config.ts', 'utf8')
  const bloque = fuente.match(/staleTimes\s*:\s*\{([^}]*)\}/)
  if (!bloque) return null
  const valor = bloque[1].match(new RegExp(`${clave}\\s*:\\s*(\\d+)`))
  return valor ? Number(valor[1]) : null
}

test('el router reusa la pantalla que se acaba de ver (staleTimes.dynamic > 0)', () => {
  const dinamico = staleTime('dynamic')
  assert.notEqual(
    dinamico, null,
    'next.config.ts no declara experimental.staleTimes.dynamic: con el default de Next (0 s) el Client '
    + 'Router Cache no reusa NADA entre rutas dinámicas, y todas las de este OS lo son. Volver a la '
    + 'pantalla anterior vuelve a ser un render de servidor completo — el «renderiza todo siempre que me '
    + 'muevo de sección en sección» del 11/09/2026.',
  )
  assert.ok(
    (dinamico as number) > 0,
    `staleTimes.dynamic está en ${dinamico}: es el default de Next escrito a mano, o sea el defecto con otra forma.`,
  )
})

test('el reuso no dura tanto como para servir plata vieja (staleTimes.dynamic <= 60)', () => {
  const dinamico = staleTime('dynamic') ?? 0
  assert.ok(
    dinamico <= 60,
    `staleTimes.dynamic está en ${dinamico} s. El tope es 60: arriba de eso una pantalla económica —caja, `
    + 'cobranzas, margen— se sirve del caché del navegador con números que ya envejecieron, y la persona no '
    + 'tiene forma de saberlo. Rápido mintiendo es peor que lento.',
  )
})

test('staleTimes.static respeta el piso que exige el schema de Next (>= 30)', () => {
  const estatico = staleTime('static')
  if (estatico === null) return // no declararlo es válido: Next usa su default de 300 s
  assert.ok(
    estatico >= 30,
    `staleTimes.static está en ${estatico}: el schema de Next 16 exige >= 30 y el build falla con menos.`,
  )
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// ═══ LAS REGLAS VISUALES DEL DUEÑO, VERIFICADAS CONTRA EL FUENTE ═══
//
// Un typecheck no ve un layout, y la tira de $/h es exactamente el tipo de bloque que el repo ya
// convirtió tres veces en «tres tarjetas con sombra». Las cuatro reglas que gobiernan esto —«no
// tarjetas por cada dato», «casi ninguna sombra», «no gradientes», ningún hex suelto en un
// componente— no se cumplen solas, así que se miden.
//
// NO REEMPLAZA MIRAR LA PANTALLA. Atrapa la regresión mecánica; el layout en 390px y el contraste
// los sigue firmando alguien que abrió el navegador.

const DIR = dirname(fileURLToPath(import.meta.url))

// SE MIDE EL CÓDIGO, NO LOS COMENTARIOS. El archivo EXPLICA por qué no lleva tarjeta y por qué un
// «sin permiso» no va a 19px: prohibir la palabra en la prosa enseñaría a borrar la explicación,
// que es justamente lo que evita que alguien deshaga la decisión sin enterarse. Mismo filtro que
// `canonico-legajo-v2.test.ts`.
const fuente = readFileSync(join(DIR, 'ValorHoraDelLegajo.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')

test('ni una tarjeta, ni una sombra, ni un gradiente', () => {
  assert.doesNotMatch(fuente, /boxShadow|shadow-card|<Card\b|<TarjetaFicha/)
  assert.doesNotMatch(fuente, /gradient/i)
  // Un `borderRadius` sobre un contenedor es el primer paso de la tarjeta que no debe estar. El
  // único borde permitido acá es el filo de 1px que separa las filas del historial.
  assert.doesNotMatch(fuente, /borderRadius/)
})

test('ningún color hex suelto: todo sale de un token de `V`', () => {
  const hex = fuente.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
  assert.deepEqual(hex, [], `salió del token: ${hex.join(', ')}`)
  assert.match(fuente, /import \{ V \} from '@\/shared\/components\/v2\/patron'/)
})

test('el amarillo de marca no se usa como estado', () => {
  // `V.marca` es identidad, nunca «hay algo raro acá»: lo que falta cargar va en `V.warn`.
  assert.doesNotMatch(fuente, /V\.marca/)
  assert.match(fuente, /warn: V\.warn/)
})

test('el historial ya no se despliega acá: la tira enlaza a la sección Retribución', () => {
  // Dueño, 16/09/2026: «quiero que sea una SECCIÓN». Un `<details>` que vuelva sería el historial
  // duplicado —uno bajo el nombre y otro en la solapa— y el que se corrija en un lado mentiría en el otro.
  assert.doesNotMatch(fuente, /<details/)
  assert.match(fuente, /data-testid="vh-ver-retribucion"/)
  // Sigue siendo un componente de SERVIDOR: un `useState` acá arrastraría al legajo entero al navegador.
  assert.doesNotMatch(fuente, /'use client'|useState|onClick/)
})

test('un valor ausente se escribe con su motivo y nunca como 0', () => {
  // La tira no inventa un cero cuando no hay dato: pinta `falta`, que es la palabra que trae el
  // servicio («sin permiso», «sin $/h cargado», «sin recibo cargado»).
  assert.match(fuente, /hay \? d\.valor : \(d\.falta \?\? 'sin dato'\)/)
})

test('la regla no vive en el componente: acá no se formatea plata ni se decide qué falta', () => {
  assert.doesNotMatch(fuente, /toLocaleString|\$\{pesos|new Intl/)
  assert.doesNotMatch(fuente, /sin permiso|sin \$\/h cargado/, 'esos textos los decide el servicio')
})

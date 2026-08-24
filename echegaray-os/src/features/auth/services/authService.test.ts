import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { recordar } from './authService.ts'

// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// Dibujar el Resumen de una obra preguntaba TRES veces quién es el usuario y leía TRES veces su
// perfil (el layout de `(main)`, el `page.tsx` del workspace y `ChecklistPreparacion`). Medido:
// 97 ms el `auth.getUser()` y 116 ms el `select` de perfiles, o sea ~426 ms por render tirados en
// volver a averiguar lo mismo.
//
// Y el defecto PEOR que la solución podría introducir: si el memo fuera una variable de módulo en
// vez de `cache()` de React, viviría lo que vive el proceso del servidor — y le serviría a una
// persona el perfil de otra. Un error de rendimiento se ve; ése no.

test('dos llamadas a la vez comparten UN solo viaje', async () => {
  const memo = new Map<string, Promise<string>>()
  let viajes = 0
  const pedir = () => { viajes++; return new Promise<string>((r) => setTimeout(() => r('perfil'), 10)) }

  // A la vez: es el caso real —el `Promise.all` del page.tsx y el layout corren juntos—. Guardando
  // el RESULTADO en vez de la promesa, acá saldrían dos viajes: cuando la segunda llamada mira el
  // memo, la primera todavía no volvió.
  const [a, b] = await Promise.all([
    recordar(memo, 'u1', pedir),
    recordar(memo, 'u1', pedir),
  ])
  assert.equal(viajes, 1, 'dos llamadas concurrentes largaron dos viajes')
  assert.equal(a, 'perfil')
  assert.equal(b, 'perfil')
})

test('una llamada posterior tampoco vuelve a viajar', async () => {
  const memo = new Map<string, Promise<number>>()
  let viajes = 0
  const pedir = () => { viajes++; return Promise.resolve(viajes) }
  assert.equal(await recordar(memo, 'u1', pedir), 1)
  assert.equal(await recordar(memo, 'u1', pedir), 1)
  assert.equal(viajes, 1)
})

test('DOS USUARIOS DISTINTOS NO COMPARTEN NADA', async () => {
  const memo = new Map<string, Promise<string>>()
  assert.equal(await recordar(memo, 'jorge', () => Promise.resolve('direccion')), 'direccion')
  assert.equal(await recordar(memo, 'rodrigo', () => Promise.resolve('jefe')), 'jefe')
  // Si la clave se ignorara, el segundo se llevaría el perfil del primero.
  assert.equal(await recordar(memo, 'jorge', () => Promise.resolve('NO DEBERÍA PEDIRSE')), 'direccion')
})

test('el memo vive UN request: es cache() de React, no una variable de módulo', () => {
  const fuente = readFileSync(new URL('./authService.ts', import.meta.url).pathname, 'utf8')
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')

  assert.match(codigo, /import \{ cache \} from 'react'/, 'el memo dejó de colgar de cache() de React')
  for (const memo of ['memoDelUsuario', 'memoDeLosPerfiles']) {
    assert.match(
      codigo, new RegExp(`const ${memo} = cache\\(`),
      `${memo} no se crea con cache(): un Map de módulo sobrevive al request y le serviría a una `
      + 'persona el perfil de otra',
    )
  }
  // Un `new Map()` suelto en el módulo es exactamente la forma del defecto.
  assert.doesNotMatch(
    codigo, /^const \w+(: [^=]+)? = new Map\(/m,
    'hay un Map de módulo en authService: eso es estado compartido ENTRE usuarios',
  )
})

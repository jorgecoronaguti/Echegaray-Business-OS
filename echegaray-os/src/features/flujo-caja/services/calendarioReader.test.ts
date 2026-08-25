import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tokenVigente } from './calendarioReader.ts'

// ═══ QUÉ DEFECTO ATRAPAN ═══
//
// `/flujo-caja` hacía DOS viajes a Google encadenados en cada carga: primero minteaba y firmaba un
// JWT nuevo para pedir un token de service account —que dura una hora y se tiraba entero—, y recién
// después leía las cinco pestañas del Sheet.
//
// Y el primero rompía al segundo SIN DECIRLO. El `batchGet` lleva `next: { revalidate: 60 }`, puesto
// a propósito, pero la clave de caché de fetch de Next incluye las cabeceras: se comprueba en su
// propio código, `next/dist/server/lib/incremental-cache/index.js`, donde `generateCacheKey` arma el
// `cacheString` con `[MAIN_KEY_PREFIX, prefijo, url, init.method, headers, …]`. Con un
// `Authorization: Bearer <token>` distinto en cada request, cada visita estrenaba clave: el
// `revalidate` no acertaba nunca y encima dejaba una entrada de caché por visita que nadie iba a
// releer.
//
// El arreglo es guardar el token hasta poco antes de que venza. Estos tests cuidan las dos mitades:
// que el caché exista (si vuelve el minteo por request, rojo) y que el borde esté bien —renovar
// tarde da un 401 en vuelo, que esta pantalla mostraría como «la conexión con el Sheet no está
// configurada», o sea una mentira sobre la caja—.

const HORA = 60 * 60 * 1000
const MARGEN = 5 * 60 * 1000

test('sin nada guardado hay que pedir token', () => {
  assert.equal(tokenVigente(null, Date.now()), false)
})

test('un token recién pedido sirve', () => {
  const ahora = 1_000_000_000
  assert.equal(tokenVigente({ token: 't', venceEn: ahora + HORA }, ahora), true)
})

test('SE RENUEVA ANTES DE VENCER, no cuando ya venció', () => {
  const ahora = 1_000_000_000
  // Un instante ANTES de entrar en el margen: todavía sirve.
  assert.equal(tokenVigente({ token: 't', venceEn: ahora + MARGEN + 1 }, ahora), true)
  // Justo en el margen: ya no. Es lo que evita que expire en vuelo.
  assert.equal(tokenVigente({ token: 't', venceEn: ahora + MARGEN }, ahora), false)
  // Vencido de verdad: obviamente no.
  assert.equal(tokenVigente({ token: 't', venceEn: ahora - 1 }, ahora), false)
})

test('el token se guarda entre requests — si vuelve el minteo por visita, esto se pone rojo', () => {
  const fuente = readFileSync(new URL('./calendarioReader.ts', import.meta.url).pathname, 'utf8')
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n')

  assert.match(
    codigo, /let tokenGuardado/,
    'desapareció el token guardado: vuelve un POST a oauth2.googleapis.com por cada carga de /flujo-caja',
  )
  assert.match(
    codigo, /if \(tokenVigente\(tokenGuardado, Date\.now\(\)\)\) return/,
    'getAccessToken dejó de mirar el token guardado antes de pedir uno nuevo',
  )
  // La cabecera estable es lo ÚNICO que hace que este `revalidate` sirva de algo.
  assert.match(
    codigo, /next: \{ revalidate: \d+ \}/,
    'se fue el revalidate del batchGet: cada carga vuelve a leer las cinco pestañas del Sheet',
  )
})

test('el caché es del token de la SERVICE ACCOUNT, no de nadie en particular', () => {
  const fuente = readFileSync(new URL('./calendarioReader.ts', import.meta.url).pathname, 'utf8')
  // Guardar en módulo algo que dependa de quién entró sería servirle a una persona los datos de
  // otra. Acá lo guardado se deriva SÓLO de GOOGLE_SERVICE_ACCOUNT_JSON, que es del servidor.
  const cuerpo = fuente.slice(fuente.indexOf('async function getAccessToken'), fuente.indexOf('type Fila'))
  assert.doesNotMatch(
    cuerpo, /auth\.|user|usuario|perfil|supabase/i,
    'getAccessToken tocó algo del usuario: un token cacheado en módulo NO puede depender de quién entró',
  )
})

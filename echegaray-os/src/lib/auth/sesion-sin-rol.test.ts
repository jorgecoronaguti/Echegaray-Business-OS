// SESIÓN SIN ROL: el portero no rebota a `/obras` (bucle del 01/10/2026). Decisión pura + cableado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cookiesDeSesion, salidaSinRol } from './sesion-sin-rol.ts'
import { destinoDeRebote, puedeVerRuta } from '../../shared/auth/areas.ts'

const leer = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('el defecto: sin rol, `/obras` rebota a `/obras`', () => {
  assert.equal(puedeVerRuta(null, '/obras'), false)
  assert.equal(destinoDeRebote(null), '/obras', 'por eso sin rol no se puede llegar al rebote')
})

test('sesión muerta → login; sesión viva con error → base; sesión viva sin fila → sin perfil', () => {
  assert.equal(salidaSinRol({ sesionViva: false, errorDePerfil: false }), 'login')
  assert.equal(salidaSinRol({ sesionViva: false, errorDePerfil: true }), 'login')
  assert.equal(salidaSinRol({ sesionViva: true, errorDePerfil: true }), 'sin_backend')
  assert.equal(salidaSinRol({ sesionViva: true, errorDePerfil: false }), 'sin_perfil')
})

test('se borran las cookies de la sesión, enteras o en trozos, y ninguna otra', () => {
  assert.deepEqual(
    cookiesDeSesion(['sb-abc123-auth-token', 'sb-abc123-auth-token.0', 'sb-abc123-auth-token.1', 'os_obra', 'portal_cliente', 'sb-abc123-auth-token-code-verifier']),
    ['sb-abc123-auth-token', 'sb-abc123-auth-token.0', 'sb-abc123-auth-token.1'],
  )
})

test('el portero corta ANTES del rebote y no deja pasar a nadie sin rol', () => {
  const src = leer('../../middleware.ts')
  const corte = src.indexOf('salidaSinRol({')
  const rebote = src.indexOf('destinoDeRebote(perfil?.rol)')
  assert.ok(corte > 0 && rebote > corte, 'el corte por «sin rol» va antes del rebote por nivel')
  assert.match(src, /if \(rol === null\) \{\s*const \{ data: enAuth, error: errorDeAuth \} = await supabase\.auth\.getUser\(\)/)
  assert.match(src, /alLogin\.cookies\.delete\(nombre\)/)
  assert.match(src, /favicon\.ico\|marca\//, 'el logo no pasa por el portero')
})

test('«Salir» cierra este aparato, no todos', () => {
  const src = leer('../../features/auth/services/actions.ts')
  assert.match(src, /signOut\(\{ scope: 'local' \}\)/)
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /signOut\(\)/)
})

test('la marca: sin «Business OS» y a Clientes para quien ve Clientes', () => {
  const header = leer('../../shared/components/AppHeader.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  assert.doesNotMatch(header, /Business OS/)
  assert.match(header, /: inicioDeMarca\b/)
  assert.match(leer('../../app/(main)/layout.tsx'), /inicioDeMarca=\{veEconomia\(rol\) \? ENTRADA_DE_ADMINISTRACION : '\/'\}/)
})

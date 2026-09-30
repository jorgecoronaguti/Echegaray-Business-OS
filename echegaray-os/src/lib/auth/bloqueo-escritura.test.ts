import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BLOQUEO_POR_LENTE, CABECERA_BLOQUEO, esBloqueoPorLente } from './bloqueo-escritura.ts'

const con = (status: number, valor?: string) =>
  ({ status, headers: new Headers(valor ? { [CABECERA_BLOQUEO]: valor } : {}) })

test('el 403 de la lente se reconoce', () => {
  assert.equal(esBloqueoPorLente(con(403, BLOQUEO_POR_LENTE)), true)
})

test('un 403 sin la cabecera (permiso, API) NO se toma por la lente', () => {
  assert.equal(esBloqueoPorLente(con(403)), false)
})

test('la cabecera en una respuesta que no es 403 no cuenta', () => {
  assert.equal(esBloqueoPorLente(con(200, BLOQUEO_POR_LENTE)), false)
})

// Sin esto, sacar la cabecera del middleware deja el aviso muerto y ningún otro test lo nota.
test('el middleware marca el corte de escrituras con la cabecera', () => {
  const src = readFileSync(new URL('../../middleware.ts', import.meta.url), 'utf8')
  const bloque = src.slice(src.indexOf('esPeticionDeEscritura(request.method)'))
  assert.match(bloque.slice(0, 900), /CABECERA_BLOQUEO\]?: ?BLOQUEO_POR_LENTE|\[CABECERA_BLOQUEO\]/)
})

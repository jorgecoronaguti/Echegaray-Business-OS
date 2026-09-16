// EL DEFECTO QUE ESTE TEST ATRAPA
//
// Un tique sin CAE (tipos 81/112) re-ingerido entra otra vez. La clave única de `comprobantes_arca`
// es (tipo_libro, cae, numero) y NULL no choca con NULL: al 16/09/2026 eso eran 131 filas de más y
// $4,75 M de IVA inflado. El arreglo son tres piezas que tienen que decir lo mismo —el índice parcial
// de la migración, el destino del `on conflict` y la ingesta que lo usa— y cada test clava una.
//
// No se prueba contra la base: el destino del conflicto es una función pura y el índice está escrito
// en el repo. Que la migración esté APLICADA se verifica en la base, no acá.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { conflictoIngesta, caeNormalizado } from './arca-duplicados.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const MIGRACION = join(RAIZ, 'supabase/migrations/20260916T1900_comprobante_arca_sin_cae_una_sola_vez.sql')
const INGESTA = join(RAIZ, 'scripts/arca/ingest-comprobantes.mjs')

const columnas = (s) => s.replace(/\s+/g, ' ').trim()

test('EL DEFECTO REAL: un tique sin CAE NO va contra la clave con CAE, donde NULL nunca choca', () => {
  for (const sinCae of [null, undefined, '', '   ']) {
    const destino = conflictoIngesta(sinCae)
    assert.doesNotMatch(destino, /\bcae,/, `con cae=${JSON.stringify(sinCae)} volvió a la clave que dejó entrar 131 copias`)
    assert.match(destino, /where cae is null$/, 'sin el where del índice parcial Postgres no lo infiere y el insert revienta')
  }
})

test('con CAE la identidad sigue siendo (tipo_libro, cae, numero)', () => {
  assert.equal(conflictoIngesta('76123456789012'), '(tipo_libro, cae, numero)')
})

test('el CAE vacío se guarda NULL: la fila y el destino del conflicto dicen lo mismo', () => {
  assert.equal(caeNormalizado(''), null)
  assert.equal(caeNormalizado('  '), null)
  assert.equal(caeNormalizado(undefined), null)
  assert.equal(caeNormalizado(' 761 '), '761')
  // Si se guardara '' con destino "sin CAE", la fila no cumpliría `where cae is null` y el índice no
  // la cubriría: volvería a duplicarse sin que nada fallara.
  for (const v of ['', null, 'x']) assert.equal(conflictoIngesta(v).endsWith('where cae is null'), caeNormalizado(v) === null)
})

test('el destino sin CAE es EXACTAMENTE el índice único parcial que crea la migración', () => {
  const sql = readFileSync(MIGRACION, 'utf8')
  const m = /create unique index comprobantes_arca_sin_cae_identidad\s+on public\.comprobantes_arca\s+(\([^)]*\))\s+where cae is null;/.exec(sql)
  assert.ok(m, 'la migración ya no crea el índice parcial sin CAE')
  const destino = conflictoIngesta(null)
  assert.equal(columnas(destino), columnas(`${m[1]} where cae is null`))
})

test('la ingesta escribe con conflictoIngesta y el CAE normalizado, no con la clave fija de antes', () => {
  const src = readFileSync(INGESTA, 'utf8')
  assert.doesNotMatch(src, /on conflict \(tipo_libro, cae, numero\)/, 'volvió la clave fija: los sin CAE se duplican de nuevo')
  assert.match(src, /on conflict \$\{conflictoIngesta\(cae\)\}/)
  assert.match(src, /const cae = caeNormalizado\(/)
  assert.doesNotMatch(src, /c\['Cód\. Autorización'\] \|\| null/, 'el CAE crudo en el insert desalinea la fila del destino')
})

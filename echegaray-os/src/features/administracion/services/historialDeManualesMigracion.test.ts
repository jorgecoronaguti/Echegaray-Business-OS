// EL TRIGGER Y LA PANTALLA TIENEN QUE HABLAR DE LAS MISMAS CELDAS.
//
// El defecto que atrapa: se suma una celda editable a `COLUMNA_DE` y nadie actualiza el mapa del trigger. La celda
// se guarda, el punto ámbar aparece y el log queda MUDO: «sin registro» sobre un valor que alguien tipeó. Es la
// clase de falla que el dueño no puede distinguir de «nadie lo tocó».

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COLUMNA_DE } from './liquidacionOverrides.ts'

const SQL = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../../supabase/migrations/20261001T0200_liquidacion_historial_de_manuales.sql'), 'utf8')

/** El literal jsonb de `liquidacion_columnas_manuales()`: columna → campo. */
function mapaDelTrigger(): Record<string, string> {
  const m = SQL.match(/select '(\{[\s\S]*?\})'::jsonb/)
  assert.ok(m, 'no encontré el mapa de columnas en la migración')
  return JSON.parse(m[1])
}

test('el trigger anota exactamente las columnas que la pantalla escribe a mano', () => {
  const esperado = Object.fromEntries(Object.entries(COLUMNA_DE).map(([campo, columna]) => [columna, campo]))
  assert.deepEqual(mapaDelTrigger(), esperado)
})

test('el autor de pantalla sólo vale si el sello cambió en esa escritura', () => {
  assert.match(SQL, /new\.escribio_en is distinct from old\.escribio_en/)
})

test('el log no se escribe desde la web: authenticated sólo lee', () => {
  assert.match(SQL, /revoke all on public\.liquidacion_cambio from anon, authenticated/)
  assert.match(SQL, /grant select on public\.liquidacion_cambio to authenticated/)
  assert.doesNotMatch(SQL, /grant [^;]*(insert|update|delete)[^;]* on public\.liquidacion_cambio/i)
})

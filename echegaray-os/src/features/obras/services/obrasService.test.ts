// EL DEFECTO QUE ATRAPA: que «esta obra no existe» vuelva a viajar como si fuera un error.
//
// Cuando `getObra` devolvía `error: "No existe la obra X"`, la ficha entraba por la rama de fallo y
// dibujaba la pantalla roja de una base caída —con Reintentar y todo— para una obra que
// simplemente no está. El `notFound()` de la línea siguiente era código inalcanzable, y el
// `not-found.tsx` de la ruta no se mostraba jamás. Verificado en el navegador el 21/08/2026 antes
// de corregirlo.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getObra } from './obrasService.ts'

/** Un cliente mínimo que contesta lo que contestaría PostgREST: cero filas, sin error. */
function supabaseQueDevuelve(respuesta: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => respuesta }),
      }),
    }),
  } as unknown as SupabaseClient
}

test('una obra que no existe vuelve como ausencia, no como error', async () => {
  const r = await getObra(supabaseQueDevuelve({ data: null, error: null }), 'no-existe')
  assert.equal(r.data, null)
  assert.equal(r.error, null, 'el que pregunta decide: 404, no pantalla de error')
})

test('un fallo real de la base SÍ vuelve como error, con el mensaje de la fuente', async () => {
  const r = await getObra(
    supabaseQueDevuelve({ data: null, error: { message: 'permission denied for table obra_panel' } }),
    'le-comedor',
  )
  assert.equal(r.data, null)
  assert.equal(r.error, 'permission denied for table obra_panel')
})

test('la obra que existe llega entera', async () => {
  const r = await getObra(supabaseQueDevuelve({ data: { obra_id: 'le-comedor' }, error: null }), 'le-comedor')
  assert.equal(r.data?.obra_id, 'le-comedor')
  assert.equal(r.error, null)
})

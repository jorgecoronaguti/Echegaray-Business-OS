// ASIGNAR DESDE LA SOLAPA PERSONAL DE LA OBRA NO PUEDE DEJAR A LA PERSONA EN DOS OBRAS.
//
// Qué defecto atrapa: `asignarPersona` / `asignarCuadrillaAObra` insertaban y nada más. Si se borra la
// llamada a `cederOtrasObras` o la regla deja de cerrar, estos tests no ven ninguna escritura sobre la
// fila de la otra obra y dan rojo. No prueba la RLS ni el cliente real de PostgREST.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cederOtrasObras, type SupabaseAsignacion } from './cronologiaAlAsignar.ts'

type Fila = { id: string; obra_id: string; desde: string | null; hasta: string | null }
type Toque = { verbo: string; valores?: Record<string, unknown>; filtros: [string, string][] }

function baseFalsa(filas: Fila[]) {
  const toques: Toque[] = []
  const escritura = (t: Toque) => {
    const e = {
      eq: (c: string, v: string) => { t.filtros.push([c, v]); return e },
      select: async () => ({ data: [{ id: 'x' }], error: null }),
    }
    toques.push(t)
    return e
  }
  const supabase: SupabaseAsignacion = {
    from: () => ({
      select: () => ({ eq: async () => ({ data: filas, error: null }) }),
      update: (valores) => escritura({ verbo: 'update', valores, filtros: [] }),
      delete: () => escritura({ verbo: 'delete', filtros: [] }),
      insert: (valores) => escritura({ verbo: 'insert', valores, filtros: [] }),
    }),
  }
  return { supabase, toques }
}

const PERSONA = '22222222-2222-4222-8222-222222222222'

test('asignar desde la obra cierra la de OTRA obra en la víspera, filtrando por la persona', async () => {
  const { supabase, toques } = baseFalsa([
    { id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null },
    { id: 'misma', obra_id: 'quattropani', desde: '2026-07-01', hasta: '2026-07-31' },
  ])
  const r = await cederOtrasObras(supabase, PERSONA, { obra_id: 'quattropani', desde: '2026-09-14', hasta: null })
  assert.equal(r, null)
  assert.deepEqual(toques, [{ verbo: 'update', valores: { hasta: '2026-09-13' }, filtros: [['id', 'pisos'], ['persona_id', PERSONA]] }])
})

test('un día suelto desde la obra no toca ninguna otra fila', async () => {
  const { supabase, toques } = baseFalsa([{ id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }])
  await cederOtrasObras(supabase, PERSONA, { obra_id: 'quattropani', desde: '2026-09-14', hasta: '2026-09-14' })
  assert.deepEqual(toques, [])
})

test('un tramo con fin dentro de una abierta: la cierra y programa el regreso al día siguiente', async () => {
  const { supabase, toques } = baseFalsa([{ id: 'pisos', obra_id: 'pisos-industriales', desde: '2026-08-01', hasta: null }])
  await cederOtrasObras(supabase, PERSONA, { obra_id: 'quattropani', desde: '2026-09-14', hasta: '2026-09-16' })
  assert.deepEqual(toques.map((t) => [t.verbo, t.valores]), [
    ['update', { hasta: '2026-09-13' }],
    ['insert', { persona_id: PERSONA, rol: 'integrante', obra_id: 'pisos-industriales', desde: '2026-09-17', hasta: null }],
  ])
})

// SIN LA TABLA DE PAGOS (migración 20261002T1800 sin aplicar) LA PANTALLA ANDA: se contesta `null`, no se rompe.
//
// Defecto que atrapa: leer `liquidacion_pago_efectivo` sin tolerar su ausencia tumba la pantalla de Liquidación entera
// el día que esta rama se publique antes que la migración.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerPagosEnEfectivo } from './pagosEnEfectivoService.ts'

type Respuesta = { data: unknown; error: { code?: string; message: string } | null }

const cliente = (resultado: Respuesta | 'revienta'): SupabaseClient => {
  const cadena: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) cadena[m] = () => cadena
  cadena.limit = () => (resultado === 'revienta' ? Promise.reject(new Error('red')) : Promise.resolve(resultado))
  return { from: () => cadena } as unknown as SupabaseClient
}

test('tabla inexistente (42P01 y PGRST205): null, sin excepción', async () => {
  assert.equal(await leerPagosEnEfectivo(cliente({ data: null, error: { code: '42P01', message: 'relation does not exist' } }), '2026-09-16'), null)
  assert.equal(await leerPagosEnEfectivo(cliente({ data: null, error: { code: 'PGRST205', message: 'schema cache' } }), '2026-09-16'), null)
})

test('un fallo de red tampoco rompe la pantalla', async () => {
  assert.equal(await leerPagosEnEfectivo(cliente('revienta'), '2026-09-16'), null)
})

test('con la tabla y sin filas es una lista vacía: «existe y no hay pagos» no es «no existe»', async () => {
  assert.deepEqual(await leerPagosEnEfectivo(cliente({ data: [], error: null }), '2026-09-16'), [])
})

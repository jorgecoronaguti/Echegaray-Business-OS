// EL DEFECTO QUE ATRAPA: que un vínculo deducido de la carpeta de Drive se muestre como
// «Confirmado».
//
// `getDocumentos` colapsaba TODO lo que no fuera `inferido`/`path_inferido` en `confirmado`. Con el
// barrido de 20260822T6500 eso significa que los 32 papeles de Quattropani entrarían a la pantalla
// diciendo que una persona los revisó, cuando lo único que se sabe es que están adentro de la
// carpeta de la obra. La evidencia es fuerte; la confirmación no existe. Son dos cosas distintas y
// la lista tiene que poder distinguirlas, porque de ahí sale qué falta mirar.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDocumentos } from './obrasService.ts'

/** El mínimo que `getDocumentos` usa: una lectura de vínculos y otra del índice de Drive. */
function supabaseCon(vinculos: Record<string, unknown>[]) {
  const respuesta = { data: vinculos, error: null }
  return {
    from: (tabla: string) => ({
      select: () => (tabla === 'obra_documento'
        ? Object.assign(Promise.resolve(respuesta), { eq: async () => respuesta })
        : { in: async () => ({ data: [], error: null }) }),
    }),
  } as unknown as SupabaseClient
}

const vinculo = (drive_file_id: string, origen: string) => ({
  obra_id: 'quattropani', drive_file_id, origen, nombre: `${drive_file_id}.pdf`, tipo: 'archivo',
})

test('un vínculo por carpeta de Drive NO se muestra como confirmado', async () => {
  const r = await getDocumentos(supabaseCon([vinculo('a1', 'carpeta_drive')]), 'quattropani')
  assert.equal(r.data?.[0].origen, 'carpeta_drive',
    'un barrido por carpeta se estaría leyendo como un papel que alguien revisó')
})

test('los tres orígenes llegan distintos, y el vocabulario viejo se traduce', async () => {
  const r = await getDocumentos(supabaseCon([
    vinculo('a1', 'confirmado'),
    vinculo('a2', 'carpeta_drive'),
    vinculo('a3', 'path_inferido'),
    vinculo('a4', 'inferido'),
  ]), 'quattropani')
  assert.deepEqual(r.data?.map((d) => d.origen),
    ['confirmado', 'carpeta_drive', 'inferido', 'inferido'])
})

test('un origen que la pantalla no conoce cae del lado prudente, no del optimista', async () => {
  // Cualquier valor futuro se lee como `confirmado` en el tipo; lo que NO puede pasar es que un
  // vínculo automático nuevo se cuele con un rótulo que diga que alguien lo miró. Ese caso se cubre
  // agregándolo acá el día que exista — este test lo deja escrito.
  const r = await getDocumentos(supabaseCon([vinculo('a9', 'manual')]), 'quattropani')
  assert.equal(r.data?.[0].origen, 'confirmado')
})

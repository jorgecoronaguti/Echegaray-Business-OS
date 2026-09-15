// LA PUERTA COMPARTIDA LEE LO MISMO QUE LAS DOS CONSULTAS QUE REEMPLAZA.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Unificar dos lecturas idénticas ahorra un viaje y, si se hace mal, cambia lo que la pantalla
// afirma. Los tres modos de fallo, en orden de daño:
//
//   1 · que la consulta unificada pida OTRAS columnas u OTRA ventana — la grilla dibujaría la
//       asistencia de un período sobre otro y nadie vería un error;
//   2 · que el `error` llegue mutilado — `liquidacionQuincenaService` mira `code` para distinguir
//       «la tabla todavía no existe» de «no pude leer», y sin ese campo una migración pendiente se
//       dibuja como una falla roja;
//   3 · que alguna de las dos pantallas se quede con su consulta escrita a mano y el ahorro no
//       exista, sin que nada falle.
//
// El memo en sí NO se prueba acá y es a propósito: `cache()` de React no memoriza fuera de un
// request —dos llamadas seguidas en Node devuelven Maps distintos—, así que un test que llamara dos
// veces mediría el comportamiento SIN memo y pasaría igual. Lo que sostiene el ahorro es
// `recordar`, que ya tiene su prueba en `authService.test.ts`, y el barrido (3) de acá abajo.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerCuilesDelLegajo, leerPresenciasDeLaQuincena } from './lecturasCompartidasDeQuincena.ts'

/** Un Supabase de mentira que anota la consulta que se armó y devuelve lo que se le diga. */
function espia(respuesta: { data: unknown[] | null; error: { code?: string; message: string } | null }) {
  const pedido: Record<string, unknown> = {}
  const cadena = {
    select: (c: string) => { pedido.select = c; return cadena },
    gte: (col: string, v: string) => { pedido.gte = [col, v]; return cadena },
    lte: (col: string, v: string) => { pedido.lte = [col, v]; return cadena },
    then: (r: (x: unknown) => unknown) => Promise.resolve(respuesta).then(r),
  }
  const supabase = { from: (t: string) => { pedido.from = t; return cadena } } as unknown as SupabaseClient
  return { supabase, pedido }
}

test('las presencias se piden con la MISMA tabla, columnas y ventana que la consulta que reemplazan', async () => {
  const { supabase, pedido } = espia({ data: [], error: null })
  await leerPresenciasDeLaQuincena(supabase, '2026-09-01', '2026-09-15')
  assert.equal(pedido.from, 'asistencia_dia')
  // La tardanza viaja desde el 15/09/2026 (20260915T2220): es la marca que decide el presentismo.
  assert.equal(pedido.select, 'persona_id, fecha, estado, motivo, llego_tarde, salio_antes')
  assert.deepEqual(pedido.gte, ['fecha', '2026-09-01'])
  assert.deepEqual(pedido.lte, ['fecha', '2026-09-15'])
})

test('sin la columna de tardanza aplicada se relee sin ella: la pantalla no se rompe por una migración pendiente', async () => {
  const selects: string[] = []
  const cadena = {
    select: (c: string) => { selects.push(c); return cadena },
    gte: () => cadena, lte: () => cadena,
    then: (r: (x: unknown) => unknown) => Promise.resolve(
      selects.length === 1
        ? { data: null, error: { code: '42703', message: 'column asistencia_dia.llego_tarde does not exist' } }
        : { data: [{ persona_id: 'p', fecha: '2026-09-17', estado: 'presente', motivo: null }], error: null },
    ).then(r),
  }
  const supabase = { from: () => cadena } as unknown as SupabaseClient
  const r = await leerPresenciasDeLaQuincena(supabase, '2026-09-16', '2026-09-30')
  assert.deepEqual(selects, ['persona_id, fecha, estado, motivo, llego_tarde, salio_antes', 'persona_id, fecha, estado, motivo'])
  assert.equal(r.error, null)
  assert.equal(r.data?.length, 1)
})

test('los CUIL se piden a la vista CON PORTERO y con las dos columnas de siempre', async () => {
  const { supabase, pedido } = espia({ data: [], error: null })
  await leerCuilesDelLegajo(supabase)
  assert.equal(pedido.from, 'persona_legajo')
  assert.equal(pedido.select, 'id, cuil')
  assert.equal(pedido.gte, undefined, 'la lectura del padrón no lleva ventana')
})

test('el error llega entero, con su code: sin él «la tabla no existe» se dibuja como una falla', async () => {
  const { supabase } = espia({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
  const r = await leerPresenciasDeLaQuincena(supabase, '2026-01-01', '2026-01-15')
  assert.equal(r.error?.code, '42P01')
  assert.equal(r.data, null, 'una lectura que falló no puede devolver una lista vacía')
})

// ═══ Y QUE NINGUNA DE LAS DOS PANTALLAS SE HAYA QUEDADO CON SU CONSULTA A MANO ═══
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const ARCHIVOS = [
  'src/features/administracion/services/grillaHorasQuincenaService.ts',
  'src/features/administracion/services/liquidacionQuincenaService.ts',
]

test('las dos pantallas de la quincena entran por la puerta compartida, no por su propia consulta', () => {
  for (const a of ARCHIVOS) {
    const src = readFileSync(RAIZ + a, 'utf8')
    assert.match(src, /leerPresenciasDeLaQuincena\(supabase, q\.desde, q\.hasta\)/, `${a} no usa la puerta de presencias`)
    assert.match(src, /leerCuilesDelLegajo\(supabase\)/, `${a} no usa la puerta de los CUIL`)
    assert.doesNotMatch(src, /from\('asistencia_dia'\)/, `${a} volvió a escribir la consulta de asistencia_dia a mano`)
    assert.doesNotMatch(src, /from\('persona_legajo'\)\s*\.select\('id, cuil'\)/, `${a} volvió a pedir los CUIL por su cuenta`)
  }
})

// EL DEFECTO QUE ATRAPA: que la pantalla vuelva a buscar la frase entera con un solo `ilike`.
//
// Hasta el 12/09/2026 `/documentos` mandaba `name.ilike.%<frase entera>%` y nada más. Con eso, «dni
// de capelli» devolvía cero filas teniendo el archivo «DNI - Capelli.pdf» en la base, y la pantalla
// decía que no existía. Estos tests miran lo ÚNICO que prueba que eso no volvió: los filtros que
// `getDocumentos` realmente le manda a Postgres, y que baja la escalera hasta el peldaño de los
// tokens en vez de rendirse en el primero.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDocumentos } from './documentosService.ts'

interface Fila { drive_file_id: string; name: string; path: string; modified_time: string | null }

/**
 * Un Supabase de juguete que ANOTA cada intento.
 *
 * `responde` decide qué filas devuelve cada intento según los filtros acumulados: así se puede
 * simular «los tres primeros peldaños no traen nada y el cuarto sí», que es el caso real.
 */
function supabaseQueAnota(responde: (filtros: string[]) => Fila[]) {
  const intentos: string[][] = []
  const consulta = (filtros: string[]) => {
    const api = {
      or: (f: string) => consulta([...filtros, f]),
      not: () => api,
      like: () => api,
      eq: () => api,
      in: () => { const filas = responde(filtros); intentos.push(filtros); return Promise.resolve({ data: filas, error: null, count: filas.length }) },
      order: () => api,
      limit: () => api,
      then: (res: (v: { data: Fila[]; error: null; count: number }) => unknown) => {
        const filas = responde(filtros)
        intentos.push(filtros)
        return Promise.resolve(res({ data: filas, error: null, count: filas.length }))
      },
    }
    return api
  }
  const cliente = {
    from: (tabla: string) => ({
      select: () => (tabla === 'drive_index'
        ? consulta([])
        // Los vínculos: tres lecturas que a esta prueba no le importan.
        : { in: async () => ({ data: [], error: null }), not: () => ({ lt: async () => ({ data: [], error: null }), gte: () => ({ lte: async () => ({ data: [], error: null }) }) }) }),
    }),
  } as unknown as SupabaseClient
  return { cliente, intentos }
}

const CAPELLI: Fila = {
  drive_file_id: 'a', name: 'DNI - Capelli.pdf', modified_time: '2026-01-01T00:00:00Z',
  path: 'administracion/PERSONAL/2. INACTIVOS/CAPELLI CESAR/DNI - Capelli.pdf',
}

test('la búsqueda baja la escalera hasta el peldaño de los tokens', async () => {
  // Ningún peldaño por nombre trae nada; el de los tokens sí. Es el caso «reporte de actividades de
  // agosto de la estrella»: la obra está en la carpeta y el mes en el nombre.
  const { cliente, intentos } = supabaseQueAnota((filtros) => (filtros.some((f) => f.startsWith('tokens.cs.')) ? [CAPELLI] : []))
  const r = await getDocumentos(cliente, { q: 'dni de capelli' })
  assert.equal(r.error, null)
  assert.deepEqual(r.data?.documentos.map((d) => d.drive_file_id), ['a'])
  assert.equal(r.data?.busqueda?.peldano, 'todos_los_tokens')
  assert.deepEqual(r.data?.busqueda?.tokens, ['dni', 'capelli'])
  // Y los filtros de cada intento son los de la escalera, en orden.
  assert.deepEqual(intentos.map((i) => i[0]), [
    'nombre_norm.eq."dni de capelli",nombre_norm.eq."dni capelli"',
    'nombre_norm.ilike."%dni de capelli%",nombre_norm.ilike."%dni capelli%"',
    'tokens.cs.{dni,capelli}',
  ])
})

test('se para en el PRIMER peldaño que trae algo: lo laxo no compite con lo estricto', async () => {
  const { cliente, intentos } = supabaseQueAnota(() => [CAPELLI])
  const r = await getDocumentos(cliente, { q: 'dni capelli' })
  assert.equal(r.data?.busqueda?.peldano, 'normalizada')
  assert.equal(intentos.length, 1, 'con el primer peldaño resuelto no se consulta de nuevo')
})

test('sin ningún peldaño que traiga algo, el total es 0 y no hay búsqueda que mostrar', async () => {
  const { cliente, intentos } = supabaseQueAnota(() => [])
  const r = await getDocumentos(cliente, { q: 'zzz no existe nada' })
  assert.deepEqual(r.data?.documentos, [])
  assert.equal(r.data?.total, 0)
  assert.equal(r.data?.busqueda, null)
  assert.equal(intentos.length, 4, 'se prueban los cuatro peldaños que tienen forma SQL')
})

test('el filtro de carpeta y el de categoría se aplican en CADA intento', async () => {
  // Probar el peldaño suelto y recortar después daría «no hay nada» cada vez que el mejor peldaño
  // cae entero afuera del filtro que la persona eligió.
  const { cliente, intentos } = supabaseQueAnota((filtros) => (filtros.some((f) => f.startsWith('tokens.cs.')) ? [CAPELLI] : []))
  await getDocumentos(cliente, { q: 'dni de capelli', categoria: 'certificados' })
  assert.ok(intentos.length >= 2)
  for (const filtros of intentos) {
    assert.ok(filtros.some((f) => f.includes('certificad')),
      'falta el filtro de categoría en un intento de la escalera')
  }
})

test('sin texto no hay escalera: una sola consulta y orden por fecha', async () => {
  const { cliente, intentos } = supabaseQueAnota(() => [CAPELLI])
  const r = await getDocumentos(cliente, {})
  assert.equal(intentos.length, 1)
  assert.deepEqual(intentos[0], [])
  assert.equal(r.data?.busqueda, null)
})

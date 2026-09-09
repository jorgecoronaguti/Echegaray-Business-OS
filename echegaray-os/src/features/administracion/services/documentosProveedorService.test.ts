// LO QUE ESTE TEST IMPIDE — la lectura de documentos de un proveedor:
//
//   · QUE UN ID INVENTADO VIAJE A POSTGRES. Desde el 09/09/2026 esta lectura también corre en la
//     CARTERA, donde el id sale de la query string (`?p=…`): `?p=nuevo` volvería como error de
//     sintaxis de uuid y el panel lo escribiría como «no pude leerlos» — un fallo de lectura donde
//     no hay nada que leer, y encima en ámbar, como si alguien tuviera que ir a arreglarlo.
//   · QUE UN DOCUMENTO DADO DE BAJA VUELVA A LA LISTA. La baja es lógica: la fila queda. Si el
//     filtro se cae, el contrato que alguien sacó reaparece en pantalla como vigente.
//   · QUE UN RECORTE SE HAGA EN SILENCIO. Con más documentos que el tope, la pantalla tiene que
//     poder decirlo; una lista recortada sin avisar afirma que eso es todo lo que hay.
//   · QUE FALLAR EL NOMBRE DE QUIEN SUBIÓ PIERDA EL DOCUMENTO. `perfiles` es un segundo viaje: si
//     falla, el documento se lista igual y el nombre queda en `null` («sin identificar»).
//   · QUE UN ERROR DE LECTURA SE DEVUELVA COMO LISTA VACÍA. Vacío se dibuja «0 documentos», que es
//     una afirmación sobre el respaldo de la empresa que un error no habilita.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getDocumentosDelProveedor, TOPE_DOCUMENTOS } from './documentosProveedorService.ts'

const PROVEEDOR = '5ac13b5f-d264-40f0-91e2-2be28443fb04'
const UID = '9d1f6b2e-1c3a-4a55-9f0e-2b7c8d4e5f60'

interface Consulta {
  tabla: string
  columnas: string
  filtros: [string, unknown][]
  nulos: string[]
  ordenes: [string, boolean][]
  limite?: number
}

function fila(n: number) {
  return {
    id: `doc-${n}`,
    nombre_archivo: `contrato-${n}.pdf`,
    tipo_mime: 'application/pdf',
    tamano_bytes: 1024,
    categoria: 'contrato',
    descripcion: null,
    creado_en: '2026-09-09T12:00:00Z',
    subido_por: UID,
  }
}

/** Un PostgREST de mentira que anota QUÉ se pidió: la tabla, los filtros, el orden y el tope. */
function baseFalsa(
  filas: ReturnType<typeof fila>[],
  opciones: { error?: string | null; perfiles?: { id: string; nombre: string | null }[] | null } = {},
) {
  const { error = null, perfiles = [{ id: UID, nombre: 'Rodrigo' }] } = opciones
  const consultas: Consulta[] = []
  const cliente = {
    from: (tabla: string) => ({
      select: (columnas: string) => {
        const c: Consulta = { tabla, columnas, filtros: [], nulos: [], ordenes: [] }
        consultas.push(c)
        const q = {
          eq: (col: string, val: unknown) => { c.filtros.push([col, val]); return q },
          is: (col: string, val: unknown) => { if (val === null) c.nulos.push(col); return q },
          order: (col: string, o?: { ascending?: boolean }) => {
            c.ordenes.push([col, o?.ascending !== false]); return q
          },
          limit: (n: number) => {
            c.limite = n
            return Promise.resolve(error ? { data: null, error: { message: error } } : { data: filas, error: null })
          },
          in: (col: string, vals: unknown[]) => {
            c.filtros.push([col, vals])
            return Promise.resolve(perfiles ? { data: perfiles, error: null } : { data: null, error: { message: 'denied' } })
          },
        }
        return q
      },
    }),
  } as unknown as SupabaseClient
  return { cliente, consultas }
}

test('un id que no es un uuid no llega a Postgres', async () => {
  const { cliente, consultas } = baseFalsa([fila(1)])
  const r = await getDocumentosDelProveedor(cliente, 'nuevo')
  assert.equal(consultas.length, 0)
  assert.equal(r.data, null)
  assert.equal(r.error, 'Ese proveedor no existe.')
})

test('los dados de baja no se traen, y el último va arriba', async () => {
  const { cliente, consultas } = baseFalsa([fila(1)])
  const r = await getDocumentosDelProveedor(cliente, PROVEEDOR)
  assert.equal(consultas[0].tabla, 'proveedor_documento')
  assert.deepEqual(consultas[0].filtros, [['proveedor_id', PROVEEDOR]])
  assert.deepEqual(consultas[0].nulos, ['eliminado_en'])
  assert.deepEqual(consultas[0].ordenes[0], ['creado_en', false])
  assert.equal(r.error, null)
  assert.equal(r.data?.documentos.length, 1)
})

test('un recorte por el tope se declara, nunca se hace en silencio', async () => {
  const muchos = Array.from({ length: TOPE_DOCUMENTOS + 1 }, (_, i) => fila(i))
  const { cliente, consultas } = baseFalsa(muchos)
  const r = await getDocumentosDelProveedor(cliente, PROVEEDOR)
  // Se pide UNO más que el tope justamente para poder saber que hay más.
  assert.equal(consultas[0].limite, TOPE_DOCUMENTOS + 1)
  assert.equal(r.data?.truncado, true)
  assert.equal(r.data?.documentos.length, TOPE_DOCUMENTOS)
})

test('si no se pudo leer quién subió, el documento se lista igual y el nombre queda nulo', async () => {
  const { cliente } = baseFalsa([fila(1)], { perfiles: null })
  const r = await getDocumentosDelProveedor(cliente, PROVEEDOR)
  assert.equal(r.data?.documentos.length, 1)
  assert.equal(r.data?.documentos[0].subido_por_nombre, null)
})

test('un error de PostgREST se devuelve como error, no como lista vacía', async () => {
  const { cliente } = baseFalsa([], { error: 'permission denied for table proveedor_documento' })
  const r = await getDocumentosDelProveedor(cliente, PROVEEDOR)
  assert.equal(r.data, null)
  assert.match(r.error ?? '', /permission denied/)
})

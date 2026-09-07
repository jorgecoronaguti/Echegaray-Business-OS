// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN, uno por uno:
//
//   · QUE «NO PUDE LEER» SE DIBUJE COMO «NO TIENE». Es el defecto caro de esta pantalla: un error
//     de lectura publicado como ausencia dice que un proveedor no tiene comprobantes guardados
//     cuando la verdad es que nadie pudo mirar. Las cuatro ausencias tienen que ser cuatro.
//   · QUE SE AFIRME POR QUÉ NO HAY PAPELES SIN SABERLO. Si la resolución de nombres no se pudo
//     leer, no se puede decir «se le compró y no hay archivo» ni «no se le compró»: no se sabe.
//   · QUE EL ORDEN SEA EL DE LA SUBIDA Y NO EL DE LA COMPRA. El backfill subió 58 papeles de meses
//     distintos en dos días: ordenar por `subido_at` pone primero el último upload y lo hace pasar
//     por la última factura.
//   · QUE EL CONTEO SALGA DE LO QUE SE TRAJO. El panel lista 12; si el total se calculara con
//     `data.length`, «12» se leería como «tiene 12» cuando tiene 40.
//   · QUE UN ID INVENTADO VIAJE A POSTGRES. `?p=nuevo` volvería como error de sintaxis de uuid y la
//     pantalla lo mostraría como un fallo de lectura donde no hay nada que leer.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { claseDeArchivo, comoSeVinculo, estadoDePapeles } from './papelesProveedor.ts'
import { getPapelesDelProveedor, TOPE_PAPELES } from './proveedoresService.ts'
import type { ComprasDelProveedor } from './proveedoresService.ts'
import type { PapelProveedor, ServiceResult, PapelesLeidos } from '../types'

const PROVEEDOR = '5ac13b5f-d264-40f0-91e2-2be28443fb04'

function papel(p: Partial<PapelProveedor> = {}): PapelProveedor {
  return {
    adjunto_id: 'a1', nombre: 'factura.jpg', media_type: 'image/jpeg', bytes: 1000,
    subido_at: '2026-08-20T19:30:15Z', vinculado_por: 'registro',
    compra_clave: 'c:33708332599|0139-00002714', compra_fila: 881,
    compra_fecha: '2026-08-20', comprobante: '0139-00002714', total: 11014.96,
    ...p,
  }
}

const conCompras: ComprasDelProveedor = {
  nombres: [{ nombre_norm: 'COMBUSTIBLES BARCELO', comprobantes: 30, total: 900000, manual: false }],
  comprobantes: 30,
  comprado: 900000,
}
const sinCompras: ComprasDelProveedor = { nombres: [], comprobantes: 0, comprado: null }

const leido = (papeles: PapelProveedor[], total = papeles.length): ServiceResult<PapelesLeidos> =>
  ({ data: { papeles, total }, error: null })

// ── LAS CUATRO AUSENCIAS ────────────────────────────────────────────────────────────────────────

test('un error de lectura NO es «no tiene papeles»', () => {
  const e = estadoDePapeles({ data: null, error: 'permission denied for view proveedor_papel' }, conCompras)
  assert.equal(e.clase, 'sin-leer')
  assert.match(e.clase === 'sin-leer' ? e.motivo : '', /permission denied/)
})

test('sin lectura pedida tampoco se afirma nada', () => {
  assert.equal(estadoDePapeles(null, conCompras).clase, 'sin-leer')
})

test('sin papeles y con compras vinculadas: falta el archivo', () => {
  const e = estadoDePapeles(leido([]), conCompras)
  assert.deepEqual(e, { clase: 'ninguno', porque: 'sin-archivo' })
})

test('sin papeles y sin ningún nombre vinculado: todavía no se le compró', () => {
  const e = estadoDePapeles(leido([]), sinCompras)
  assert.deepEqual(e, { clase: 'ninguno', porque: 'sin-compras' })
})

test('sin papeles y sin poder leer las compras: no se sabe cuál de las dos es', () => {
  // Éste es el que se cuela: es tentador contestar «sin archivo» porque no hay papeles, pero eso
  // afirma que SÍ se le compró, y esa lectura falló.
  const e = estadoDePapeles(leido([]), null)
  assert.deepEqual(e, { clase: 'ninguno', porque: 'no-se-sabe' })
})

// ── LO QUE SE MUESTRA CUANDO SÍ HAY ─────────────────────────────────────────────────────────────

test('con papeles: se listan los traídos y se dice el total de la base', () => {
  const e = estadoDePapeles(leido([papel(), papel({ adjunto_id: 'a2' })], 47), conCompras)
  assert.equal(e.clase, 'papeles')
  if (e.clase !== 'papeles') return
  assert.equal(e.mostrados, 2)
  assert.equal(e.total, 47)
})

test('el total nunca se publica por debajo de lo que se está viendo', () => {
  // `count` puede volver null y degradar a 0. «Se ven los 2 más recientes de 0» es un imposible en
  // pantalla: se publica el mayor de los dos.
  const e = estadoDePapeles(leido([papel(), papel({ adjunto_id: 'a2' })], 0), conCompras)
  assert.equal(e.clase === 'papeles' && e.total, 2)
})

// ── CÓMO SE SUPO QUE EL PAPEL ES DE ESA COMPRA ──────────────────────────────────────────────────

test('cada vía se nombra distinto y una desconocida no pasa por hecho', () => {
  assert.equal(comoSeVinculo('registro'), 'del bot')
  assert.equal(comoSeVinculo('match_numero'), 'por número')
  assert.equal(comoSeVinculo('match_manual'), 'a mano')
  assert.equal(comoSeVinculo('sin_vincular'), 'sin origen')
  assert.equal(comoSeVinculo('lo_que_venga'), 'sin origen')
})

test('el tipo de archivo sale del media type, y sin media type no se inventa', () => {
  assert.equal(claseDeArchivo('image/jpeg'), 'foto')
  assert.equal(claseDeArchivo('application/pdf'), 'PDF')
  assert.equal(claseDeArchivo(null), 'archivo')
  assert.equal(claseDeArchivo('application/zip'), 'archivo')
})

// ── LA CONSULTA ─────────────────────────────────────────────────────────────────────────────────

interface Consulta {
  tabla: string; columnas: string; conteo?: string
  filtros: [string, unknown][]; ordenes: [string, boolean][]; limite?: number
}

/** Un PostgREST de mentira que anota QUÉ se pidió: la tabla, el conteo, el orden y el tope. */
function baseFalsa(filas: PapelProveedor[], count: number | null, error: string | null) {
  const consultas: Consulta[] = []
  const cliente = {
    from: (tabla: string) => ({
      select: (columnas: string, opciones?: { count?: string }) => {
        const c: Consulta = { tabla, columnas, conteo: opciones?.count, filtros: [], ordenes: [] }
        consultas.push(c)
        const constructor = {
          eq: (col: string, val: unknown) => { c.filtros.push([col, val]); return constructor },
          order: (col: string, o?: { ascending?: boolean }) => {
            c.ordenes.push([col, o?.ascending !== false]); return constructor
          },
          limit: (n: number) => {
            c.limite = n
            return Promise.resolve(error
              ? { data: null, count: null, error: { message: error } }
              : { data: filas, count, error: null })
          },
        }
        return constructor
      },
    }),
  } as unknown as SupabaseClient
  return { cliente, consultas }
}

test('se ordena por la fecha de la COMPRA, no por la de subida, y con el tope del panel', async () => {
  const { cliente, consultas } = baseFalsa([papel()], 47, null)
  const r = await getPapelesDelProveedor(cliente, PROVEEDOR)

  assert.equal(consultas[0].tabla, 'proveedor_papel')
  assert.deepEqual(consultas[0].filtros, [['proveedor_id', PROVEEDOR]])
  // El PRIMER orden manda. Si `subido_at` fuera el primero, el panel mostraría el último upload
  // como la última factura.
  assert.deepEqual(consultas[0].ordenes[0], ['compra_fecha', false])
  assert.equal(consultas[0].limite, TOPE_PAPELES)
  assert.equal(consultas[0].conteo, 'exact')
  assert.equal(r.error, null)
})

test('el total sale del conteo de la base, no de las filas traídas', async () => {
  const { cliente } = baseFalsa([papel()], 47, null)
  const r = await getPapelesDelProveedor(cliente, PROVEEDOR)
  assert.equal(r.data?.papeles.length, 1)
  assert.equal(r.data?.total, 47)
})

test('un conteo que no llegó degrada a lo listado, nunca a cero', async () => {
  const { cliente } = baseFalsa([papel()], null, null)
  const r = await getPapelesDelProveedor(cliente, PROVEEDOR)
  assert.equal(r.data?.total, 1)
})

test('un error de PostgREST se devuelve como error, no como lista vacía', async () => {
  const { cliente } = baseFalsa([], null, 'relation "proveedor_papel" does not exist')
  const r = await getPapelesDelProveedor(cliente, PROVEEDOR)
  assert.equal(r.data, null)
  assert.match(r.error ?? '', /does not exist/)
  // Y la pantalla lo dice como lo que es.
  assert.equal(estadoDePapeles(r, conCompras).clase, 'sin-leer')
})

test('un id que no es un uuid no llega a Postgres', async () => {
  const { cliente, consultas } = baseFalsa([papel()], 1, null)
  const r = await getPapelesDelProveedor(cliente, 'nuevo')
  assert.equal(consultas.length, 0)
  assert.equal(r.data, null)
  assert.equal(r.error, 'Ese proveedor no existe.')
})

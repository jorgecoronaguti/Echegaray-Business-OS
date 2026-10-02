// EL BLOQUE CUENTA CORRIENTE ES SÓLO LO FACTURADO (dueño, 02/10/2026: «dejalo si corresponde a cobros en
// blanco»).
//
// El defecto: `getCuentaCorriente` leía `cliente_cuenta_corriente`, que suma B y N. Messina debía B
// $91.055.367 + N $18.750.000 y el bloque publicaba $109.805.367 como un solo saldo. Este test fija CÓMO
// se pide: a la función, con categoría 'B', recortada al cliente — y que no se cae a la vista si la
// función falla, porque la vista es B+N.
//
// MUTACIONES QUE LO PONEN ROJO: volver a `.from('cliente_cuenta_corriente')`; pedir `p_categoria: null`;
// sacar el `.eq('cliente_id', …)`; atrapar el error y releer la vista.
//
// Lo que este test NO prueba —que la función recorte de verdad— lo prueba
// `orquestador/lib/cuenta-corriente-por-categoria.pgreprod.test.mjs` sobre un Postgres descartable.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCuentaCorriente } from './cuentaCorrienteService.ts'

interface Llamada { rpc?: { fn: string; args: unknown }; from?: string; eq: [string, unknown][] }

/** Un cliente de Supabase que anota qué se le pidió y contesta lo que se le dé. */
function falso(respuesta: { data: unknown; error: { message: string } | null }) {
  const llamada: Llamada = { eq: [] }
  const cadena = {
    eq(col: string, v: unknown) { llamada.eq.push([col, v]); return cadena },
    select() { return cadena },
    maybeSingle: async () => respuesta,
  }
  const cliente = {
    rpc(fn: string, args: unknown) { llamada.rpc = { fn, args }; return cadena },
    from(t: string) { llamada.from = t; return cadena },
  }
  return { supabase: cliente as unknown as SupabaseClient, llamada }
}

const MESSINA = '2b151bfe-d65f-49a6-a297-15732b0c80a3'

test('pide la cuenta corriente a la función, sólo categoría B y sólo de este cliente', async () => {
  const { supabase, llamada } = falso({
    data: { cliente_id: MESSINA, nombre_comercial: 'Messina', saldo: '91055367.06', comprobantes_pendientes: '9', dso: '58.4' },
    error: null,
  })
  const r = await getCuentaCorriente(supabase, MESSINA)

  assert.equal(llamada.from, undefined, 'MUTACIÓN: volvió a leer una tabla/vista — `cliente_cuenta_corriente` suma B y N')
  assert.deepEqual(llamada.rpc, {
    fn: 'cuenta_corriente_de_clientes',
    args: { p_desde: null, p_hasta: null, p_categoria: 'B' },
  })
  assert.deepEqual(llamada.eq, [['cliente_id', MESSINA]], 'sin el recorte por cliente, maybeSingle recibe la cartera entera')
  assert.equal(r.error, null)
  assert.equal(r.data?.saldo, 91055367.06)
  assert.equal(r.data?.comprobantes_pendientes, 9, 'el bigint llega como string y se normaliza en el borde')
  assert.equal(r.data?.dso, 58.4)
})

test('si la función con categoría no está en la base, el error sube: no se relee la vista B+N', async () => {
  const { supabase, llamada } = falso({
    data: null,
    error: { message: 'Could not find the function public.cuenta_corriente_de_clientes(p_categoria, p_desde, p_hasta)' },
  })
  const r = await getCuentaCorriente(supabase, MESSINA)

  assert.equal(r.data, null)
  assert.match(r.error ?? '', /cuenta_corriente_de_clientes/)
  assert.equal(llamada.from, undefined, 'MUTACIÓN: un respaldo a la vista publicaría B+N como si fuera blanco')
})

test('cliente sin movimientos B: null sin error (no un cero fabricado)', async () => {
  const { supabase } = falso({ data: null, error: null })
  assert.deepEqual(await getCuentaCorriente(supabase, MESSINA), { data: null, error: null })
})

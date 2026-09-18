// «1.500» ES MIL QUINIENTOS — la regla, y el efecto leído en la base.
//
// Auditoría del 18/09/2026, N1: `aNumeroOpcional` hacía `Number(t.replace(',', '.'))`. En San Juan el punto separa
// miles, así que «1.500» se guardaba 1,5 en la cantidad de una partida: un factor de mil en un presupuesto, sin
// error y sin aviso. Y el deshacer leía el mismo número con otro lector, así que Cmd+Z decía «la celda la cambió
// otra persona» sobre una celda que nadie tocó.
//
// LA PARTE DE BASE CORRE SIEMPRE (como `escrituraCondicional.test.ts`): crea una cotización propia
// `ZZ-TEST-NUMERO-*`, le escribe una partida con lo que devuelve `aNumeroOpcional`, lee la columna `numeric` y
// borra la cotización (la partida cae en cascada). Sin credenciales, falla diciéndolo.
//
// MUTACIÓN QUE LO PONE ROJO: volver a `Number(t.replace(',', '.'))`.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aNumeroOpcional } from './numeroDePartida.ts'

test('LA REGLA: el punto separa miles, la coma decimales', () => {
  assert.equal(aNumeroOpcional('1.500'), 1500, 'MUTACIÓN: «1.500» volvió a ser 1,5')
  assert.equal(aNumeroOpcional('2.250'), 2250)
  assert.equal(aNumeroOpcional('1.234,5'), 1234.5, 'antes era «error»')
  assert.equal(aNumeroOpcional('1.000,00'), 1000)
  assert.equal(aNumeroOpcional('1,5'), 1.5)
  assert.equal(aNumeroOpcional('46,74'), 46.74)
  // Lo que la celda reenvía al deshacer: el valor guardado dibujado con coma.
  assert.equal(aNumeroOpcional('123,5'), 123.5)
  // Un punto con uno o dos decimales sigue siendo decimal: «8.5» no es 85.
  assert.equal(aNumeroOpcional('8.5'), 8.5)
  assert.equal(aNumeroOpcional('12.50'), 12.5)
  assert.equal(aNumeroOpcional(''), null)
  assert.equal(aNumeroOpcional(null), null)
  assert.equal(aNumeroOpcional('-3'), 'error')
  assert.equal(aNumeroOpcional('abc'), 'error')
  // LÍMITE DEL LECTOR, declarado en el código: tres dígitos después del punto son miles. «0.500» es 500;
  // en es-AR medio se escribe «0,500».
  assert.equal(aNumeroOpcional('0.500'), 500)
  assert.equal(aNumeroOpcional('0,500'), 0.5)
})

let servicio: SupabaseClient | null = null
const cotizaciones: string[] = []

async function base(): Promise<SupabaseClient> {
  if (servicio) return servicio
  const { loadEnvLocalInto } = await import('../../../../scripts/lib/env-file.mjs')
  loadEnvLocalInto(process.env, new URL('../../../../.env.local', import.meta.url).pathname)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srv = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert.ok(url && srv, 'SIN CREDENCIALES DE SUPABASE (.env.local): «1.500» NO se probó contra la base.')
  const { createClient } = await import('@supabase/supabase-js')
  servicio = createClient(url as string, srv as string, { auth: { persistSession: false } })
  return servicio
}

after(async () => {
  if (servicio && cotizaciones.length) await servicio.from('cotizaciones').delete().in('id', cotizaciones)
})

test('EL EFECTO: «1.500» tecleado queda 1500 en `cotizacion_partida.cantidad`', async () => {
  const sb = await base()
  const { data: cot, error: eCot } = await sb.from('cotizaciones').insert({
    cliente: 'ZZ-TEST-NUMERO', obra_nombre: `ZZ-TEST-NUMERO-${Date.now()}`, estado: 'borrador',
  }).select('id').single()
  assert.equal(eCot, null, `no pude crear la cotización de prueba: ${eCot?.message}`)
  cotizaciones.push(cot!.id as string)

  const tecleado = { cantidad: '1.500', precio_subcontrato: '2.250,50' }
  const { data: partida, error } = await sb.from('cotizacion_partida').insert({
    cotizacion_id: cot!.id, orden: 1, descripcion: 'ZZ-TEST «1.500» es mil quinientos',
    cantidad: aNumeroOpcional(tecleado.cantidad), precio_subcontrato: aNumeroOpcional(tecleado.precio_subcontrato),
  }).select('id').single()
  assert.equal(error, null, `no pude escribir la partida: ${error?.message}`)

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO, en una lectura aparte.
  const { data: leida } = await sb.from('cotizacion_partida').select('cantidad, precio_subcontrato').eq('id', partida!.id).single()
  assert.equal(Number(leida!.cantidad), 1500, 'la base guardó otra cosa que mil quinientos')
  assert.equal(Number(leida!.precio_subcontrato), 2250.5)
})

// EL CONSUMO DE ANALÍTICAS ES NETO DE IVA — y nadie más cambia (migración 20260917T1900).
//
// Esta prueba lee el SQL de la migración: si alguien vuelve a mandar `false` (o nada) desde Analíticas,
// el IVA entra otra vez al consumo contra un presupuesto sin IVA, y el excedido vuelve a mentir. Si
// alguien redefine la función única o la de la ficha, las pantallas que muestran lo PAGADO cambian.
// La prueba contra la base real es `orquestador/lib/analiticas-neto.pg.test.mjs`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'supabase', 'migrations',
  '20260917T1900_analiticas_consumo_neto_de_iva.sql'), 'utf8')
const funcion = (firma: string): string => {
  const i = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${firma}`)
  assert.ok(i >= 0, `falta ${firma}`)
  return SQL.slice(i, SQL.indexOf('$function$;', i))
}

test('Analíticas pide neto: el costo, lo sin obra y el consumo mensual', () => {
  const a = funcion('analiticas_costos(')
  assert.match(a, /p_desde, p_hasta, true\)[\s\S]*p_desde, p_hasta, true\)/)
  assert.match(funcion('analiticas_consumo_mensual('), /costo_de_obra_filas_iva\(ids\.obras, null, true\)/)
  assert.match(funcion('costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date, p_neto boolean)'), /costo_de_obra_filas_iva\(p_obras, null, p_neto\)/)
})

test('las pantallas de lo pagado no cambian: la versión de tres argumentos delega con false y la única no se redefine', () => {
  assert.match(funcion('costo_de_obras_a_la_fecha(p_obras text[], p_desde date, p_hasta date)\n'), /costo_de_obras_a_la_fecha\(p_obras, p_desde, p_hasta, false\)/)
  assert.match(funcion('compras_sin_obra_de_clientes(p_clientes uuid[], p_desde date, p_hasta date)\n'), /p_desde, p_hasta, false\)/)
  assert.doesNotMatch(SQL, /FUNCTION public\.costo_de_obra_filas\(/i)
  assert.doesNotMatch(SQL, /FUNCTION public\.costo_de_obras_a_la_fecha\(p_obras text\[\]\)/i)
  assert.match(funcion('costo_de_obra_filas_iva('), /case when p_neto then n\.neto else f\.total end/)
})

test('la regla: importe si discrimina IVA (F A, NC, ND); total si no', () => {
  const r = funcion('costo_neto_de_iva(')
  assert.match(r, /p_importe is not null and coalesce\(p_iva, 0\) <> 0/)
  assert.match(r, /in \('FA', 'NC', 'ND', 'NCA', 'NDA'\)/)
  assert.match(r, /then p_importe\s+else p_total/)
})

test('RLS: el costo cotizado lo lee quien ve economía, no toda Administración', () => {
  assert.match(SQL, /alter policy presupuestos_select on public\.presupuestos using \(\(select public\.ve_economia\(\)\)\)/)
})

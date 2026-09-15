// EL COSTO POR OBRA SE IMPUTA POR obra_id — lo que la migración 20260915T2300 tiene que decir.
//
// ═══ EL DEFECTO QUE ATRAPA ═══
//
// `obra_costo_real` resolvía la obra por la columna J contra `obra_alias`: las 335 compras de «La
// Estrella» caían en OB-0003 ($156,3 M) y el comedor, los galpones y la mampostería dibujaban $0.
// Estos tests leen el ARCHIVO: si alguien vuelve a escribir `norm_obra(c.obra_texto)` en la vista, o
// saca de la RPC la actualización de `costos_obra` / `compra_obra_asignada`, se ponen rojos sin base. El EFECTO —los números por obra y la RPC
// escribiendo las tres tablas— lo prueba `costo-por-obra-por-obra-id.pg.test.mjs` contra la base.
// `costo_de_obras_a_la_fecha` queda fuera a propósito: la reescribe `20260915T2320`.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(DIR, '../../supabase/migrations/20260915T2300_costo_por_obra_por_obra_id.sql'), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n')
const tramo = (desde, hasta) => sinComentarios(SQL.slice(SQL.indexOf(desde), SQL.indexOf(hasta)))

const vista = tramo('create or replace view public.obra_costo_real', 'comment on view public.obra_costo_real')
const rpc = tramo('create or replace function public.compra_obra_asignar', '-- FIN DE compra_obra_asignar')
const auxiliar = tramo('create or replace function public.compra_costo_por_obra_actualizar', 'create or replace function public.compra_obra_asignar')
const proveedor = tramo('create or replace view public.proveedor_compra', '-- FIN DE LA VISTA proveedor_compra')

test('obra_costo_real une por costos_obra.obra_id y nunca por texto ni alias', () => {
  assert.match(vista, /left join public\.costos_obra c\s+on c\.obra_id = oc\.id/)
  assert.doesNotMatch(vista, /obra_alias|norm_obra|obra_texto/, 'volvió el puente por texto: la J dice el cliente, no la obra')
  // Las mismas columnas y en el mismo orden: `obra_economia` y `obra_panel` cuelgan de esta vista.
  for (const col of ['as obra_id', 'as obra_nombre', 'oc.estado', 'oc.tipo', 'as n_comprobantes', 'as costo_real', 'as costo_mano_de_obra']) {
    assert.ok(vista.includes(col), `falta la columna ${col}`)
  }
  assert.ok(vista.indexOf('as costo_real') < vista.indexOf('as costo_mano_de_obra'), 'el orden de las columnas cambió')
})

test('obra_costo_real excluye anuladas y eliminadas por la referencia del sync, y corre con el RLS de quien mira', () => {
  assert.match(vista, /with \(security_invoker = true\)/, 'un create or replace sin la opción la BORRA')
  assert.match(vista, /c\.referencia_externa = coalesce\(s\.sheet_id::text, s\.fila::text\)/)
  assert.match(vista, /s\.anulada/)
  assert.match(vista, /= 'ELIMINADO'/)
})

test('la RPC actualiza costos_obra y compra_obra_asignada en la misma transacción, con la referencia del sync', () => {
  assert.match(rpc, /perform public\.compra_costo_por_obra_actualizar\(/, 'la RPC dejó de tocar el costo por obra')
  assert.match(rpc, /coalesce\(v_fila\.sheet_id::text, v_fila\.fila::text\)/, 'la referencia no es la del sync')
  assert.match(auxiliar, /update public\.costos_obra\s+set destino = p_destino, obra_id = p_obra_id\s+where referencia_externa = p_referencia/)
  // Las vías de `compras-obra-asignada.mjs`, y ninguna otra: el CHECK de la tabla las rechazaría.
  for (const via of ["'obra_de_la_fila'", "'estructura_de_la_fila'", "'sin_obra'"]) assert.ok(auxiliar.includes(via), `falta la vía ${via}`)
  assert.doesNotMatch(auxiliar, /'obra_por_alias'|'obra_por_nombre'|'unica_obra_del_cliente'/, 'la app no infiere: eso es del sync')
  // Vaciar la celda NO inventa una obra.
  assert.match(auxiliar, /if p_valor is null then[\s\S]*?set obra_id = null/)
})

test('la RPC conserva el portero, el bloqueo, el control de esperado, la validación, la cola y los grants', () => {
  assert.match(rpc, /if not public\.es_administracion\(\) then/)
  assert.match(rpc, /where fila = p_fila for update/)
  assert.match(rpc, /is distinct from coalesce\(nullif\(btrim\(p_esperado\), ''\), ''\)/)
  assert.match(rpc, /v_res := public\.obra_celda_resolver\(v_valor\)/)
  assert.match(rpc, /insert into public\.compra_obra_cambio/)
  assert.match(rpc, /security definer\s+set search_path = public/)
  assert.match(rpc, /revoke all on function public\.compra_obra_asignar\(integer, text, text\) from public, anon;/)
  assert.match(rpc, /grant execute on function public\.compra_obra_asignar\(integer, text, text\) to authenticated;/)
  // Las auxiliares no las llama nadie más que la RPC.
  assert.match(SQL, /revoke all on function public\.compra_costo_por_obra_actualizar\(text, text, text, text, text\) from public, anon, authenticated;/)
  assert.match(SQL, /revoke all on function public\.cliente_canonico_de\(text\) from public, anon, authenticated;/)
})

test('costo_de_obras_a_la_fecha no se redefine acá: la reescribe 20260915T2320 sobre costo_de_obra_filas', () => {
  assert.doesNotMatch(sinComentarios(SQL), /function public\.costo_de_obras_a_la_fecha/)
})

test('proveedor_compra publica la columna Obra al final, en orden, y sigue corriendo como quien mira', () => {
  assert.match(proveedor, /with \(security_invoker = true\)/)
  const cols = ['cs.fila', 'cs.clave', 'cs.fecha', 'cs.tipo', 'cs.comprobante', 'cs.concepto', 'cs.obra_texto', 'cs.total',
    'cs.estado,', 'cs.estado_pago', 'cs.saldo_pendiente', 'cs.anulada', 'cs.destino', 'cs.obra_id', 'cs.obra_celda',
    'cs.obra_inconsistencia', 'cs.sheet_id']
  const posiciones = cols.map((c) => proveedor.indexOf(c))
  assert.ok(posiciones.every((p) => p >= 0), `falta una columna: ${cols[posiciones.indexOf(-1)]}`)
  assert.deepEqual(posiciones, [...posiciones].sort((a, b) => a - b), 'las columnas cambiaron de orden: create or replace view no reordena')
  assert.match(proveedor, /and \(select public\.es_administracion\(\)\)/)
})

test('la migración no maneja su propia transacción', () => {
  const limpio = sinComentarios(SQL).replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1?\$/g, ' ')
  assert.doesNotMatch(limpio, /(^|;|\s)(begin|commit)\s*;/i)
})

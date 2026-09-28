// LA CACHÉ DE LA FICHA: TODA TABLA QUE LA FICHA LEE TIENE TRIGGER O ESTÁ DECLARADA — sin base.
//
// ═══ POR QUÉ ESTE TEST EXISTE (28/09/2026) ═══
//
// La primera versión de 20260928T2330 ponía triggers en las tablas que su autor recordaba, y el
// auditor encontró 16 que la ficha lee sin trigger ni declaración — dos con plata
// (`certificado_cliente`, `liquidacion_linea`). Con vencimiento de 60 min eso es una ficha que
// muestra un certificado cobrado como pendiente durante hasta 70 min, sin nada que lo avise.
//
// El test DDL (`.pg.test.mjs`) prueba que los triggers que existen invalidan bien, pero no puede
// ver los que faltan, y además no se corre contra la base viva (19:08 del 28/09: trabó el login).
// Éste es estático: compara una copia literal del grafo contra el texto de la migración.
//
// ═══ DE DÓNDE SALE `GRAFO` ═══
//
// Recorrido del catálogo de la base viva el 28/09, sólo SELECT: desde `pantalla_cliente_en_vivo` y
// `hh_de_obra_en_vivo`, por `pg_get_functiondef` y `pg_get_viewdef`, arista = `from`/`join` sobre
// una relación o llamada `f(`. Si una migración nueva hace que la ficha lea otra tabla, se agrega
// acá — y el test obliga a decidir su trigger o su razón en la migración.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · Una tabla del grafo sin `trg_ficha_inv` ni lugar en la lista «cubierto sólo por el
//      vencimiento». Un trigger comentado no cuenta: se buscan sobre el SQL sin comentarios.
//  2 · Un `drop trigger` sobre una tabla de la app (AccessExclusiveLock: frena los SELECT) o un
//      `create trigger` que no sea `or replace` (obligaría a volver al `drop` para reaplicar).
//  3 · Una tabla con trigger de huella cuya huella no se calcula: `ficha_cliente_cache_huellas` no
//      devuelve filas para ella, la comparación al commit no ve diferencias y NUNCA invalida — el
//      peor caso, porque parece funcionar. O que no se siembre, y la primera sincronización lo
//      invalide todo.
//  4 · Un modo de `tr_ficha_inv_fila` que la función no maneja: el trigger corre y no marca nada.
//  5 · Un trigger (o la RPC de la web) que escribe `ficha_cliente_cache`, directo o por una función
//      que llama. El cron retiene esas filas mientras calcula: el `delete` del trigger de `perfiles`
//      esperaba hasta el `lock_timeout = 8s` de `authenticator` o cerraba un 40P01 (auditor, 28/09).
//  6 · Marcas que se pierden: una clave primaria sin `txid` (una transacción abierta choca con la
//      marca de otra y no deja la suya), o un cron que borra marcas que no leyó.
//  7 · Un cron que vuelve a ser una sola transacción, o una lectura que sirve una fila marcada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRACION_REL, declaradasDe, triggersDe } from './ficha-cache-grafo.mjs'

const MIGRACION = join(import.meta.dirname, '..', '..', MIGRACION_REL)

/** Las 53 tablas que lee la ficha (catálogo vivo, 28/09; `verificar-grafo-ficha-cache.mjs`). */
const GRAFO = [
  'analisis', 'analisis_linea', 'calendario_no_laborable', 'certificado_cliente', 'certificados',
  'cliente_acceso', 'cliente_alias', 'cliente_contacto', 'cliente_documento', 'cliente_nota',
  'cliente_orden', 'clientes', 'cobranzas', 'compra_obra_asignada', 'compra_sheet',
  'convenio_escala', 'costo_obra_quincena', 'costos_obra', 'cotizacion_partida', 'cotizaciones',
  'cuadrilla', 'drive_index', 'jornales_bloque_persona', 'liquidacion_linea', 'liquidacion_quincena',
  'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso', 'obra_alias', 'obra_asignacion',
  'obra_canonica', 'obra_carpeta_drive', 'obra_contrato', 'obra_documento', 'obra_economia_sheet',
  'obra_ejecucion', 'obra_ejecucion_equipo', 'obra_papel', 'obra_restriccion',
  'pedidos_materiales', 'perfiles', 'persona_tarifa', 'personas', 'presupuestos',
  'proveedor_alias', 'proveedores', 'recibo_sueldo_linea', 'recurso', 'recurso_precio',
  'registros_hh', 'subcontrato', 'tarea_tipo', 'tipo_cambio',
]

const texto = readFileSync(MIGRACION, 'utf8')
const sinComentarios = texto.replace(/--[^\n]*/g, '')

const triggers = () => triggersDe(texto)
const declaradas = () => declaradasDe(texto)

test('toda tabla del grafo tiene trigger o está declarada con su razón', () => {
  const conTrigger = new Set(triggers().map((t) => t.tabla))
  const decl = declaradas()
  const huerfanas = GRAFO.filter((t) => !conTrigger.has(t) && !decl.has(t))
  assert.deepEqual(huerfanas, [], `sin trigger ni declaración: ${huerfanas.join(', ')}`)
})

test('las dos tablas con plata tienen trigger, no sólo declaración', () => {
  const conTrigger = new Set(triggers().map((t) => t.tabla))
  for (const t of ['certificado_cliente', 'liquidacion_linea']) assert.ok(conTrigger.has(t), t)
})

test('ningún DDL de trigger toma AccessExclusiveLock sobre una tabla de la app', () => {
  const drops = [...sinComentarios.matchAll(/drop trigger[^;]*?\son public\.(\w+)/gi)].map((m) => m[1])
  assert.deepEqual(drops.filter((t) => t !== 'ficha_cliente_cache_tocada'), [])
  const planos = [...sinComentarios.matchAll(/create\s+trigger\s+(\w+)/gi)].map((m) => m[1])
  assert.deepEqual(planos, [], 'create trigger sin «or replace»')
  assert.match(sinComentarios, /set lock_timeout = '3s'/)
})

test('toda tabla con trigger de huella tiene huella calculada y sembrada', () => {
  const porHuella = triggers().filter((t) => t.funcion === 'tr_ficha_inv_marcar').map((t) => t.tabla)
  assert.ok(porHuella.includes('compra_obra_asignada'))
  for (const t of porHuella) assert.ok(triggers().find((x) => x.tabla === t).nivel === 'statement', t)
  const conRama = [...sinComentarios.matchAll(/p_tabla = '(\w+)'/g)].map((m) => m[1])
  const sembradas = sinComentarios.match(/from unnest\(array\[([^\]]+)\]\) t\(tabla\)/)[1]
    .match(/'(\w+)'/g).map((s) => s.replace(/'/g, ''))
  assert.deepEqual([...new Set(conRama)].sort(), [...porHuella].sort(), 'rama de huella ≠ triggers')
  assert.deepEqual([...sembradas].sort(), [...porHuella].sort(), 'huella sembrada ≠ triggers')
})

test('todo modo usado por un trigger por fila lo maneja tr_ficha_inv_fila', () => {
  const cuerpo = sinComentarios.slice(
    sinComentarios.indexOf('function public.tr_ficha_inv_fila()'),
    sinComentarios.indexOf('revoke all on function public.tr_ficha_inv_fila()'),
  )
  const manejados = new Set([...cuerpo.matchAll(/'(\w+)'/g)].map((m) => m[1]))
  const usados = triggers().filter((t) => t.funcion === 'tr_ficha_inv_fila').map((t) => t.modo)
  for (const m of new Set(usados)) assert.ok(manejados.has(m), `modo sin rama: ${m}`)
})

/** Cuerpo de cada función o procedure de la migración, por nombre. */
function cuerpos() {
  const re = /create or replace (?:function|procedure) public\.(\w+)\([\s\S]*?\$(function|procedure)\$([\s\S]*?)\$\2\$/g
  return new Map([...sinComentarios.matchAll(re)].map(([, nombre, , cuerpo]) => [nombre, cuerpo]))
}

/** Lo que corre adentro de la transacción de quien escribe: triggers, sus llamadas y la RPC web. */
function alcanzablesDesdeEscrituras() {
  const fns = cuerpos()
  const raices = [...sinComentarios.matchAll(/execute function public\.(\w+)\(/g)].map((m) => m[1])
  const pila = [...new Set([...raices, 'invalidar_ficha_cliente_cache'])]
  const vistos = new Set()
  while (pila.length) {
    const f = pila.pop()
    if (vistos.has(f)) continue
    vistos.add(f)
    for (const [, g] of (fns.get(f) ?? '').matchAll(/public\.(\w+)\(/g)) if (fns.has(g)) pila.push(g)
  }
  return vistos
}

test('ningún trigger ni la RPC de la web escribe ficha_cliente_cache: sólo marcan', () => {
  const fns = cuerpos()
  const alcanzables = alcanzablesDesdeEscrituras()
  for (const f of ['tr_ficha_inv_fila', 'tr_ficha_inv_comparar', 'tr_ficha_inv_marcar',
    'ficha_cliente_cache_marcar', 'invalidar_ficha_cliente_cache']) {
    assert.ok(alcanzables.has(f) && fns.has(f), `no se analizó ${f}`)
  }
  const escribe = /\b(delete\s+from|update|insert\s+into|truncate)\s+(public\.)?ficha_cliente_cache\b(?!_)/i
  const culpables = [...alcanzables].filter((f) => escribe.test(fns.get(f) ?? ''))
  assert.deepEqual(culpables, [], `escriben la caché desde la transacción de la app: ${culpables}`)
})

test('las marcas no se pierden: una por clave y transacción, y el cron borra sólo las que leyó', () => {
  assert.match(sinComentarios, /create table if not exists public\.ficha_cliente_cache_pendiente \([^;]*primary key \(clave, txid\)/)
  const marcar = cuerpos().get('ficha_cliente_cache_marcar')
  assert.match(marcar, /insert into public\.ficha_cliente_cache_pendiente[\s\S]*on conflict do nothing/)
  const consumir = cuerpos().get('ficha_cliente_cache_consumir')
  const borrados = [...consumir.matchAll(/delete from public\.ficha_cliente_cache_pendiente[^;]*;/g)].map((m) => m[0])
  assert.equal(borrados.length, 1)
  assert.match(borrados[0], /using unnest\(v_claves, v_txids\)[\s\S]*p\.clave = d\.clave and p\.txid = d\.txid/)
})

test('el cron confirma por fila y la lectura no sirve lo marcado', () => {
  const cron = cuerpos().get('refrescar_ficha_cliente_cache')
  assert.ok(cron, 'falta el procedure del cron')
  assert.match(sinComentarios, /create or replace procedure public\.refrescar_ficha_cliente_cache\(\)/)
  const lazo = cron.slice(cron.indexOf('for r in'), cron.indexOf('end loop'))
  assert.match(lazo, /ficha_cliente_cache_calcular\([^;]*;\s*commit;/)
  assert.match(cron, /ficha_cliente_cache_consumir\(\);\s*commit;/)
  assert.match(sinComentarios, /cron\.alter_job\([^;]*command := 'call public\.refrescar_ficha_cliente_cache\(\)'/)
  assert.match(cuerpos().get('ficha_cliente_cache_leer'), /not public\.ficha_cliente_cache_marcada\(p_rpc, p_clave\)/)
})

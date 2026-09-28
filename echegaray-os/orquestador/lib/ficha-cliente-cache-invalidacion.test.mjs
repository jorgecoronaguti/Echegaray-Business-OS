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
//  4 · Un modo de `tr_ficha_inv_fila` que la función no maneja: el trigger corre y no borra nada.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRACION = join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260928T2330_ficha_cache_invalidacion_por_trigger.sql',
)

/** Las 54 tablas que lee la ficha (catálogo vivo, 28/09). */
const GRAFO = [
  'analisis', 'analisis_linea', 'calendario_no_laborable', 'certificado_cliente', 'certificados',
  'cliente_acceso', 'cliente_alias', 'cliente_contacto', 'cliente_documento', 'cliente_nota',
  'cliente_orden', 'clientes', 'cobranzas', 'compra_obra_asignada', 'compra_sheet',
  'convenio_escala', 'costo_obra_quincena', 'costos_obra', 'cotizacion_partida', 'cotizaciones',
  'cuadrilla', 'drive_index', 'jornales_bloque_persona', 'liquidacion_linea', 'liquidacion_quincena',
  'obra_actividad', 'obra_actividad_nota', 'obra_actividad_paso', 'obra_alias', 'obra_asignacion',
  'obra_canonica', 'obra_carpeta_drive', 'obra_contrato', 'obra_documento', 'obra_economia_sheet',
  'obra_ejecucion', 'obra_ejecucion_equipo', 'obra_papel', 'obra_restriccion', 'obras',
  'pedidos_materiales', 'perfiles', 'persona_tarifa', 'personas', 'presupuestos',
  'proveedor_alias', 'proveedores', 'recibo_sueldo_linea', 'recurso', 'recurso_precio',
  'registros_hh', 'subcontrato', 'tarea_tipo', 'tipo_cambio',
]

const texto = readFileSync(MIGRACION, 'utf8')
const sinComentarios = texto.replace(/--[^\n]*/g, '')

/** Tablas con `create or replace trigger trg_ficha_inv ... on public.<tabla>`, y cómo. */
function triggers() {
  const re = /create or replace trigger trg_ficha_inv\s[^;]*?\son public\.(\w+)\s+for each (row|statement) execute function public\.(\w+)\(([^)]*)\)/g
  return [...sinComentarios.matchAll(re)].map(([, tabla, nivel, funcion, args]) => ({
    tabla, nivel, funcion, modo: args.split(',')[0]?.trim().replace(/'/g, ''),
  }))
}

/** Los identificadores entre acentos graves de la sección «cubierto sólo por el vencimiento». */
function declaradas() {
  const desde = texto.indexOf('═══ LO QUE QUEDA CUBIERTO SÓLO POR EL VENCIMIENTO')
  assert.ok(desde > 0, 'falta la sección de tablas declaradas en la cabecera')
  const hasta = texto.indexOf('═══', texto.indexOf('\n', desde))
  return new Set([...texto.slice(desde, hasta).matchAll(/`(\w+)`/g)].map((m) => m[1]))
}

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
  assert.deepEqual(drops.filter((t) => t !== 'ficha_cliente_cache_pendiente'), [])
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

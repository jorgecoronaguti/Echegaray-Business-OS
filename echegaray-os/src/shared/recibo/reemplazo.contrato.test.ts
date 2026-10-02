// LO QUE SOSTIENE EL REEMPLAZO DE RECIBOS (dueño, 02/10/2026), leído del código: no hay base en el test. Cada caso
// existe porque su contrario es un defecto concreto: un recibo vigente duplicado, una firma pisada, un reemplazado
// que la persona todavía ve o puede firmar, un número reutilizado o una fila borrada.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RAIZ = new URL('../../../', import.meta.url).pathname
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(--|\/\/).*$/gm, '')
const leer = (r: string) => sinComentarios(readFileSync(`${RAIZ}${r}`, 'utf8'))
const SQL = leer('supabase/migrations/20261002T2000_recibo_reemplazado_por_el_nuevo.sql')
const compacto = (s: string) => s.replace(/\s+/g, ' ')

function cuerpoDeRegistrar(): string {
  const i = SQL.indexOf('create or replace function public.registrar_recibo_liquidacion(')
  assert.ok(i >= 0)
  return compacto(SQL.slice(i, SQL.indexOf('end $$', i)))
}

test('el reemplazo ocurre dentro de registrar_recibo_liquidacion, después del insert: una sola transacción', () => {
  const f = cuerpoDeRegistrar()
  const insert = f.indexOf('insert into recibo_liquidacion')
  const update = f.indexOf("set estado = 'reemplazado'")
  assert.ok(insert > 0 && update > insert, 'el update de reemplazo va después del insert')
  assert.match(f, /reemplazado_por = v_id/)
})

test('lo reemplazable es exactamente lo que `decidirReemplazo` dice: sin firma, sin papel, sin archivar, sin reemplazar', () => {
  const f = cuerpoDeRegistrar()
  const where = f.slice(f.indexOf("set estado = 'reemplazado'"))
  for (const cond of [
    'persona_id = p_persona', 'quincena_desde = p_desde', 'quincena_hasta = p_hasta', 'id <> v_id',
    "estado <> 'reemplazado'", "estado <> 'archivado'", 'firmado_en is null', 'papel_path is null',
    'papel_sin_foto_en is null', 'archivado_en is null',
  ]) assert.ok(where.includes(cond), `falta la condición: ${cond}`)
})

test('si ya hay un firmado de esa persona y quincena no se emite, y se rechaza ANTES de tomar número', () => {
  const f = cuerpoDeRegistrar()
  assert.match(f, /raise exception 'Ya hay un recibo firmado de esta quincena: %'/)
  assert.ok(f.indexOf('Ya hay un recibo firmado') < f.indexOf('tomar_numero_de_recibo'), 'el rechazo no consume número')
  assert.ok(f.indexOf('pg_advisory_xact_lock') < f.indexOf('Ya hay un recibo firmado'), 'dos emisiones a la vez se serializan')
})

test('no se borra nada ni se reutiliza un número: el reemplazo es un update, nunca delete ni renumeración', () => {
  assert.doesNotMatch(SQL, /\bdelete\s+from\b/i)
  assert.doesNotMatch(SQL, /serie_numero\s*=|recibo_serie|ultimo\s*=/i)
})

test('la base acepta el estado y exige los tres sellos juntos; un reemplazado queda congelado', () => {
  const s = compacto(SQL)
  assert.match(s, /check \(estado in \([^)]*'reemplazado'\)\)/)
  assert.match(s, /\(estado = 'reemplazado'\) = \(reemplazado_por is not null and reemplazado_en is not null\)/)
  assert.match(s, /reemplazado_por is distinct from id/)
  assert.match(s, /create trigger recibo_liquidacion_reemplazado_congelado before update/)
  assert.match(s, /if old\.estado = 'reemplazado' then raise exception/)
})

test('la persona no ve lo reemplazado: la policy propia lo excluye', () => {
  assert.match(compacto(SQL), /create policy recibo_liquidacion_mio[\s\S]*estado <> 'reemplazado'/)
})

test('el arreglo de datos ubica por código con persona y quincena en el WHERE, y no toca lo firmado', () => {
  const todo = compacto(SQL)
  const datos = todo.slice(todo.indexOf('for r in select'))
  for (const par of ["'RP-000004', 'RP-000002'", "'RP-000004', 'RP-000003'", "'RP-000005', 'RP-000001'"]) {
    assert.ok(datos.includes(par), `falta el par ${par}`)
  }
  for (const cond of [
    'n.persona_id = v.persona_id', "n.quincena_desde = '2026-09-16'", "n.quincena_hasta = '2026-09-30'",
    'v.quincena_desde = n.quincena_desde', "v.estado <> 'reemplazado'", 'v.firmado_en is null',
    'v.papel_path is null', 'v.papel_sin_foto_en is null', 'v.archivado_en is null',
  ]) assert.ok(datos.includes(cond), `falta la condición del arreglo: ${cond}`)
})

// ── LOS LECTORES: ninguno trata un reemplazado como vigente ─────────────────────────────────────
const NEQ = /\.neq\('estado', 'reemplazado'\)/
const lectoresQueFiltran = [
  ['«Mi recibo» del empleado', 'src/features/empleado/services/miReciboDeQuincena.ts'],
  ['marca «impreso» del cuadro de Liquidación', 'src/features/administracion/services/recibosDeLaQuincenaService.ts'],
  ['PDF del lote', 'src/app/(main)/administracion/personas/recibos-lote/route.ts'],
  ['lo ya guardado del lote', 'src/features/administracion/services/recibosEmitidosActions.ts'],
] as const
for (const [que, ruta] of lectoresQueFiltran) {
  test(`${que} excluye lo reemplazado`, () => assert.match(leer(ruta), NEQ))
}

test('la ficha de administración NO filtra lo reemplazado: lo muestra atenuado y sin controles', () => {
  assert.doesNotMatch(leer('src/features/administracion/services/recibosEmitidosService.ts'), NEQ)
  const ui = leer('src/features/administracion/components/RecibosEmitidos.tsx')
  assert.match(ui, /opacity: reemplazado \? 0\.55 : 1/)
  assert.match(ui, /!reemplazado && <button[^>]*data-testid="recibo-reimprimir"/)
})

test('antes de aplicar la migración la ficha no pide la columna nueva en su select principal', () => {
  const svc = leer('src/features/administracion/services/recibosEmitidosService.ts')
  const principal = svc.slice(svc.indexOf(".from('recibo_liquidacion_emitido')"), svc.indexOf('.eq(\'persona_id\''))
  assert.doesNotMatch(principal, /reemplazado_/)
  const act = leer('src/features/administracion/services/recibosEmitidosActions.ts')
  const lectura = act.slice(act.indexOf('async function recibosDeLaQuincena'), act.indexOf('async function losQueQuedaron'))
  assert.doesNotMatch(lectura, /reemplazado_/)
})

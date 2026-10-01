import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PATRON_CONVENIO_FCL, cbuValido, controlDeCuentas, esquemaCuentas, exigeFcl,
  type CuentasDePersona,
} from './cuentasDelLegajo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que un obrero UOCRA sin cuenta del Fondo de Cese salga «en regla» porque tiene la de sueldo.
//     Es exactamente el caso que el dueño quiere ver (01/10/2026): el FCL es obligatorio por la Ley
//     22.250 y el lote AFON no tiene adónde depositar.
//  2. El contrario: exigirle FCL a quien no es de la construcción y dejarlo para siempre en «falta».
//  3. Un CBU de 22 dígitos con un dígito cambiado que pasa el largo y rebota en el banco.
//  4. Que la migración abra las cuentas a todo `authenticated`, o deje una función `security definer`
//     ejecutable por PUBLIC — las dos fugas que este repo ya pagó con `cbu` (20260909T1730).

const MIGRACION = fileURLToPath(new URL(
  '../../../../supabase/migrations/20261001T0300_legajo_cuentas_sueldo_y_fcl.sql', import.meta.url,
))
const sinComentarios = (sql: string) => sql.replace(/^[ \t]*--.*$/gm, ' ').replace(/\s+/g, ' ')

// Un CBU real de ejemplo con los dos verificadores bien (8º = 9, 22º = 1).
const CBU_OK = '2850590940090418135201'

const base: CuentasDePersona = {
  cbu: CBU_OK, cuenta_sueldo_estado: 'creada',
  fcl_cuenta: null, fcl_cbu: null, fcl_estado: null,
  convenio_colectivo: 'UOCRA — Ley 22.250 (construcción)',
}

test('obrero UOCRA con sueldo y sin FCL: falta_fcl, no «en regla»', () => {
  assert.equal(controlDeCuentas(base), 'falta_fcl')
  assert.equal(controlDeCuentas({ ...base, convenio_colectivo: '0076/75 UOCRA' }), 'falta_fcl')
})

test('obrero UOCRA con sueldo y FCL creada con número: completo', () => {
  assert.equal(controlDeCuentas({ ...base, fcl_estado: 'creada', fcl_cuenta: '000-123456/7' }), 'completo')
})

test('FCL «creada» sin ningún número no cuenta como creada', () => {
  assert.equal(controlDeCuentas({ ...base, fcl_estado: 'creada' }), 'falta_fcl')
})

test('no UOCRA sin FCL: completo si tiene la de sueldo', () => {
  assert.equal(controlDeCuentas({ ...base, convenio_colectivo: 'Empleados de comercio 130/75' }), 'completo')
})

test('sin convenio cargado el FCL se exige: no se afirma «no le corresponde»', () => {
  assert.equal(exigeFcl(null), true)
  assert.equal(exigeFcl('  '), true)
  assert.equal(controlDeCuentas({ ...base, convenio_colectivo: null }), 'falta_fcl')
})

test('sueldo pedida o sin CBU no está en regla', () => {
  assert.equal(controlDeCuentas({ ...base, cuenta_sueldo_estado: 'pedida' }), 'falta_todo')
  assert.equal(controlDeCuentas({ ...base, cbu: null, fcl_estado: 'creada', fcl_cuenta: '1' }), 'falta_sueldo')
  assert.equal(controlDeCuentas({ ...base, cbu: null, convenio_colectivo: 'Fuera de convenio' }), 'falta_sueldo')
})

test('CBU: largo y verificadores', () => {
  assert.equal(cbuValido(CBU_OK), true)
  assert.equal(cbuValido(CBU_OK.slice(0, 21)), false, '21 dígitos')
  assert.equal(cbuValido('2850590940090418135202'), false, 'el 22º no cierra')
  assert.equal(cbuValido('2850591940090418135201'), false, 'el 8º no cierra')
})

const formulario = (o: Record<string, string>) => ({
  cuenta_sueldo_banco: '', cuenta_sueldo_numero: '', cbu: '', cuenta_sueldo_estado: '',
  fcl_cuenta: '', fcl_cbu: '', fcl_estado: '', cuentas_fuente: '', cuentas_relevadas_en: '', ...o,
})

test('el formulario rechaza un CBU inválido y acepta uno escrito con espacios', () => {
  assert.equal(esquemaCuentas.safeParse(formulario({ cbu: '123' })).success, false)
  assert.equal(esquemaCuentas.safeParse(formulario({ fcl_cbu: '2850590940090418135202' })).success, false)
  const ok = esquemaCuentas.safeParse(formulario({ cbu: '2850 5909 4009 0418 1352 01' }))
  assert.ok(ok.success)
  assert.equal(ok.data.cbu, CBU_OK)
  assert.equal(ok.data.cuenta_sueldo_banco, null, 'vacío es null, no cadena vacía')
})

test('el formulario no acepta «creada» sin número', () => {
  assert.equal(esquemaCuentas.safeParse(formulario({ fcl_estado: 'creada' })).success, false)
  assert.equal(esquemaCuentas.safeParse(formulario({ cuenta_sueldo_estado: 'creada' })).success, false)
  assert.equal(esquemaCuentas.safeParse(formulario({ fcl_estado: 'abierta' })).success, false, 'estado fuera del check')
})

// ── La migración ────────────────────────────────────────────────────────────────────────────────

const sql = () => sinComentarios(readFileSync(MIGRACION, 'utf8'))
const NUEVAS = [
  'cuenta_sueldo_banco', 'cuenta_sueldo_numero', 'cuenta_sueldo_estado', 'fcl_cuenta', 'fcl_cbu',
  'fcl_estado', 'cuentas_fuente', 'cuentas_relevadas_en',
]

test('migración: empieza con lock_timeout y termina recargando el esquema', () => {
  const s = sql().trim()
  assert.match(s, /^set local lock_timeout = '5s';/)
  assert.match(s, /notify pgrst, 'reload schema';$/)
})

test('migración: las columnas nuevas se revocan de authenticated y anon, como el cbu', () => {
  const s = sql()
  const revoke = s.split(';').find((x) => /revoke select \(/i.test(x) && /on public\.personas from authenticated, anon/i.test(x))
  assert.ok(revoke, 'falta el revoke de select sobre las columnas nuevas')
  for (const c of NUEVAS) assert.ok(revoke.includes(c), `${c} no está en el revoke`)
  // NINGÚN GRANT DE LAS COLUMNAS NUEVAS a authenticated, ni un grant de tabla entera.
  for (const g of s.split(';').filter((x) => /\bgrant\b/i.test(x) && /public\.personas/i.test(x))) {
    assert.ok(!NUEVAS.some((c) => g.includes(c)), `grant que abre una columna nueva: ${g.trim()}`)
  }
})

test('migración: ninguna función queda ejecutable por PUBLIC ni anon', () => {
  const s = sql()
  const funciones = [...s.matchAll(/create or replace function (public\.[a-z_]+)\(/gi)].map((m) => m[1])
  assert.ok(funciones.length >= 2, 'faltan la de lectura y la de escritura')
  for (const f of funciones) {
    assert.match(s, new RegExp(`revoke execute on function ${f.replace('.', '\\.')}\\([^)]*\\) from public, anon;`, 'i'),
      `${f} sin revoke de PUBLIC/anon`)
  }
  assert.doesNotMatch(s, /grant execute[^;]*\bto [^;]*\b(public|anon)\b/i)
})

test('migración: el portero de las dos funciones es liquida_sueldos(), no es_administracion()', () => {
  const s = sql()
  assert.equal((s.match(/if not public\.liquida_sueldos\(\) then/g) ?? []).length, 2)
  assert.doesNotMatch(s, /es_administracion\(\)/)
})

test('migración y espejo usan el mismo patrón de convenio', () => {
  assert.ok(sql().includes(`~* '(${PATRON_CONVENIO_FCL})'`),
    'el patrón del convenio en SQL dejó de ser PATRON_CONVENIO_FCL')
})

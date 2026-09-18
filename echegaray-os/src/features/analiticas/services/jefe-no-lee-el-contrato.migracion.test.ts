// EL JEFE DE OBRA NO LEE LOS METADATOS DEL CONTRATO en `obra_economia_rubros` (migración 20260918T1550).
//
// Contrato sobre el SQL, no sobre la base: la prueba contra la base viva queda para cuando la migración
// se aplique con el deploy (no se corre DDL de prueba en horario del dueño). Lo que fija: las cinco
// columnas de texto que dicen de dónde sale el precio van detrás de la misma puerta que el contratado,
// el resto del cuerpo es el de 20260918T1520 (misma lista de columnas, mismo orden), y ninguna columna
// numérica del contrato se envuelve en CASE (le quitaría el typmod y `create or replace view` fallaría).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..', '..', '..', '..', 'supabase', 'migrations')
const NUEVA = readFileSync(join(dir, '20260918T1550_obra_economia_rubros_el_jefe_no_lee_el_contrato.sql'), 'utf8')
const PREVIA = readFileSync(join(dir, '20260918T1520_margen_cotizado_unico_y_horas_del_documento.sql'), 'utf8')
const vista = (sql: string): string => {
  const i = sql.indexOf('create or replace view public.obra_economia_rubros')
  assert.ok(i >= 0, 'falta la vista')
  return sql.slice(i, sql.indexOf('grant select on public.obra_economia_rubros', i))
}
const PUERTA = '(public.ve_economia() or auth.uid() is null)'

test('las cinco columnas que dicen de dónde sale el precio están detrás de ve_economia()', () => {
  const lineas = vista(NUEVA).split('\n')
  for (const col of ['contratado_origen', 'contratado_referencia', 'contrato_fuente_drive_id', 'contrato_fuente_nombre', 'contrato_cita']) {
    const i = lineas.findIndex((l) => new RegExp(`\\bas ${col},`).test(l))
    assert.ok(i >= 0, `falta ${col}`)
    const tramo = lineas.slice(Math.max(0, i - 2), i + 1).join('\n')
    assert.ok(tramo.includes(`case when ${PUERTA} then`), `${col} sale sin máscara`)
  }
})

test('el resto de la vista es el de 20260918T1520: mismas columnas, mismo orden, montos sin CASE', () => {
  const sinMascaras = (s: string) => s
    .replace(/case when \(public\.ve_economia\(\) or auth\.uid\(\) is null\) then\s*/g, '')
    .replace(/\s*end as (contratado_origen|contratado_referencia|contrato_fuente_drive_id|contrato_fuente_nombre|contrato_cita),/g, ' as $1,')
  const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/(e\.(\w+)) as \2,/g, '$1,').trim()
  assert.equal(norm(sinMascaras(vista(NUEVA))), norm(vista(PREVIA)), 'la migración cambió algo además de las máscaras')
  for (const col of ['contratado_usd', 'contrato_mano_obra', 'contrato_materiales', 'contrato_total']) {
    assert.match(vista(NUEVA), new RegExp(`^\\s+e\\.${col},$`, 'm'), `${col} no debe envolverse (typmod)`)
  }
  assert.match(NUEVA, /grant select on public\.obra_economia_rubros to authenticated, service_role;/)
})

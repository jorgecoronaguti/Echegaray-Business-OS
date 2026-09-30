// La migración de «Firmó en papel» sin foto, leída como texto. No ejecuta SQL (no se toca la base viva desde
// un worktree): clava las propiedades que, si alguien las revierte, rompen la garantía — quién puede marcar,
// qué queda anotado, y que archivar reconozca el papel marcado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../../../supabase/migrations/20260930T2200_recibo_firmado_en_papel_sin_foto.sql', import.meta.url), 'utf8')
const funcion = (nombre) => {
  const i = sql.indexOf(`function public.${nombre}(`)
  assert.ok(i >= 0, `falta ${nombre}`)
  return sql.slice(i, sql.indexOf('end $$;', i))
}

test('marcar en papel exige Administración/Dirección: la persona (Campo) no puede', () => {
  const f = funcion('marcar_recibo_firmado_en_papel')
  // `_recibo_liq_exigir_sueldos` es la cerradura de liquida_sueldos(); sin ella cualquiera con login marcaría.
  assert.match(f, /v_usr uuid := public\._recibo_liq_exigir_sueldos\(\)/)
  assert.doesNotMatch(f, /mi_persona_id/)
  assert.match(sql, /grant execute on function public\.marcar_recibo_firmado_en_papel\(uuid\) to authenticated/)
  assert.match(sql, /revoke all on function public\.marcar_recibo_firmado_en_papel\(uuid\) from public, anon/)
})

test('marcar cambia el estado y deja rastro de quién y cuándo', () => {
  const f = funcion('marcar_recibo_firmado_en_papel')
  assert.match(f, /estado = 'firmado_papel', papel_sin_foto_en = now\(\), papel_sin_foto_por = v_usr/)
  // sólo desde emitido/enviado: no pisa un firmado, archivado u observado
  assert.match(f, /r\.estado not in \('emitido', 'enviado'\)/)
  assert.match(sql, /check \(\(papel_sin_foto_en is null\) = \(papel_sin_foto_por is null\)\)/)
})

test('archivar reconoce el papel marcado, en la función y en el CHECK', () => {
  assert.match(funcion('archivar_recibo_liquidacion'), /papel_sin_foto_en is null then/)
  assert.match(sql, /recibo_archivado_viene_de_firma[\s\S]*papel_sin_foto_en is not null/)
})

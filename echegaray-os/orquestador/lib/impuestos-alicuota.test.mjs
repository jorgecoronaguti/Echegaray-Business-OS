import test from 'node:test'
import assert from 'node:assert/strict'
import { alicuotaDeclarada, resolverAlicuota, ALICUOTA_POR_DEFECTO } from './impuestos-alicuota.mjs'

// ═══ EL DEFECTO QUE ESTOS TESTS ATRAPAN (04/09/2026) ═══
//
// La celda tenía 0,21 y formato de MONEDA sin decimales, así que el render formateado devolvía "$0".
// El generador lo tomaba por alícuota cero: la proyección de IVA se detenía, y de no haberse
// detenido habría reescrito ese 0 en la propia celda, dejando el rango con nombre ALICUOTA_IVA en
// cero para siempre. Un cuadro de IVA proyectado en $0 sin una sola celda en error.

test('"$0" NO es una alícuota: es una celda mal vestida — se siembra el valor por defecto', () => {
  assert.equal(alicuotaDeclarada('$0'), null)
  const r = resolverAlicuota('$0')
  assert.equal(r.alicuota, ALICUOTA_POR_DEFECTO)
  assert.equal(r.sembrada, true)
})

test('el 0 numérico tampoco declara nada — es el lazo que se cierra solo', () => {
  // Leer 0 → escribir 0 → volver a leer 0. Si 0 valiera como alícuota, el defecto sería permanente.
  assert.equal(alicuotaDeclarada(0), null)
  assert.equal(resolverAlicuota(0).alicuota, ALICUOTA_POR_DEFECTO)
})

test('la fracción que guarda Sheets se toma tal cual', () => {
  assert.equal(alicuotaDeclarada(0.21), 0.21)
  assert.equal(alicuotaDeclarada(0.105), 0.105)
  assert.equal(resolverAlicuota(0.105).sembrada, false)
})

test('un porcentaje escrito sin dividir se interpreta como porcentaje, no como 2100%', () => {
  assert.equal(alicuotaDeclarada(21), 0.21)
  assert.equal(alicuotaDeclarada('21%'), 0.21)
  assert.equal(alicuotaDeclarada('10,5%'), 0.105)
})

test('la celda vacía siembra el valor por defecto y lo DICE', () => {
  const r = resolverAlicuota('')
  assert.equal(r.alicuota, ALICUOTA_POR_DEFECTO)
  assert.match(r.motivo, /vac[íi]a/)
})

test('un valor imposible no se usa: ni negativo, ni 1, ni más de 100', () => {
  for (const v of [-0.21, 1, 101, 'no sé', '—']) assert.equal(alicuotaDeclarada(v), null, `${v}`)
})

test('el motivo dice QUÉ decía la celda: sin eso el aviso no se puede verificar', () => {
  assert.match(resolverAlicuota('$0').motivo, /\$0/)
})

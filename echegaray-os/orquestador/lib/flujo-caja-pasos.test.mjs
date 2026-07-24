import test from 'node:test'
import assert from 'node:assert/strict'
import { PASOS, REPORTES, esReporte } from './flujo-caja-pasos.mjs'

test('esReporte: los auditores/formateadores son reportes de presentación, no fallos de datos', () => {
  assert.equal(esReporte('auditar-pantalla.mjs'), true)
  assert.equal(esReporte('censo-numeros-pegados.mjs'), true)
  assert.equal(esReporte('formato-condicional.mjs'), true)
  assert.equal(esReporte('formato-pestanas.mjs'), true)
})

test('esReporte: un GENERADOR de datos NO es un reporte (su fallo sí bloquea la frescura)', () => {
  assert.equal(esReporte('rubro-caja-sheet.mjs'), false)
  assert.equal(esReporte('caja-pestana.mjs'), false)
  assert.equal(esReporte('sync-compras.mjs'), false)
  assert.equal(esReporte('sync-calendario-financiero.mjs'), false)
})

test('todo script en REPORTES existe como paso real del pipeline', () => {
  const scripts = new Set(PASOS.map(([s]) => s))
  for (const r of REPORTES) assert.ok(scripts.has(r), `${r} está en REPORTES pero no es un paso de PASOS`)
})

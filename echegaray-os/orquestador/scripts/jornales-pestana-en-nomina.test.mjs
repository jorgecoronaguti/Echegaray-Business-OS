// EL REGISTRO DE JORNALES DENTRO DE «Nómina» (25/09/2026) — lo que la mudanza no puede romper.
//
// El dueño: «unificar = eliminar, no ocultar». «Jornales por Quincena» se eliminó y su registro vive en
// «Nómina», debajo del cuadro 6. Tres cosas se prueban sin red: que la grilla calcule filas de «Nómina»
// (relleno arriba), que no traiga el titular propio y numere 7–10, y que el formato no salga del bloque.
import test from 'node:test'
import assert from 'node:assert/strict'
import { grilla, rangosDeJornales, soloFilasDelBloque, NUMERACION_EN_NOMINA } from './jornales-pestana.mjs'
import { columnasRetiros } from '../lib/direccion-retiros.mjs'
import { COMPRAS_2508 } from '../lib/encabezados-referencia.mjs'

const bloques = [{ filaFecha: 6, inicio: 7, fin: 20 }, { filaFecha: 30, inicio: 31, fin: 44 }]
const pendientes = [{ desde: new Date(2026, 7, 1) }, { desde: new Date(2026, 7, 16) }]
const bloquesOfi = [{ mes: 6, inicio: 5, fin: 8 }, { mes: 7, inicio: 12, fin: 15 }]
const base = { colsCompras: columnasRetiros(COMPRAS_2508), bloques, pendientes, bloquesOfi }
const FILA0 = 99

test('en «Nómina»: el relleno de arriba corre TODAS las filas, y los rangos con nombre caen en el bloque', () => {
  const vieja = grilla(base)
  const nueva = grilla({ ...base, fila0: FILA0, enNomina: true })
  // La pestaña vieja tenía 7 filas de titular antes de «1 · CALENDARIO»; en Nómina no están.
  const corrimiento = FILA0 - 7
  assert.equal(nueva.f0, vieja.f0 + corrimiento)
  assert.equal(nueva.o0, vieja.o0 + corrimiento)
  assert.equal(nueva.d0, vieja.d0 + corrimiento)
  for (let i = 0; i < FILA0; i++) assert.deepEqual(nueva.filas[i], [], `la fila ${i + 1} es de Nómina: no se escribe`)
  const rangos = rangosDeJornales(nueva)
  assert.equal(rangos.length, 20)
  for (const r of rangos) assert.ok(r.r0 > FILA0, `${r.nombre} cae arriba del registro (fila ${r.r0})`)
  // Una fórmula que cita su propia fila la cita con el número de Nómina.
  const iniOfi = nueva.filas[nueva.o0 + 6][7]
  assert.match(String(iniOfi), new RegExp(`\\$C\\$${nueva.o0 + 6}`), 'la base de Oficina no apunta a su fila en Nómina')
})

test('en «Nómina»: sin titular propio, secciones 7 a 10 y ninguna columna entera', () => {
  const g = grilla({ ...base, fila0: FILA0, enNomina: true })
  assert.equal(g.fProxima, null)
  const titulos = g.filas.map((f) => String(f?.[0] ?? '')).filter((t) => /^\d+(\.\d+)? · /.test(t))
  assert.deepEqual(titulos.map((t) => t.split(' · ')[0]), ['7', '8', '9', '10', '10.1', '10.2', '10.3'])
  assert.equal(NUMERACION_EN_NOMINA['1.2'], '9')
  assert.ok(!g.filas.some((f) => /^Jornales por quincena$/i.test(String(f?.[0] ?? ''))))
  // Una referencia a la columna entera no viaja con la fila: al mudar el bloque daba #REF!.
  for (const f of g.filas) for (const c of f) {
    if (typeof c !== 'string' || !c.startsWith('=')) continue
    const sinOtras = c.replace(/"[^"]*"/g, '').replace(/'[^']*'![$A-Z0-9:]+/g, '').replace(/\b[A-Za-z_]+![$A-Z0-9:]+/g, '')
    assert.doesNotMatch(sinOtras, /(^|[^A-Z$!])\$?[A-Z]{1,2}:\$?[A-Z]{1,2}(?![0-9])/, c.slice(0, 80))
  }
})

test('el formato del bloque no sale del bloque: ni anchos de columna, ni congelar, ni filas de arriba', () => {
  const sid = 7
  const reqs = [
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 300 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: 0, endIndex: 200 }, properties: { pixelSize: 21 }, fields: 'pixelSize' } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 50 }, cell: {}, fields: 'userEnteredFormat' } },
    { repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 150 }, cell: {}, fields: 'userEnteredFormat' } },
    { addConditionalFormatRule: { rule: { ranges: [{ sheetId: sid, startRowIndex: 10, endRowIndex: 20 }, { sheetId: sid, startRowIndex: 120, endRowIndex: 130 }] } } },
  ]
  const out = soloFilasDelBloque(reqs, FILA0)
  assert.equal(out.length, 3)
  assert.equal(out[0].updateDimensionProperties.range.startIndex, FILA0)
  assert.equal(out[1].repeatCell.range.startRowIndex, FILA0)
  assert.deepEqual(out[2].addConditionalFormatRule.rule.ranges.map((r) => r.startRowIndex), [120])
  assert.equal(soloFilasDelBloque(reqs, 0), reqs, 'fuera de Nómina no se recorta nada')
})

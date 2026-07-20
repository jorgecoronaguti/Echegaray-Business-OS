import test from 'node:test'
import assert from 'node:assert/strict'
import { familiaDeMaterial, formulaFamilia, repartirFamilias, FAMILIAS, SIN_FAMILIA } from './familia-material.mjs'

test('el orden de prioridad decide, y está elegido a propósito', () => {
  // Un subcontrato de cloaca es SUBCONTRATO: lo que importa para el costo es que lo hizo un tercero.
  assert.equal(familiaDeMaterial({ concepto: 'Sub contratista — CLOACA Y AGUA POTABLE' }), 'Subcontratos y mano de obra')
  // Un PNC es perfil, no hierro de armadura: otro mercado, otros proveedores.
  assert.equal(familiaDeMaterial({ concepto: 'Galpon 8 — PNC 160' }), 'Chapa, perfiles y estructura metálica')
  assert.equal(familiaDeMaterial({ concepto: 'Mamposteria — Malla ø6 - 10u' }), 'Hierro y malla')
  // Ferretería es el cajón de sastre: va última justamente para no comerse el resto.
  assert.equal(familiaDeMaterial({ concepto: 'Mamposteria — CEMENTO X 25 Y TARUGOS METALICOS X100' }), 'Cemento, cal y áridos')
  assert.equal(familiaDeMaterial({ concepto: 'TARUGOS METALICOS Y DEMAS' }), 'Ferretería y consumibles')
})

test('el proveedor completa lo que el concepto no dice', () => {
  // Filas reales sin concepto útil donde el proveedor es el dato.
  assert.equal(familiaDeMaterial({ concepto: '', proveedor: 'Hormiserv' }), 'Hormigón elaborado')
  assert.equal(familiaDeMaterial({ concepto: '', proveedor: 'SIDERAGRO' }), 'Hierro y malla')
})

test('lo que no se puede saber NO se inventa', () => {
  // Estas tres son filas reales de Compras. Adivinarles familia sería fabricar un dato.
  for (const c of ['MATERIALES VARIOS', '???', '']) {
    assert.equal(familiaDeMaterial({ concepto: c, proveedor: 'Janin' }), SIN_FAMILIA)
  }
})

test('repartirFamilias separa lo clasificado de lo que falta describir', () => {
  const r = repartirFamilias([
    { concepto: 'cemento', total: 100 },
    { concepto: 'cemento x 25', total: 50 },
    { concepto: 'materiales varios', total: 999 },
  ])
  assert.equal(r.total, 1149)
  assert.deepEqual(r.por_familia.map((f) => f.familia), ['Cemento, cal y áridos'])
  assert.equal(r.por_familia[0].monto, 150)
  // Lo sin clasificar sale APARTE, no se esconde dentro de una familia ni se pierde del total.
  assert.equal(r.sin_clasificar.filas, 1)
  assert.equal(r.sin_clasificar.monto, 999)
})

test('la fórmula del Sheet sale de la misma lista y respeta el orden', () => {
  const f = formulaFamilia()
  for (const [n] of FAMILIAS) assert.ok(f.includes(`"${n}"`), `falta ${n}`)
  const pos = FAMILIAS.map(([n]) => f.indexOf(`"${n}"`))
  assert.deepEqual(pos, [...pos].sort((a, b) => a - b), 'el orden de la fórmula no es el de FAMILIAS')
  // Sólo los rubros de material: para un F931 la familia queda vacía, no "SIN CLASIFICAR".
  assert.ok(f.includes('$AC$4:$AC="Materiales Civil"'))
  assert.ok(f.includes('$AC$4:$AC="Materiales Mantenimiento"'))
  assert.ok(f.startsWith('=ARRAYFORMULA('))
  // Tiene que mirar Detalles/Obra (K) además del Concepto (L): el detalle real suele estar en K.
  assert.ok(f.includes('$K$4:$K'), 'la fórmula ignora la columna de detalle')
  assert.ok(f.includes(';'), 'tiene que estar en es-AR')
})

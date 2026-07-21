import test from 'node:test'
import assert from 'node:assert/strict'
import { familiaDeMaterial, repartirFamilias, SIN_FAMILIA, formulaFamilia } from './familia-material.mjs'

// LAS TRES COLUMNAS DICEN COSAS DISTINTAS y el orden en que se miran es la regla.
// Estos casos son los que estaban MAL clasificados en la planilla real antes de la reescritura.
test('el concepto le gana al frente de obra', () => {
  // "Mamposteria" es el nombre del frente, no lo que se compró.
  assert.equal(
    familiaDeMaterial({ concepto: 'Insumos electricos', detalle: 'Mamposteria', proveedor: 'Trielec' }),
    'Electricidad')
  assert.equal(
    familiaDeMaterial({ concepto: 'CEMENTO X 25', detalle: 'Mamposteria', proveedor: 'Corralon Progreso' }),
    'Cemento, cal y áridos')
})

test('el proveedor es la señal más débil y va última', () => {
  // Sideragro vende hierro, pero esto es pintura.
  assert.equal(
    familiaDeMaterial({ concepto: 'Vitrolux', detalle: '', proveedor: 'SIDERAGRO' }),
    'Revoques, pintura y terminación')
  assert.equal(
    familiaDeMaterial({ concepto: 'PNC 160', detalle: 'Galpon 8', proveedor: 'SIDERAGRO' }),
    'Chapa, perfiles y estructura metálica')
  assert.equal(
    familiaDeMaterial({ concepto: 'rejas y rejillas', detalle: 'Mamposteria', proveedor: 'SIDERAGRO' }),
    'Aberturas, portones y herrería')
  // Sin concepto ni frente, ahí sí decide el proveedor monoproducto.
  assert.equal(familiaDeMaterial({ concepto: '', proveedor: 'Hormiserv' }), 'Hormigón y premoldeados')
})

test('el combustible se reconoce en cualquier columna', () => {
  // El autoelevador es DÓNDE se puso el combustible, no qué se compró.
  assert.equal(
    familiaDeMaterial({ concepto: 'auto elevador', detalle: 'combustible', proveedor: 'Combustibles Barcelo' }),
    'Combustible de obra')
  assert.equal(
    familiaDeMaterial({ concepto: 'Combustible', detalle: 'Galpon 7 - reparacion piso', proveedor: 'Combustibles Barcelo' }),
    'Combustible de obra')
})

test('el orden dentro de la lista sigue mandando', () => {
  assert.equal(familiaDeMaterial({ concepto: 'Sub contratista CLOACA Y AGUA POTABLE' }), 'Subcontratos y mano de obra')
  assert.equal(familiaDeMaterial({ concepto: 'PNC 160' }), 'Chapa, perfiles y estructura metálica')
  assert.equal(familiaDeMaterial({ concepto: 'Malla ø6 - 10u' }), 'Hierro y malla')
  assert.equal(familiaDeMaterial({ concepto: 'TARUGOS METALICOS Y DEMAS' }), 'Ferretería y consumibles')
})

test('lo que no se puede saber no se inventa', () => {
  for (const c of ['materiales varios', '???', '', 'Art varios']) {
    assert.equal(familiaDeMaterial({ concepto: c, proveedor: 'Janin' }), SIN_FAMILIA)
  }
})

test('repartirFamilias separa lo clasificado de lo que falta describir', () => {
  const r = repartirFamilias([
    { concepto: 'CEMENTO', total: 100 },
    { concepto: 'materiales varios', total: 50 },
  ])
  assert.equal(r.total, 150)
  assert.equal(r.sin_clasificar.monto, 50)
  assert.equal(r.por_familia.length, 1)
})

// La fórmula del Sheet tiene que aplicar las MISMAS tres pasadas, o la planilla y el OS clasifican
// distinto y nadie se entera hasta que los cortes no coinciden.
test('la fórmula del Sheet mira L, después K y al final E', () => {
  const f = formulaFamilia()
  assert.ok(f.indexOf('$L$4:$L') < f.indexOf('$K$4:$K'), 'el concepto antes que el frente')
  assert.ok(f.indexOf('$K$4:$K') < f.lastIndexOf('$E$4:$E'), 'el frente antes que el proveedor')
  assert.ok(f.includes('combustible|nafta|gasoil'), 'el combustible se chequea sobre el texto completo')
})

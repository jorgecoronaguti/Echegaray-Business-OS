// UN DXF DE VERDAD, MEDIDO CONTRA NÚMEROS QUE SE PUEDEN COMPROBAR A MANO.
//
// El rectángulo de 6 × 4 tiene perímetro 20 y área 24. Los dos números están elegidos para que
// cualquiera los verifique sin correr nada, y para que los dos defectos clásicos de un parser de
// DXF se pongan rojos: si no se acumulan los vértices, el perímetro da 0; si no se lee la bandera
// de cierre, da 14 en vez de 20 —falta un lado entero de todo perímetro—.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pares, entidades, encabezado, longitudDe, areaDe, medirDxf, A_METROS } from './dxf.mjs'

/** Arma un DXF a partir de pares (código, valor). El formato es literalmente esto. */
const dxf = (...codigos) => codigos.map(([c, v]) => `${c}\n${v}`).join('\n')

const CABECERA = (insunits) => [
  [0, 'SECTION'], [2, 'HEADER'],
  ...(insunits === null ? [] : [[9, '$INSUNITS'], [70, String(insunits)]]),
  [0, 'ENDSEC'],
]

const RECTANGULO = [
  [0, 'LWPOLYLINE'], [8, 'MUROS'], [90, '4'], [70, '1'],
  [10, '0.0'], [20, '0.0'], [10, '6.0'], [20, '0.0'], [10, '6.0'], [20, '4.0'], [10, '0.0'], [20, '4.0'],
]

const PLANO = dxf(
  ...CABECERA(6),
  [0, 'SECTION'], [2, 'BLOCKS'],
  [0, 'BLOCK'], [2, 'CORREA'],
  [0, 'LINE'], [8, 'ESTRUCTURA'], [10, '0.0'], [20, '0.0'], [11, '18.3'], [21, '0.0'],
  [0, 'ENDBLK'],
  [0, 'ENDSEC'],
  [0, 'SECTION'], [2, 'ENTITIES'],
  ...RECTANGULO,
  [0, 'LINE'], [8, 'EJES'], [10, '0.0'], [20, '0.0'], [11, '3.0'], [21, '4.0'],
  [0, 'CIRCLE'], [8, 'COLUMNAS'], [10, '1.0'], [20, '1.0'], [40, '2.0'],
  [0, 'ARC'], [8, 'EJES'], [10, '0.0'], [20, '0.0'], [40, '1.0'], [50, '0.0'], [51, '90.0'],
  [0, 'TEXT'], [8, 'ROTULO'], [10, '2.0'], [20, '2.0'], [1, 'Salon 191.92m2'],
  [0, 'SPLINE'], [8, 'DETALLE'], [10, '0.0'], [20, '0.0'],
  ...Array.from({ length: 12 }, (_, i) => [[0, 'INSERT'], [8, 'ESTRUCTURA'], [2, 'CORREA'], [10, String(i * 1.63)], [20, '0.0']]).flat(),
  [0, 'ENDSEC'], [0, 'EOF'],
)

test('la gramática del DXF son pares (código, valor) y nada más', () => {
  const p = pares('0\nSECTION\n2\nHEADER\n')
  assert.deepEqual(p, [[0, 'SECTION'], [2, 'HEADER']])
})

test('EL PERÍMETRO DE UNA POLILÍNEA CERRADA INCLUYE EL TRAMO DE VUELTA: 20, no 14', () => {
  const e = entidades(pares(dxf(...CABECERA(6), [0, 'SECTION'], [2, 'ENTITIES'], ...RECTANGULO, [0, 'ENDSEC'])))
  const poli = e.find((x) => x.tipo === 'LWPOLYLINE')
  assert.equal(poli.vertices.length, 4, 'si no se acumulan los 10/20, queda un solo vértice y no se puede medir nada')
  assert.equal(longitudDe(poli), 20)
  assert.equal(areaDe(poli), 24)
})

test('una polilínea ABIERTA no tiene área: cerrarla por nuestra cuenta sería inventar superficie', () => {
  const abierta = { tipo: 'LWPOLYLINE', banderas: 0, vertices: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }] }
  assert.equal(longitudDe(abierta), 10)
  assert.equal(areaDe(abierta), null)
})

test('línea, círculo y arco se miden con la fórmula que les corresponde', () => {
  assert.equal(longitudDe({ tipo: 'LINE', x: 0, y: 0, x2: 3, y2: 4 }), 5)
  assert.equal(longitudDe({ tipo: 'CIRCLE', radio: 2 }), 2 * Math.PI * 2)
  assert.ok(Math.abs(longitudDe({ tipo: 'ARC', radio: 1, anguloInicio: 0, anguloFin: 90 }) - Math.PI / 2) < 1e-12)
  assert.equal(longitudDe({ tipo: 'ARC', radio: 1, anguloInicio: 0 }), null, 'sin ángulo final no hay arco que medir')
})

test('LAS REPETICIONES SON UN CONTEO DE INSERT, no un conteo de símbolos a ojo', () => {
  const m = medirDxf(PLANO)
  const correa = m.bloques.find((b) => b.bloque === 'CORREA')
  assert.equal(correa.cantidad, 12)
  assert.equal(correa.longitudUnitaria, 18.3)
  assert.equal(correa.longitudTotal, 219.6)
  assert.equal(correa.escalaAplicada, false, 'el total no aplica escala ni rotación del INSERT y lo dice')
})

test('la definición del bloque NO se suma a las capas: sería contar la plantilla además de las copias', () => {
  const m = medirDxf(PLANO)
  const estructura = m.capas.find((c) => c.capa === 'ESTRUCTURA')
  assert.equal(estructura, undefined, 'la única geometría en ESTRUCTURA es la definición de CORREA')
})

test('la medición se agrupa por capa, que en un plano es la disciplina', () => {
  const m = medirDxf(PLANO)
  assert.deepEqual(m.capas.map((c) => c.capa), ['COLUMNAS', 'EJES', 'MUROS'])
  assert.equal(m.capas.find((c) => c.capa === 'MUROS').longitud, 20)
  assert.equal(m.capas.find((c) => c.capa === 'MUROS').area, 24)
  assert.equal(m.capas.find((c) => c.capa === 'EJES').longitud, 6.5708, 'la línea de 5 más el arco de π/2')
})

test('SIN $INSUNITS NO SE INVENTAN METROS: las longitudes salen en unidades de dibujo y se dice', () => {
  const sinUnidad = medirDxf(dxf(...CABECERA(null), [0, 'SECTION'], [2, 'ENTITIES'], ...RECTANGULO, [0, 'ENDSEC']))
  assert.equal(sinUnidad.unidadDibujo, null)
  assert.equal(sinUnidad.factorAMetros, null)
  assert.equal(sinUnidad.capas[0].longitud_m, null, 'llamar metros a un número sin unidad es el error más caro que puede cometer un cómputo')
  assert.match(sinUnidad.porQueSinUnidad, /\$INSUNITS/)
})

test('un DXF en milímetros se convierte a metros con su factor', () => {
  const mm = medirDxf(dxf(...CABECERA(4), [0, 'SECTION'], [2, 'ENTITIES'], ...RECTANGULO, [0, 'ENDSEC']))
  assert.equal(mm.unidadDibujo, 'mm')
  assert.equal(mm.factorAMetros, A_METROS.mm)
  assert.equal(mm.capas[0].longitud_m, 0.02)
  assert.equal(mm.capas[0].area_m2, 0.000024, 'el área va con el factor AL CUADRADO')
})

test('LO QUE NO SE SABE MEDIR SE DECLARA: un SPLINE no se cuenta como cero en silencio', () => {
  const m = medirDxf(PLANO)
  assert.deepEqual(m.sinSoporte.map((x) => x.tipo), ['SPLINE'])
  assert.equal(m.sinSoporte[0].cantidad, 1)
})

test('los textos del plano salen con su capa y su posición, para poder citarlos', () => {
  const m = medirDxf(PLANO)
  assert.equal(m.textos.length, 1)
  assert.deepEqual(m.textos[0], { capa: 'ROTULO', texto: 'Salon 191.92m2', x: 2, y: 2 })
})

test('el encabezado lee la unidad y sólo la unidad', () => {
  assert.deepEqual(encabezado(pares(dxf(...CABECERA(6)))), { insunits: 6, unidad: 'm' })
  assert.deepEqual(encabezado(pares(dxf(...CABECERA(null)))), { insunits: null, unidad: null })
})

test('DOS LECTURAS DEL MISMO DXF dan exactamente lo mismo', () => {
  assert.deepEqual(medirDxf(PLANO), medirDxf(PLANO))
})

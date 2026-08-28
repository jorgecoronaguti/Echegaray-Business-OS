// EL COSTO POR OBRA, PROBADO CONTRA LA FORMA REAL DE LA PLANILLA Y POR LA RUTA DE PRODUCCION.
//
// Todo lo que se afirma acá entra por donde entra en produccion: `detectarBloques` +
// `trabajadoresDeBloque` sobre una grilla armada como escribe JORNALES. Si el fixture se armara a
// mano con las columnas ya resueltas, el test no probaria lo unico que hay que probar: que las
// coordenadas se derivan.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloques, trabajadoresDeBloque } from './jornales-estructura.mjs'
import {
  CLASE, HUECO, resolverCliente, columnasDeDinero, costoPorObra, cuadreDeClases,
} from './jornales-por-obra.mjs'
import { planilla, MAPA, txt, frm, vacia } from './jornales-fixture-por-obra.mjs'

const VENTANA = { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA }

/** Las tres personas del caso base: una obra, una obra distinta y una fila que no es obra. */
function base() {
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.persona({ nombre: 'Aguero Cristian', horas: [9, null, 8], vh: 5600, cliente: 'MESSINA', obra: 'BASES' })
  p.persona({ nombre: 'Quiroga Alexander', horas: [9, 9, 8], vh: 4500, cliente: 'z. ENFERMEDAD', obra: 'z. ENFERMEDAD' })
  return p.grid()
}

test('resolverCliente distingue no-verificable de desconocido', () => {
  assert.equal(resolverCliente('LA ESTRELLA', { leido: false }).clase, CLASE.NO_VERIFICABLE)
  assert.equal(resolverCliente('LA ESTRELLA', undefined).clase, CLASE.NO_VERIFICABLE)
  assert.equal(resolverCliente('CLIENTE NUEVO SA', MAPA).clase, CLASE.DESCONOCIDO)
  assert.notEqual(CLASE.NO_VERIFICABLE, CLASE.DESCONOCIDO)
})

test('un rotulo que no esta en el mapa NO se resuelve por parecido', () => {
  // MESSINAS esta declarado y resuelve; MESINA (con una sola S) no existe y tiene que salir
  // DESCONOCIDO. Si algun dia alguien mete una comparacion difusa, este test se pone rojo.
  assert.equal(resolverCliente('MESSINAS', MAPA).cliente, 'MESSINA')
  assert.equal(resolverCliente('MESINA', MAPA).clase, CLASE.DESCONOCIDO)
  assert.equal(resolverCliente('LA  ESTRELLA ', MAPA).cliente, 'LA ESTRELLA', 'espacios y mayusculas si se normalizan')
})

test('el bloque se detecta y las tres personas se leen con su obra', () => {
  const r = costoPorObra(base(), { ...VENTANA, factorCargas: 0.3862 })
  assert.equal(r.control.verificable, true)
  assert.equal(r.filas.length, 3)
  assert.equal(r.porObra.length, 2, 'enfermedad no es una obra')
  const galpon = r.porObra.find((o) => o.obra === 'GALPON 9')
  assert.equal(galpon.horas, 26)
  assert.equal(galpon.jornal, 26 * 6200)
  assert.ok(Math.abs(galpon.cargas - 26 * 6200 * 0.3862) < 0.01)
  assert.equal(r.sinObra.length, 1)
  assert.equal(r.sinObra[0].jornal, 26 * 4500)
})

test('una celda vacia NO cuenta como cero de horas', () => {
  const r = costoPorObra(base(), VENTANA)
  const messina = r.porObra.find((o) => o.cliente === 'MESSINA')
  assert.equal(messina.horas, 17, 'el dia sin escribir no suma ni resta')
  assert.equal(messina.personas, 1)
  assert.equal(r.huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE).length, 0)
})

test('sin factor de cargas no se inventa un recargo', () => {
  const r = costoPorObra(base(), VENTANA)
  assert.equal(r.factorCargas, null)
  for (const o of r.porObra) {
    assert.equal(o.cargas, null)
    assert.equal(o.costo, o.jornal, 'el costo es el jornal pelado')
  }
})

test('una celda con texto en la columna de horas se declara ilegible, no vale cero', () => {
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 'NO SE TOCA HASTA SEP', 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  const r = costoPorObra(p.grid(), VENTANA)
  const ilegibles = r.huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE)
  assert.equal(ilegibles.length, 1)
  assert.equal(ilegibles[0].fecha, '2026-08-18')
  assert.equal(r.control.celdasIlegibles, 1)
})

test('sin valor hora la persona queda sin valuar y su plata no se estima', () => {
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Sin tarifa', horas: [9, 9, 8], vh: null, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  const r = costoPorObra(p.grid(), VENTANA)
  assert.equal(r.filas[0].jornal, null)
  assert.equal(r.filas[0].horas, 26, 'las horas si se conocen')
  assert.equal(r.control.personasSinValuar, 1)
  assert.equal(r.porObra[0].sinValuar, 1)
  assert.equal(r.porObra[0].jornal, 0, 'no se suma nada inventado')
  assert.ok(r.huecos.some((h) => h.tipo === HUECO.SIN_VALOR_HORA))
})

test('con el mapa no leido NADA se atribuye, y se dice que no es verificable', () => {
  const r = costoPorObra(base(), { desde: '2026-08-17', hasta: '2026-08-19', mapa: { leido: false } })
  assert.equal(r.control.verificable, false)
  assert.equal(r.porObra.length, 0)
  assert.equal(r.desconocidos.length, 0, 'no leer el mapa no convierte a nadie en desconocido')
  assert.ok(r.control.jornalTotal > 0, 'la plata sigue existiendo aunque no se pueda atribuir')
  assert.equal(r.control.jornalAtribuido, 0)
  // Y esa plata tampoco desaparece: tiene su clase, su lista y su contador.
  assert.equal(r.control.jornalNoVerificable, r.control.jornalTotal)
  assert.equal(r.noVerificables.length, 3)
  assert.equal(r.control.cuadra, true)
})

test('la ventana recorta: un dia fuera no entra', () => {
  const r = costoPorObra(base(), { desde: '2026-08-17', hasta: '2026-08-18', mapa: MAPA })
  assert.equal(r.ventana.diasEnVentana, 2)
  assert.equal(r.porObra.find((o) => o.obra === 'GALPON 9').horas, 18)
})

// ───────────────── D1 · NINGUN PESO SIN NOMBRE ─────────────────

test('la plata de una fila con CLIENTE vacio se nombra: sale en sinRotulo y el control cuadra', () => {
  // Medido antes del arreglo: jornalTotal 483.600 · atribuido 161.200 · desconocido 161.200. Los
  // otros $ 161.200 -la fila sin rotulo- no aparecian en ninguna lista ni en ningun contador.
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.persona({ nombre: 'Aguero Cristian', horas: [9, 9, 8], vh: 6200, cliente: 'CLIENTE NUEVO SA', obra: 'X' })
  p.persona({ nombre: 'Quiroga Alexander', horas: [9, 9, 8], vh: 6200, cliente: '', obra: '' })
  const r = costoPorObra(p.grid(), VENTANA)

  assert.equal(r.control.jornalTotal, 3 * 26 * 6200)
  assert.equal(r.sinRotulo.length, 1)
  assert.equal(r.sinRotulo[0].persona, 'Quiroga Alexander')
  assert.equal(r.control.jornalSinRotulo, 26 * 6200)
  const { jornalAtribuido, jornalSinObra, jornalDesconocido, jornalSinRotulo, jornalNoVerificable } = r.control
  assert.equal(
    jornalAtribuido + jornalSinObra + jornalDesconocido + jornalSinRotulo + jornalNoVerificable,
    r.control.jornalTotal,
    'las clases tienen que sumar el total: un residuo sin nombre es plata perdida',
  )
  assert.equal(r.control.residuo, 0)
  assert.equal(r.control.cuadra, true)
})

test('el control de cuadre PUEDE dar rojo: una clase que nadie declaro no se calla', () => {
  // Un control que no puede decir que no es una constante disfrazada de control.
  const conClaseRara = cuadreDeClases([
    { clase: CLASE.CLIENTE, jornal: 100 },
    { clase: 'INVENTADA', jornal: 50 },
  ])
  assert.equal(conClaseRara.cuadra, false)
  assert.equal(conClaseRara.residuo, 50)
  assert.equal(cuadreDeClases([{ clase: CLASE.CLIENTE, jornal: 100 }]).cuadra, true)
})

// ───────────────── D4 · NINGUNA COORDENADA SE ASUME ─────────────────

test('otro ancho de bloque y las columnas de plata en otro lado: se derivan igual', () => {
  // Fixture deliberadamente distinto del real: 5 dias desde la D, horas en N, valor hora en P (NO
  // pegado a las horas), total en R, cliente en S. Con `colValorHora = colHoras + 1` esto da rojo.
  const cols = { nombre: 'B', categoria: 'C', dia: 'D', horas: 'N', vh: 'P', total: 'R', cliente: 'S', obra: 'T' }
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8', '20/8', '21/8'], cols)
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8, 9, 9], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9', cols })
  const g = p.grid()

  const c = columnasDeDinero(g.filas[1])
  assert.equal(c.colHoras, 13, 'N')
  assert.equal(c.colValorHora, 15, 'P: la del producto que no es la de horas')
  assert.equal(c.colTotal, 17, 'R')

  const r = costoPorObra(g, { desde: '2026-08-17', hasta: '2026-08-21', mapa: MAPA })
  assert.equal(r.ventana.diasEnVentana, 5)
  assert.equal(r.porObra.length, 1)
  assert.equal(r.porObra[0].horas, 44)
  assert.equal(r.porObra[0].jornal, 44 * 6200)
})

test('sin formulas no se inventa una columna: se declara el hueco', () => {
  const f = [txt(''), txt('Sin formulas'), vacia(), txt('OF')]
  const c = columnasDeDinero(f)
  assert.equal(c.colHoras, null)
  assert.equal(c.colValorHora, null)
})

// ───────────────── D5 · LA OBRA NO SE AGRUPA POR TEXTO CRUDO ─────────────────

test('la misma obra escrita de tres formas es UNA obra', () => {
  // "Quiroga Sebastian " con espacio final es un hecho documentado de este archivo; con la obra
  // pasa lo mismo. Agrupando por texto crudo, GALPON 9 se partia en tres.
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Uno', horas: [8, 8, 8], vh: 1000, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.persona({ nombre: 'Dos', horas: [8, 8, 8], vh: 1000, cliente: 'LA ESTRELLA', obra: 'GALPON 9 ' })
  p.persona({ nombre: 'Tres', horas: [8, 8, 8], vh: 1000, cliente: 'la estrella', obra: 'Galpon 9' })
  const r = costoPorObra(p.grid(), VENTANA)
  assert.equal(r.porObra.length, 1, 'una obra, no tres')
  assert.equal(r.porObra[0].personas, 3)
  assert.equal(r.porObra[0].jornal, 3 * 24 * 1000)
  assert.equal(r.porObra[0].obra, 'GALPON 9', 'se muestra el texto original de la primera aparicion')
})

test('la clave de obra lleva separador: dos obras distintas no colisionan', () => {
  // Sin delimitador, cliente "A B" + obra "C" y cliente "A" + obra "B C" daban la misma clave.
  const mapa = { leido: true, alias: new Map([['A B', 'A B'], ['A', 'A']]), noCliente: new Map() }
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Uno', horas: [8, 8, 8], vh: 1000, cliente: 'A B', obra: 'C' })
  p.persona({ nombre: 'Dos', horas: [8, 8, 8], vh: 1000, cliente: 'A', obra: 'B C' })
  const r = costoPorObra(p.grid(), { desde: '2026-08-17', hasta: '2026-08-19', mapa })
  assert.equal(r.porObra.length, 2)
  assert.deepEqual(r.porObra.map((o) => o.personas), [1, 1])
})

// ───────────────── D8 · UNA FILA DE TOTALES NO ES UNA PERSONA ─────────────────

test('una fila de totales ROTULADA cierra el bloque en vez de entrar como trabajador', () => {
  // Medido antes del arreglo: 3 personas donde hay 2 y 104 horas donde hay 52, porque la fila de
  // totales suma la columna y esa suma se volvia a sumar.
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.persona({ nombre: 'Aguero Cristian', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.cruda({
    B: txt('TOTALES'),
    F: frm('=SUM(F2:F3)', 18),
    G: frm('=SUM(G2:G3)', 18),
    H: frm('=SUM(H2:H3)', 16),
    V: frm('=SUM(V2:V3)', 52),
  })
  const g = p.grid()
  const b = detectarBloques(g, { anio: 2026 })[0]
  assert.deepEqual(trabajadoresDeBloque(g, b).map((t) => t.nombre_original), ['Pastran Marcelo', 'Aguero Cristian'])

  const r = costoPorObra(g, VENTANA)
  assert.equal(r.control.personas, 2, 'dos personas, no tres')
  assert.equal(r.porObra[0].horas, 52, '52 horas, no 104')
})

// ───────────────── D10 · DOS BLOQUES QUE COMPARTEN FECHAS ─────────────────

test('dos bloques con las mismas fechas no duplican la ventana: se declara el solape', () => {
  // Medido antes del arreglo: diasEnVentana 6 para una ventana de 3 dias, y $ 483.600 donde hay
  // $ 161.200. Nada comparaba las fechas de un bloque contra las del otro.
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  const r = costoPorObra(p.grid(), VENTANA)

  assert.equal(r.ventana.diasEnVentana, 3, 'los dias son los DISTINTOS de la ventana')
  assert.equal(r.fechasDuplicadas.length, 3)
  assert.deepEqual(r.fechasDuplicadas[0].bloques, [1, 3])
  assert.equal(r.personasRepetidas.length, 1)
  assert.equal(r.personasRepetidas[0].persona, 'PASTRAN MARCELO')
  assert.equal(r.control.ventanaConsistente, false, 'el total esta inflado y hay que decirlo')
})

test('una ventana sin solape se declara consistente: el control puede decir que si', () => {
  const p = planilla()
  p.bloque(['17/8', '18/8', '19/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  p.bloque(['20/8', '21/8', '22/8'])
  p.persona({ nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' })
  const r = costoPorObra(p.grid(), { desde: '2026-08-17', hasta: '2026-08-22', mapa: MAPA })
  assert.equal(r.ventana.diasEnVentana, 6)
  assert.deepEqual(r.fechasDuplicadas, [])
  assert.deepEqual(r.personasRepetidas, [])
  assert.equal(r.control.ventanaConsistente, true)
  assert.equal(r.porObra[0].horas, 52, 'dos quincenas distintas SI se suman')
})

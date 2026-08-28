// EL COSTO POR OBRA, PROBADO CONTRA LA FORMA REAL DE LA PLANILLA.
//
// La grilla de prueba se arma como la escribe JORNALES, no como seria comodo: la fila del bloque
// lleva las fechas Y los rotulos CLIENTE/OBRA en la misma linea (asi es la fila 496 del archivo
// real), las horas salen de un =SUM(...), el valor hora vive en una columna que este archivo NO
// conoce de antemano, y el total es un producto. Si el fixture se armara a mano con las columnas ya
// resueltas, el test no probaria lo unico que hay que probar: que las coordenadas se derivan.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectarBloques } from './jornales-estructura.mjs'
import {
  CLASE, HUECO, resolverCliente, columnasDeDinero, costoPorObra, auditarResumenPorCliente,
} from './jornales-por-obra.mjs'

const txt = (v) => ({ formula: null, valor: v, numero: null, formato: null, derivada: false })
const num = (n) => ({ formula: null, valor: String(n), numero: n, formato: null, derivada: false })
const frm = (f) => ({ formula: f, valor: null, numero: null, formato: null, derivada: false })
const vacia = () => ({ formula: null, valor: null, numero: null, formato: null, derivada: false })

const COL_HORAS = 21   // V
const COL_VH = 22      // W
const COL_TOTAL = 26   // AA
const COL_CLIENTE = 27 // AB
const COL_OBRA = 28    // AC

/**
 * Fila de bloque, calcada de la fila 496 del archivo real: los rotulos de identidad (n, Obrero,
 * Categoria) y las fechas conviven en la MISMA linea, y CLIENTE/OBRA cierran a la derecha. Ponerlos
 * en filas separadas haria pasar el test contra una planilla que no existe.
 */
function filaBloque(fechas) {
  const f = Array.from({ length: 29 }, vacia)
  f[0] = txt('n')
  f[1] = txt('Obrero')
  f[3] = txt('Categoria')
  fechas.forEach((d, i) => { f[5 + i] = txt(d) })
  f[COL_CLIENTE] = txt('CLIENTE')
  f[COL_OBRA] = txt('OBRA')
  return f
}

/** Fila de trabajador, escrita como la escribe la planilla (fila1 es el numero de fila del Sheet). */
function filaPersona({ fila1, nombre, categoria = 'OF', horas = [], vh = 5000, cliente = '', obra = '' }) {
  const f = Array.from({ length: 29 }, vacia)
  f[1] = txt(nombre)
  f[3] = txt(categoria)
  horas.forEach((h, i) => { f[5 + i] = h === null ? vacia() : (typeof h === 'string' ? txt(h) : num(h)) })
  f[COL_HORAS] = frm(`=SUM(F${fila1}:T${fila1})`)
  f[COL_VH] = vh == null ? vacia() : num(vh)
  f[COL_TOTAL] = frm(`=V${fila1}*W${fila1}`)
  f[COL_CLIENTE] = txt(cliente)
  f[COL_OBRA] = txt(obra)
  return f
}

/** Fila de resumen: el rotulo a la izquierda y un SUMIFS que mira la columna CLIENTE. */
function filaResumen(rotulo, colRotulo = 21) {
  const f = Array.from({ length: 29 }, vacia)
  f[colRotulo] = txt(rotulo)
  f[colRotulo + 1] = frm(`=SUMIFS(AA1:AA20;AB1:AB20;V${colRotulo})`)
  return f
}

const grid = (filas) => ({ titulo: 'Obreros 26', filas, merges: [], offset: { fila: 0, col: 0 } })

/** El mapa que en produccion sale de public.cliente_alias. */
const MAPA = {
  leido: true,
  alias: new Map([['LA ESTRELLA', 'LA ESTRELLA'], ['MESSINA', 'MESSINA'], ['MESSINAS', 'MESSINA']]),
  noCliente: new Map([['Z. ENFERMEDAD', 'Horas pagadas por enfermedad.']]),
}

function planilla() {
  return grid([
    filaBloque(['17/8', '18/8', '19/8']),
    filaPersona({ fila1: 2, nombre: 'Pastran Marcelo', horas: [9, 9, 8], vh: 6200, cliente: 'LA ESTRELLA', obra: 'GALPON 9' }),
    filaPersona({ fila1: 3, nombre: 'Aguero Cristian', horas: [9, null, 8], vh: 5600, cliente: 'MESSINA', obra: 'BASES' }),
    filaPersona({ fila1: 4, nombre: 'Quiroga Alexander', horas: [9, 9, 8], vh: 4500, cliente: 'z. ENFERMEDAD', obra: 'z. ENFERMEDAD' }),
  ])
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

test('las columnas de plata se derivan de las formulas, no se asumen', () => {
  const f = filaPersona({ fila1: 7, nombre: 'X', horas: [8], vh: 1000 })
  const c = columnasDeDinero(f)
  assert.equal(c.colHoras, COL_HORAS)
  assert.equal(c.colValorHora, COL_VH)
  assert.equal(c.colTotal, COL_TOTAL)
})

test('sin formulas no se inventa una columna: se declara el hueco', () => {
  const f = Array.from({ length: 29 }, vacia)
  f[1] = txt('Sin formulas')
  const c = columnasDeDinero(f)
  assert.equal(c.colHoras, null)
  assert.equal(c.colValorHora, null)
})

test('el bloque se detecta y las tres personas se leen con su obra', () => {
  const r = costoPorObra(planilla(), { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA, factorCargas: 0.3862 })
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
  const r = costoPorObra(planilla(), { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA })
  const messina = r.porObra.find((o) => o.cliente === 'MESSINA')
  assert.equal(messina.horas, 17, 'el dia sin escribir no suma ni resta')
  assert.equal(messina.personas, 1)
  assert.equal(r.huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE).length, 0)
})

test('sin factor de cargas no se inventa un recargo', () => {
  const r = costoPorObra(planilla(), { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA })
  assert.equal(r.factorCargas, null)
  for (const o of r.porObra) {
    assert.equal(o.cargas, null)
    assert.equal(o.costo, o.jornal, 'el costo es el jornal pelado')
  }
})

test('una celda con texto en la columna de horas se declara ilegible, no vale cero', () => {
  const g = planilla()
  g.filas[1][6] = txt('NO SE TOCA HASTA SEP')
  const r = costoPorObra(g, { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA })
  const ilegibles = r.huecos.filter((h) => h.tipo === HUECO.CELDA_ILEGIBLE)
  assert.equal(ilegibles.length, 1)
  assert.equal(ilegibles[0].fecha, '2026-08-18')
  assert.equal(r.control.celdasIlegibles, 1)
})

test('sin valor hora la persona queda sin valuar y su plata no se estima', () => {
  const g = grid([
    filaBloque(['17/8', '18/8', '19/8']),
    filaPersona({ fila1: 2, nombre: 'Sin tarifa', horas: [9, 9, 8], vh: null, cliente: 'LA ESTRELLA', obra: 'GALPON 9' }),
  ])
  const r = costoPorObra(g, { desde: '2026-08-17', hasta: '2026-08-19', mapa: MAPA })
  assert.equal(r.filas[0].jornal, null)
  assert.equal(r.filas[0].horas, 26, 'las horas si se conocen')
  assert.equal(r.control.personasSinValuar, 1)
  assert.equal(r.porObra[0].sinValuar, 1)
  assert.equal(r.porObra[0].jornal, 0, 'no se suma nada inventado')
  assert.ok(r.huecos.some((h) => h.tipo === HUECO.SIN_VALOR_HORA))
})

test('con el mapa no leido NADA se atribuye, y se dice que no es verificable', () => {
  const r = costoPorObra(planilla(), { desde: '2026-08-17', hasta: '2026-08-19', mapa: { leido: false } })
  assert.equal(r.control.verificable, false)
  assert.equal(r.porObra.length, 0)
  assert.equal(r.desconocidos.length, 0, 'no leer el mapa no convierte a nadie en desconocido')
  assert.ok(r.control.jornalTotal > 0, 'la plata sigue existiendo aunque no se pueda atribuir')
  assert.equal(r.control.jornalAtribuido, 0)
})

test('la ventana recorta: un dia fuera no entra', () => {
  const r = costoPorObra(planilla(), { desde: '2026-08-17', hasta: '2026-08-18', mapa: MAPA })
  assert.equal(r.ventana.diasEnVentana, 2)
  assert.equal(r.porObra.find((o) => o.obra === 'GALPON 9').horas, 18)
})

// ---- EL CONTROL DEL RESUMEN, Y SU NEGATIVO ----

test('el control del resumen encuentra el rotulo huerfano que siempre da cero', () => {
  // Esto es el defecto real de la planilla: el resumen busca MESSINAS y las filas dicen MESSINA.
  const g = planilla()
  g.filas.push(filaResumen('LA ESTRELLA'))
  g.filas.push(filaResumen('MESSINAS'))
  const b = detectarBloques(g, { anio: 2026 })[0]
  const a = auditarResumenPorCliente(g, b)
  assert.equal(a.rotulos.length, 2)
  assert.deepEqual(a.huerfanos.map((h) => h.rotulo), ['MESSINAS'], 'MESSINAS no lo usa ninguna fila')
  assert.ok(a.faltantes.some((f) => f.rotulo === 'MESSINA'), 'MESSINA esta cargado y el resumen no lo busca')
})

test('el mismo control da limpio cuando el resumen esta bien: puede decir que si y que no', () => {
  // Sin este caso, el test de arriba no probaria nada: un control que SIEMPRE encuentra algo es tan
  // inutil como uno que nunca encuentra nada.
  const g = planilla()
  g.filas.push(filaResumen('LA ESTRELLA'))
  g.filas.push(filaResumen('MESSINA'))
  g.filas.push(filaResumen('z. ENFERMEDAD'))
  const b = detectarBloques(g, { anio: 2026 })[0]
  const a = auditarResumenPorCliente(g, b)
  assert.deepEqual(a.huerfanos, [])
  assert.deepEqual(a.faltantes, [])
})

test('un cliente cargado sin fila en el resumen sale como faltante', () => {
  // El otro defecto real: QUATTROPANI tenia personas cargadas y ninguna fila que lo sumara.
  const g = planilla()
  g.filas.push(filaResumen('LA ESTRELLA'))
  const b = detectarBloques(g, { anio: 2026 })[0]
  const a = auditarResumenPorCliente(g, b)
  assert.equal(a.huerfanos.length, 0)
  const claves = a.faltantes.map((f) => f.rotulo)
  assert.ok(claves.includes('MESSINA'))
  assert.ok(claves.includes('z. ENFERMEDAD'))
})

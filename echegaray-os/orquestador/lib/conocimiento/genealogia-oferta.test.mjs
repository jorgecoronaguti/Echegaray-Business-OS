// LAS PERSIANAS METÁLICAS: $ 8.400.000 QUE ENTRARON A LA OFERTA SIN PASAR POR EL PRESUPUESTO.
//
// El escenario base son los renglones reales de `OFERTA` de `Planilla para Cotizar (2).xlsm`
// (Quattropani, 27/05/2026). Están los tres primeros con genealogía, el renglón 39 tipeado a mano,
// y el cierre real. Con eso la conciliación tiene que devolver los 8.400.000 exactos.
//
// EL DEFECTO QUE ATRAPAN: si `auditarOferta` vuelve a dejar pasar una partida sin origen —o si
// `CROSS_CLIENT_DATA_LEAK` vuelve a ser informativo en vez de bloqueante— `puedeEmitirse` se pone
// en true y estas pruebas se caen. Cada bloqueo tiene su escenario rojo Y su escenario verde: un
// control que sólo se prueba en rojo tampoco está probado.
import assert from 'node:assert/strict'
import test from 'node:test'
import { errorDeCelda } from './celda.mjs'
import { ESTADO } from './estado-valor.mjs'
import { BLOQUEO, ORIGEN, auditarOferta, conciliar, fugaEntreClientes, genealogiaDeItem, indexarPresupuesto } from './genealogia-oferta.mjs'

/** `Presupuesto!10:12` — las tres primeras partidas de la cotización de Quattropani. */
const PRESUPUESTO = Object.freeze({
  items: [
    { codigo: 'T1001', tarea: 'REPLANTEO', unidad: 'M2', cantidad: 258.77, celda: 'B10' },
    { codigo: 'T1002', tarea: 'EXCAVACIONES DE BASES Y ZANJAS PARA FUNDACIONES', unidad: 'M3', cantidad: 46.74, celda: 'B11' },
    { codigo: 'T1003', tarea: 'HORMIGON DE LIMPIEZA    e = 0,05 m', unidad: 'M3', cantidad: 1, celda: 'B12' },
  ],
})

/** `OFERTA!14:16` + el renglón 39, que es el que no existe en ningún lado. */
const ITEMS_OFERTA = Object.freeze([
  { codigo: 'T1001', tarea: 'REPLANTEO', unidad: 'M2', cantidad: 258.77, precioUnitario: 2051.56, subtotal: 530882.18, celda: 'A14' },
  { codigo: 'T1002', tarea: 'EXCAVACIONES DE BASES Y ZANJAS PARA FUNDACIONES', unidad: 'M3', cantidad: 46.74, precioUnitario: 52220.56, subtotal: 2440788.97, celda: 'A15' },
  { codigo: 'T1003', tarea: 'HORMIGON DE LIMPIEZA    e = 0,05 m', unidad: 'M3', cantidad: 1, precioUnitario: 22915.46, subtotal: 22915.46, celda: 'A16' },
  { codigo: null, tarea: 'PERSIANAS METALICAS', unidad: 'UN', cantidad: 2, precioUnitario: 4200000, subtotal: 8400000, celda: 'A39' },
])

const SUMA_CON_GENEALOGIA = 530882.18 + 2440788.97 + 22915.46
const ENCABEZADO = Object.freeze({ fila: 11, columnas: { CODIGO: 0, TAREA: 1, UN: 2, CANT: 3, 'PRECIO UNICARIO': 4, 'SUB TOTAL': 5 } })

const ofertaLimpia = () => ({
  encabezado: ENCABEZADO,
  items: ITEMS_OFERTA.slice(0, 3),
  subtotal: { valor: SUMA_CON_GENEALOGIA, error: null, celda: 'F44' },
})

const ofertaConPersianas = () => ({
  encabezado: ENCABEZADO,
  items: [...ITEMS_OFERTA],
  subtotal: { valor: SUMA_CON_GENEALOGIA + 8400000, error: null, celda: 'F44' },
})

test('un renglón que viene del presupuesto se rastrea por su código', () => {
  const g = genealogiaDeItem(ITEMS_OFERTA[0], indexarPresupuesto(PRESUPUESTO.items))
  assert.equal(g.origen, ORIGEN.PRESUPUESTO)
  assert.equal(g.por, 'codigo')
  assert.equal(g.presupuesto.celda, 'B10')
})

test('sin código, la descripción alcanza: OFERTA ARCOR esconde el código', () => {
  const g = genealogiaDeItem(
    { tarea: 'EXCAVACIONES DE BASES Y ZANJAS PARA FUNDACIONES', subtotal: 2440788.97 },
    indexarPresupuesto(PRESUPUESTO.items),
  )
  assert.equal(g.origen, ORIGEN.PRESUPUESTO)
  assert.equal(g.por, 'nombre')
})

test('EL CASO: PERSIANAS METALICAS no tiene genealogía', () => {
  const g = genealogiaDeItem(ITEMS_OFERTA[3], indexarPresupuesto(PRESUPUESTO.items))
  assert.equal(g.origen, ORIGEN.MANUAL)
  assert.equal(g.presupuesto, null)
  assert.match(g.porque, /no trae código/)
})

test('la conciliación devuelve los 8.400.000 exactos, separados del resto', () => {
  const o = ofertaConPersianas()
  const r = auditarOferta({ oferta: o, presupuesto: PRESUPUESTO })
  assert.equal(Number(r.conciliacion.conGenealogia.toFixed(2)), Number(SUMA_CON_GENEALOGIA.toFixed(2)))
  assert.equal(r.conciliacion.sinGenealogia, 8400000)
  assert.equal(r.conciliacion.diferencia, 0, 'el subtotal declarado cierra: el agujero no es aritmético')
})

test('EL DEFECTO: una oferta con una partida sin genealogía NO se emite', () => {
  const r = auditarOferta({ oferta: ofertaConPersianas(), presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, false)
  const b = r.bloqueos.filter((x) => x.tipo === BLOQUEO.PARTIDA_SIN_GENEALOGIA)
  assert.equal(b.length, 1)
  assert.equal(b[0].que, 'PERSIANAS METALICAS')
  assert.equal(b[0].importe, 8400000)
  assert.equal(b[0].donde, 'A39')
})

test('y la misma oferta SIN ese renglón sí se emite', () => {
  // El escenario verde: sin él, el bloqueo no distingue nada.
  const r = auditarOferta({ oferta: ofertaLimpia(), presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, true)
  assert.deepEqual(r.bloqueos, [])
})

test('la fuga entre clientes se detecta con su celda y su texto', () => {
  // `OFERTA!7`: cinco clientes en la misma fila. La oferta actual ocupa A:F.
  const filas = []
  filas[6] = ['QUATTOPANI FRANCO', null, null, null, null, null, 'MANUFACTURAS QUIMICAS JUAN MESSINAS', null, null, null, 'FIMA S.A.']
  const r = fugaEntreClientes(filas, { filaEncabezado: 11, ultimaColumna: 5 })
  assert.equal(r.hay, true)
  assert.deepEqual(r.casos.map((c) => c.celda), ['G7', 'K7'])
  assert.equal(r.casos[0].texto, 'MANUFACTURAS QUIMICAS JUAN MESSINAS')
})

test('un número suelto a la derecha no es una fuga: sólo los nombres lo son', () => {
  const filas = []
  filas[6] = ['QUATTOPANI FRANCO', null, null, null, null, null, 46135, 7]
  assert.equal(fugaEntreClientes(filas, { filaEncabezado: 11, ultimaColumna: 5 }).hay, false)
})

test('EL DEFECTO: la fuga entre clientes BLOQUEA, no informa', () => {
  const filas = []
  filas[6] = ['QUATTOPANI FRANCO', null, null, null, null, null, 'ORICA ARGENTINA SAIC']
  const r = auditarOferta({ oferta: ofertaLimpia(), presupuesto: PRESUPUESTO, filasDeLaOferta: filas })
  assert.equal(r.puedeEmitirse, false)
  assert.equal(r.bloqueos[0].tipo, BLOQUEO.CROSS_CLIENT_DATA_LEAK)
  assert.equal(r.bloqueos[0].donde, 'G7')
})

test('sin filas crudas no se inventa que no hay fuga: no se mira y no se bloquea por eso', () => {
  // Declarar «limpio» algo que no se pudo mirar es peor que declararlo sucio.
  const r = auditarOferta({ oferta: ofertaLimpia(), presupuesto: PRESUPUESTO })
  assert.equal(r.bloqueos.some((b) => b.tipo === BLOQUEO.CROSS_CLIENT_DATA_LEAK), false)
})

test('un SUB TOTAL en #DIV/0! bloquea, y su valor cacheado no lo salva', () => {
  const o = { ...ofertaLimpia(), subtotal: { valor: 7, error: '#DIV/0!', celda: 'F44' } }
  const r = auditarOferta({ oferta: o, presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, false)
  assert.equal(r.conciliacion.cierre, ESTADO.ERROR)
  assert.equal(r.conciliacion.declarado, null, 'el 7 cacheado NO es el subtotal')
  assert.equal(r.bloqueos.some((b) => b.tipo === BLOQUEO.CIERRE_EN_ERROR), true)
})

test('un subtotal declarado que no coincide con los renglones bloquea', () => {
  const o = { ...ofertaLimpia(), subtotal: { valor: SUMA_CON_GENEALOGIA + 1000, error: null, celda: 'F44' } }
  const r = auditarOferta({ oferta: o, presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, false)
  const b = r.bloqueos.find((x) => x.tipo === BLOQUEO.SUBTOTAL_NO_CIERRA)
  assert.equal(b.importe, 1000)
})

test('un renglón con el subtotal en #REF! se cuenta aparte y no como cero', () => {
  const r = conciliar([
    { subtotal: 100, genealogia: { origen: ORIGEN.PRESUPUESTO }, celda: 'F14' },
    { subtotal: errorDeCelda('#REF!'), genealogia: { origen: ORIGEN.PRESUPUESTO }, celda: 'F15' },
  ], { valor: 100 })
  assert.equal(r.conGenealogia, 100)
  assert.equal(r.noNumericos.length, 1)
  assert.equal(r.noNumericos[0].estado, ESTADO.ERROR)
})

test('una oferta sin ítems no es una oferta que cierra en cero', () => {
  const r = auditarOferta({ oferta: { encabezado: ENCABEZADO, items: [], subtotal: { valor: 1030800, error: null, celda: 'E20' } }, presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, false)
  assert.equal(r.conciliacion.sumaDeRenglones, 0)
  assert.equal(r.bloqueos.some((b) => b.tipo === BLOQUEO.SUBTOTAL_NO_CIERRA), true)
})

test('OFERTA SG: cero referencias al presupuesto ⇒ TODOS los renglones bloquean', () => {
  // La hoja real no tiene una sola fórmula que apunte a `Presupuesto`. Cuatro renglones, cuatro
  // bloqueos: la oferta entera es una invención respecto del presupuesto interno.
  const sg = {
    encabezado: ENCABEZADO,
    items: [
      { codigo: null, tarea: 'MOVILIZACION DE EQUIPO', cantidad: 2, subtotal: 100000, celda: 'A14' },
      { codigo: null, tarea: 'ALQUILER MINICARGADORA', cantidad: 1, subtotal: 270000, celda: 'A15' },
      { codigo: null, tarea: 'TRASLADO DE MATERIAL - CAMIONES', cantidad: 2, subtotal: 200000, celda: 'A16' },
      { codigo: null, tarea: 'PERSONAL PARA CORTE DE CALLE Y LIMPIEZA', cantidad: 6, subtotal: 460800, celda: 'A17' },
    ],
    subtotal: { valor: 1030800, error: null, celda: 'E20' },
  }
  const r = auditarOferta({ oferta: sg, presupuesto: PRESUPUESTO })
  assert.equal(r.puedeEmitirse, false)
  assert.equal(r.bloqueos.filter((b) => b.tipo === BLOQUEO.PARTIDA_SIN_GENEALOGIA).length, 4)
  assert.equal(r.conciliacion.conGenealogia, 0)
  assert.equal(r.conciliacion.sinGenealogia, 1030800)
})

test('un encabezado sin columnas no puede declarar la hoja limpia', () => {
  // `Math.max()` sobre un objeto vacío da -Infinity: el barrido habría empezado en la columna −∞
  // y no habría mirado ninguna celda, devolviendo «sin fuga» sin haber mirado.
  const filas = []
  filas[6] = ['QUATTOPANI FRANCO', 'ORICA ARGENTINA SAIC']
  const r = auditarOferta({
    oferta: { encabezado: { fila: 11, columnas: {} }, items: ITEMS_OFERTA.slice(0, 3), subtotal: { valor: SUMA_CON_GENEALOGIA, error: null, celda: 'F44' } },
    presupuesto: PRESUPUESTO,
    filasDeLaOferta: filas,
  })
  assert.equal(r.bloqueos.some((b) => b.tipo === BLOQUEO.CROSS_CLIENT_DATA_LEAK), true)
})

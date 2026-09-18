// EL LECTOR DEL PRESUPUESTO POR RUBRO, EN FRÍO: sin Drive, sin base, con una hoja armada a mano.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import {
  DEFINICION_RUBRO, OBRAS, RUBROS, agregarPorRubro, explotarLibro, horasDelDocumento, horasPorCantidades, leerAnalisis, rubroDePartida, rubroDeRecurso, rubroPorDescripcion, rubrosDeObra,
} from './presupuesto-rubros.mjs'

test('los cuatro rubros y sus definiciones son los de la migración 20260918T0900', () => {
  assert.deepEqual([...RUBROS], ['mano_obra', 'materiales', 'subcontratistas', 'otros'])
  for (const r of RUBROS) assert.ok(DEFINICION_RUBRO[r].length > 40, r)
  assert.match(DEFINICION_RUBRO.otros, /alquiler/i)
  assert.match(DEFINICION_RUBRO.otros, /combustible/i)
})

test('rubroDeRecurso: la unidad manda, después familia y nombre; combustible y máquinas van a otros', () => {
  assert.equal(rubroDeRecurso({ unidad: 'hs', nombre: 'OFICIAL' }).rubro, 'mano_obra')
  assert.equal(rubroDeRecurso({ unidad: 'hr', nombre: 'CARGA SOCIAL OF' }).rubro, 'mano_obra')
  // «HR» a secas con una máquina NO es carga social (trampa 2 de la Base Maestra).
  assert.equal(rubroDeRecurso({ unidad: 'HR', familia: 'MAQUINA', nombre: 'VIBRO COMPACTADOR' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'LT', familia: 'COMBUSTIBLE', nombre: 'NAFTA SUPER' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'Lt', familia: 'MATERIAL', division: 'COMBUSTIBLE', nombre: 'GAS OIL' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'UN', familia: 'MATERIAL', division: 'HORMIGON', nombre: 'SERVICIO DE BOMBA' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'UN', familia: 'MAQUINA', nombre: 'VIAJE DE TATU con RSU' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'Mes', familia: 'MAQUINA', nombre: 'Plataforma Electrica 8m' }).rubro, 'otros')
  assert.equal(rubroDeRecurso({ unidad: 'm3', familia: 'MATERIAL', division: 'HORMIGON', nombre: 'HORMIGÓN H-21' }).rubro, 'materiales')
  assert.equal(rubroDeRecurso({ unidad: 'm2', familia: 'MANO DE OBRA', nombre: 'Mano de Obra - Pisos Industriales' }).rubro, 'subcontratistas')
  // Sin familia: la unidad de material alcanza y lo dice; una unidad rara queda sin evidencia.
  const panel = rubroDeRecurso({ unidad: 'm2', nombre: 'Panel Chapa Trape' })
  assert.equal(panel.rubro, 'materiales'); assert.match(panel.porque, /unidad/)
  const raro = rubroDeRecurso({ unidad: 'DOLAR', nombre: 'COSTO HORA BOBCAT - DOLAR' })
  assert.equal(raro.rubro, 'otros'); assert.equal(raro.sinEvidencia, true)
})

test('rubroPorDescripcion y rubroDePartida', () => {
  assert.equal(rubroPorDescripcion('Materiales - 3 Motores').rubro, 'materiales')
  assert.equal(rubroPorDescripcion('FLETE DE CHAPAS').rubro, 'otros')
  assert.equal(rubroPorDescripcion('ENTREPISO'), null)
  assert.equal(rubroDePartida('ADIC-CS'), 'mano_obra')
  assert.equal(rubroDePartida('RAMPA-EQ'), 'otros')
  assert.equal(rubroDePartida('MA'), 'materiales')
})

/** Un libro mínimo con la forma real de la plantilla (encabezados incluidos). */
function libro({ subtotalTipeado = null } = {}) {
  const wb = XLSX.utils.book_new()
  const P = [[], [], [], [], [], [],
    ['ID TAREA', 'ID', 'TAREA', 'U.', 'CANT.', 'COSTO U TOTAL', 'COEF. AJUSTE', 'SUBTOTAL', 'TOTAL', '', '', '', '', '', 'COSTO MO', 'COSTO MA', 'COSTO CS'],
    [],
    [null, null, 'GRUPO'],
    ['zona', 'T1', 'REPLANTEO', 'M2', 10, 100, 1, 1000, 1000, null, null, null, null, null, 600, 100, 300],
    ['zona', 't2', 'PISO', 'M2', 2, 500, 2, subtotalTipeado ?? 2000, 0, null, null, null, null, null, 0, 0, 0],
    [null, null, 'Materiales - Motores', 'GL', 1, 700, 1, 700, 700],
    [null, null, 'COSTO DIRECTO TOTAL'],
  ]
  const A = [[], [], [], [], ['COD T', 'COD R', 'DESCRIPCION', 'UN', 'CANTIDAD', 'COSTO', 'TOTAL'], [],
    ['T1', null, 'REPLANTEO', 'M2', null, null, 100],
    [null, 1, 'OFICIAL', 'hs', 0.1, 600, 60],
    [null, 256, 'CARGA SOCIAL OF', 'hr', 0.1, 300, 30],
    [null, 15, 'CLAVO', 'kg', 0.5, 20, 10],
    [],
    ['T2', null, 'PISO', 'M2', null, null, 500],
    ['0.1', 1, 'OFICIAL', 'hs', 0.5, 600, 300],   // rótulo en A: sigue siendo un insumo
    [null, null, 'AYUDANTE', 'hs', 0.25, 400, 100],  // sin código: se busca por nombre
    [null, 359, 'VIBRO', 'HR', 0.5, 200, 100],
  ]
  const R = [[], [], [], ['CODIGO', 'INSUMO', 'UNIDAD', 'COSTO', 'FECHA', 'FUENTE', 'FAMILIA', 'DIVISION'],
    [1, 'OFICIAL', 'hs', 600, null, null, 'MANO DE OBRA', 'JORNALES'],
    [2, 'AYUDANTE', 'hs', 400, null, null, 'MANO DE OBRA', 'JORNALES'],
    [256, 'CARGA SOCIAL OF', 'hr', 300, null, null, 'MANO DE OBRA', 'JORNALES'],
    [15, 'CLAVO', 'kg', 20, null, null, 'MATERIAL', 'ACERO'],
    [359, 'VIBRO', 'HR', 200, null, null, 'MAQUINA', null],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(P), 'Presupuesto')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), 'Análisis')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(R), 'Recursos')
  return wb
}

test('explotarLibro: cada ítem se abre por su análisis, con rótulos, insumos sin código y un ítem sin análisis', () => {
  const ex = explotarLibro(libro())
  assert.deepEqual(ex.problemas, [])
  assert.deepEqual(ex.controles, [])
  const agg = agregarPorRubro(ex.lineas)
  // T1: 10 × (60 hs + 30 hr + 10 clavo) = 600 + 300 + 100 · T2: 2 × 2 × (300 + 100 hs, 100 HR vibro) = 1.600 + 400
  assert.equal(agg.mano_obra.monto, 900 + 1600)
  assert.equal(agg.materiales.monto, 100 + 700)
  assert.equal(agg.otros.monto, 400)
  assert.equal(agg.subcontratistas.monto, 0)
  const ayudante = agg.mano_obra.detalle.find((d) => d.item === 'AYUDANTE')
  assert.equal(ayudante.importe, 400)
  assert.equal(ayudante.cantidad, 1)
  const motores = agg.materiales.detalle.find((d) => d.item === 'Materiales - Motores')
  assert.match(motores.porque, /empieza con «Materiales»/)
  // La suma de todos los rubros es el costo directo (Σ H).
  assert.equal(RUBROS.reduce((a, r) => a + agg[r].monto, 0), 1000 + 2000 + 700)
})

test('un subtotal tipeado que no cierra con su análisis va como ajuste al rubro principal del ítem y se controla', () => {
  const ex = explotarLibro(libro({ subtotalTipeado: 2500 }))
  assert.equal(ex.controles.length, 1)
  assert.match(ex.controles[0], /H11 «PISO» = 2500 pero sus insumos suman 2000/)
  const ajuste = ex.lineas.find((l) => l.ajuste)
  assert.equal(ajuste.importe, 500)
  assert.equal(ajuste.rubro, 'mano_obra')
  const agg = agregarPorRubro(ex.lineas)
  assert.equal(agg.mano_obra.ajustes, 500)
})

test('rubrosDeObra: oferta sólo mano de obra = lo que la plantilla suma en hs y hr; el resto se lista fuera de la oferta sin monto', () => {
  const cfg = { obra: 'x', libros: [{ drive: '1abc', nombre: 'x.xlsm', parte: 'obra', soloManoObra: true }], motivoFueraDeOferta: 'sólo MO' }
  const r = rubrosDeObra(cfg, [{ libro: cfg.libros[0], explosion: explotarLibro(libro()) }])
  assert.equal(r.rubros.mano_obra.monto, 2500)
  assert.equal(r.rubros.otros.monto, 400)          // el vibro por HR entra a la oferta (Presupuesto!Q)
  assert.equal(r.rubros.materiales.monto, null)    // fuera: clavos y motores
  assert.equal(r.rubros.materiales.motivo, 'sólo MO')
  assert.ok(r.rubros.materiales.detalle.every((d) => d.fuera_de_oferta))
  assert.equal(r.costoDirecto, 2900)
  assert.match(r.rubros.subcontratistas.motivo, /no prevé subcontratos/)
})

test('rubrosDeObra: un rubro con ajustes queda estimado', () => {
  const cfg = { obra: 'x', libros: [{ drive: '1abc', nombre: 'x.xlsm', parte: 'obra' }] }
  const r = rubrosDeObra(cfg, [{ libro: cfg.libros[0], explosion: explotarLibro(libro({ subtotalTipeado: 2500 })) }])
  assert.equal(r.rubros.mano_obra.estimado, true)
  assert.equal(r.rubros.materiales.estimado, false)
  assert.equal(r.costoDirecto, 4200)
})

test('OBRAS: cada libro cita un drive id y cada obra tiene libro, partidas o motivo', () => {
  for (const o of OBRAS) {
    assert.ok(o.obra)
    if (o.sinPresupuesto) { assert.ok(o.sinPresupuesto.length > 20); continue }
    if (o.desdePartidas) { assert.match(o.cita, /INFERENCIA/); continue }
    for (const l of o.libros) assert.match(l.drive, /^1[A-Za-z0-9_-]{24,}$/, `${o.obra} ${l.nombre}`)
    if (o.libros.some((l) => l.soloManoObra)) assert.ok(o.motivoFueraDeOferta, o.obra)
  }
})

test('D6 · un coeficiente que es tipo de cambio multiplica el precio y NO la cantidad; las horas salen del documento', () => {
  const wb = XLSX.utils.book_new()
  const P = [[], [], [], [], [], [],
    ['ID TAREA', 'ID', 'TAREA', 'U.', 'CANT.', 'COSTO U TOTAL', 'COEF. AJUSTE', 'SUBTOTAL', 'TOTAL', '', '', '', '', '', 'COSTO MO', 'COSTO MA', 'COSTO CS'],
    [],
    ['x', 'T9', 'ALQUILER BOBCAT', 'HR', 32, 12.5, 1450, 580000],
    ['x', 'T1', 'REPLANTEO', 'M2', 10, 100, 1, 1000],
    [null, null, 'COSTO DIRECTO TOTAL'],
  ]
  const A = [[], [], [], [], ['COD T', 'COD R', 'DESCRIPCION', 'UN', 'CANTIDAD', 'COSTO', 'TOTAL'], [],
    ['T9', null, 'ALQUILER BOBCAT', 'HR', null, null, 12.5],
    [null, 0, 'OFICIAL ESPECIALIZADO - EN DOLARES', 'hs', 1, 4.5, 4.5],
    [null, 334, 'COSTO HORA BOBCAT - DOLAR', 'DOLAR', 1, 8, 8],
    [],
    ['T1', null, 'REPLANTEO', 'M2', null, null, 100],
    [null, 1, 'OFICIAL', 'hs', 0.1, 600, 60],
    [null, 256, 'CARGA SOCIAL OF', 'hr', 0.1, 400, 40],
  ]
  const R = [[], [], [], ['CODIGO', 'INSUMO', 'UNIDAD', 'COSTO', 'FECHA', 'FUENTE', 'FAMILIA', 'DIVISION'],
    [0, 'OFICIAL ESPECIALIZADO - EN DOLARES', 'hs', 4.5, null, null, 'MANO DE OBRA', 'JORNALES'],
    [1, 'OFICIAL', 'hs', 600, null, null, 'MANO DE OBRA', 'JORNALES'],
    [256, 'CARGA SOCIAL OF', 'hr', 400, null, null, 'MANO DE OBRA', 'JORNALES'],
    [334, 'COSTO HORA BOBCAT - DOLAR', 'DOLAR', 8, null, null, 'MAQUINA', null],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(P), 'Presupuesto')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), 'Análisis')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(R), 'Recursos')
  const ex = explotarLibro(wb)
  const oficialUsd = ex.lineas.find((l) => l.insumo === 'OFICIAL ESPECIALIZADO - EN DOLARES')
  assert.equal(oficialUsd.cantidad, 32, 'el documento dice 32 hs, no 32 × 1.450')
  assert.equal(oficialUsd.importe, 32 * 1450 * 4.5, 'el importe sí lleva el dólar')
  assert.match(oficialUsd.porque, /tipo de cambio/)
  const oficial = ex.lineas.find((l) => l.insumo === 'OFICIAL')
  assert.equal(oficial.cantidad, 1, 'un coeficiente 1 no cambia nada')
  // Horas: 32 del oficial en dólares + 1 del oficial; la carga social (hr) no es hora.
  assert.equal(horasDelDocumento([ex]), 33)
})

// ═══ 18/09 · EL SUBCONTRATO DE PISOS INDUSTRIALES ═══
// La cotización interna de Pisos Industriales (drive 1iKAAb…) modela el hormigonado de Pedro Tello como
// «OFICIAL 0,9 hs/m²» con las cargas sociales anuladas (=E1012*0): el lector lo leía como mano de obra
// propia y subcontratistas quedaba en 0. La planilla hermana «Horas Hombre - Pisos Industriales.xlsm»
// (misma carpeta, mismo día) re-analiza la misma tarea con el recurso PEDRO TELLO (M2, $4.300) — pero
// su hoja Presupuesto tiene COSTO MO/MA/CS en J/K/L (y las horas en I), no en O/P/Q.

/** Un libro con la forma de «Horas Hombre - Pisos Industriales.xlsm». */
function libroHorasHombre() {
  const wb = XLSX.utils.book_new()
  const P = [[], [], [], [], [], [],
    ['ID TAREA', 'ID', 'TAREA', 'U.', 'CANT.', 'COSTO U TOTAL', 'COEF. AJUSTE', 'SUBTOTAL', 'FECHA', 'COSTO MO', 'COSTO MA', 'COSTO CS'],
    [],
    [2144, 'T1107.1', 'PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA', 'M2', 100, 4718, 1, 471800, 8, 41800, 430000, 0],
    [null, null, 'COSTO DIRECTO TOTAL'],
  ]
  const A = [[], [], [], [], ['COD T', 'COD R', 'DESCRIPCION', 'UN', 'CANTIDAD', 'COSTO', 'TOTAL'], [],
    ['T1107.1', null, 'PISO DE HORMIGON ALISADO MECÁNICO - MANO DE OBRA', 'M2', null, null, 4718],
    [null, 1, 'OFICIAL', 'hs', 0.08, 5225, 418],
    [null, 401, 'PEDRO TELLO', 'M2', 1, 4300, 4300],
    [null, 256, 'CARGA SOCIAL OF', 'hr', 0, 5460, 0],
  ]
  const R = [[], [], [], ['CODIGO', 'INSUMO', 'UNIDAD', 'COSTO', 'FECHA', 'FUENTE', 'FAMILIA', 'DIVISION'],
    [1, 'OFICIAL', 'hs', 5225, null, 'UOCRA', 'MANO DE OBRA', 'JORNALES'],
    [256, 'CARGA SOCIAL OF', 'hr', 5460, null, null, 'MANO DE OBRA', 'JORNALES'],
    [401, 'PEDRO TELLO', 'M2', 4300, null, 'SUBCONTRATISTA', 'MANO DE OBRA', null],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(P), 'Presupuesto')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(A), 'Análisis')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(R), 'Recursos')
  return wb
}

test('la planilla de Horas Hombre (MO/MA/CS en J/K/L) se lee; el subcontrato por m² va a subcontratistas y no suma horas propias', () => {
  const ex = explotarLibro(libroHorasHombre())
  assert.deepEqual(ex.problemas, [], 'el encabezado se busca por su texto, no por la letra de la columna')
  const agg = agregarPorRubro(ex.lineas)
  assert.equal(agg.subcontratistas.monto, 430000, '100 m² × $4.300 de PEDRO TELLO')
  assert.equal(agg.mano_obra.monto, 41800)
  assert.match(agg.subcontratistas.detalle[0].porque, /subcontrato/)
  assert.equal(horasDelDocumento([ex]), 8, 'sólo las 0,08 hs/m² del oficial propio; el m² del subcontratista no es hora')
})

test('un encabezado de Presupuesto sin COSTO MO/MA/CS sigue siendo un problema (no se lee a ciegas)', () => {
  const wb = libroHorasHombre()
  wb.Sheets.Presupuesto.J7.v = 'OTRA COSA'
  assert.match(explotarLibro(wb).problemas.join(' '), /COSTO MO/i)
})

test('OBRAS · pisos-industriales lee el documento que nombra al subcontratista, con la cotización vendida citada', () => {
  const o = OBRAS.find((x) => x.obra === 'pisos-industriales')
  assert.equal(o.libros[0].drive, '1qCcsSD2oe15d9JCP2-TqfGqyxRp48Ydb')
  assert.match(o.libros[0].nota, /1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF/)
  const cfg = { obra: 'x', libros: [{ drive: '1abc', nombre: 'hh.xlsm', parte: 'obra', nota: 'misma oferta que y.xlsm' }] }
  const r = rubrosDeObra(cfg, [{ libro: cfg.libros[0], explosion: explotarLibro(libroHorasHombre()) }])
  assert.match(r.rubros.subcontratistas.cita, /misma oferta que y\.xlsm/)
  assert.equal(r.hh, 8)
})

test('horasPorCantidades: horas propias por unidad del Análisis × cantidades de otro documento (el PDF vendido)', () => {
  const tareas = leerAnalisis(libro().Sheets['Análisis']).tareas
  const r = horasPorCantidades(tareas, [
    { codigo: 'T1', cantidad: 10, coef: 1, cita: 'pdf a' },       // 0,1 hs × 10 = 1 (la carga social no es hora)
    { codigo: 'T2', cantidad: 2, coef: 2, cita: 'pdf a' },        // (0,5 + 0,25) × 2 × 2 = 3 (el vibro por HR no es hora)
  ])
  assert.equal(r.hh, 4)
  assert.deepEqual(r.faltan, [])
  const sinTarea = horasPorCantidades(tareas, [{ codigo: 'T99', cantidad: 1, coef: 1, cita: 'x' }])
  assert.deepEqual(sinTarea.faltan, ['T99'])
  assert.equal(sinTarea.hh, null, 'una tarea que no está en el Análisis no se completa con cero')
})

test('OBRAS · messina-pisos-120-rampa: las horas salen del Análisis del .xlsm × las cantidades de los dos PDF vendidos', () => {
  const o = OBRAS.find((x) => x.obra === 'messina-pisos-120-rampa')
  assert.match(o.horas.drive, /^1[A-Za-z0-9_-]{24,}$/)
  assert.ok(o.horas.cantidades.length >= 10)
  for (const c of o.horas.cantidades) assert.match(c.cita, /pdf/i, c.codigo)
})

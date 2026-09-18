// EL LECTOR DEL PRESUPUESTO POR RUBRO, EN FRÍO: sin Drive, sin base, con una hoja armada a mano.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx'
import {
  DEFINICION_RUBRO, OBRAS, RUBROS, agregarPorRubro, explotarLibro, rubroDePartida, rubroDeRecurso, rubroPorDescripcion, rubrosDeObra,
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

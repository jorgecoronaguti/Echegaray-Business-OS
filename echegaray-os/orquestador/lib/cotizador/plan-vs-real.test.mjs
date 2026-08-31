// §18 · PLAN vs REAL. El invariante central: `comparable: false` NO ES «sin desvío».
//
// Y el que lo sostiene: el control TIENE que poder dar rojo. Cada test que verifica un «0 desvíos»
// tiene su gemelo que verifica que el mismo camino produce un desvío cuando el desvío existe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { consolidarEjecucion, magnitud, UNIDAD } from './ejecucion-real.mjs'
import {
  compararObra, compararPartida, compararMagnitud, observacion, causaDeDesvio,
  CONCEPTO, NO_COMPARABLE, SIN_CAUSA,
} from './plan-vs-real.mjs'
import { ESTADO } from './contrato.mjs'

const PLAN = [
  { cotizacionPartidaId: 'p1', actividadId: 'a1', codigo: 'T1001', descripcion: 'REPLANTEO', unidad: 'm2', cantidadPlan: 258.77, hsUnitariasPlan: 0.12, hhPlan: 31.0524, costoPlan: 315_603, diasPlan: 2, subcontratada: false },
  { cotizacionPartidaId: 'p2', actividadId: 'a2', codigo: 'T1002', descripcion: 'EXCAVACIONES', unidad: 'm3', cantidadPlan: 46.74, hsUnitariasPlan: 3.4, hhPlan: 158.916, costoPlan: 1_451_151, diasPlan: 6, subcontratada: false },
  { cotizacionPartidaId: 'p3', actividadId: 'a3', codigo: 'T1059', descripcion: 'SANITARIA', unidad: 'un', cantidadPlan: 1, hsUnitariasPlan: null, hhPlan: 0, costoPlan: 719_689, diasPlan: null, subcontratada: true },
]

const consolidar = (x) => consolidarEjecucion({ plan: PLAN, ...x })
const de = (obs, concepto, entidad) => obs.find((o) => o.concepto === concepto && o.entidad === entidad)

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL INVARIANTE CENTRAL
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NULL ≠ 0: una partida sin ejecución NO es «ejecutado 0» ni «−100% de desvío»', () => {
  // MUTACIÓN CORRIDA: en `obsCantidad`, reemplazar el retorno no comparable por
  // `observacion({…, real: magnitud(0, UNIDAD.FISICA), comparable: true})` →
  // «AssertionError: una partida sin tocar salió con -100% de desvío». Revertida.
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({}) })
  const cant = de(r.observaciones, CONCEPTO.CANTIDAD, 'T1001')
  assert.equal(cant.comparable, false, 'una partida sin tocar salió comparable')
  assert.equal(cant.real, null)
  assert.equal(cant.desvio, null)
  assert.equal(cant.desvioPct, null, `una partida sin tocar salió con ${cant.desvioPct}% de desvío`)
  assert.equal(cant.motivoNoComparable, NO_COMPARABLE.SIN_REAL)
  assert.equal(cant.estado, ESTADO.FALTA_DATO)
  assert.equal(r.resumen.comparables, 0)
  assert.equal(r.resumen.desvioPctPromedio, null, 'un promedio de cero observaciones dio 0 y se lee como «sin desvío»')
})

test('el promedio PUEDE dar un número: con observaciones comparables sale el desvío real', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a1', fecha: '2026-08-22', cantidad: 300, avance_pct: 100 }],
  }) })
  const cant = de(r.observaciones, CONCEPTO.CANTIDAD, 'T1001')
  assert.equal(cant.comparable, true)
  assert.ok(Math.abs(cant.desvio - (300 - 258.77)) < 1e-9)
  assert.ok(cant.desvioPct > 15 && cant.desvioPct < 17, `el desvío dio ${cant.desvioPct}%`)
  assert.notEqual(r.resumen.desvioPctPromedio, null)
})

test('PARTIDA_EN_CURSO: 20 de 46,74 m³ excavados NO son un −57%', () => {
  // Caso REAL de Quattropani (obra_ejecucion, 22/08/2026).
  // MUTACIÓN CORRIDA: sacar el `if (!real.cerrada)` de `obsCantidad` →
  // «AssertionError: la excavación empezada se publicó como un desvío de -57.2%». Revertida.
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 20 }],
  }) })
  const cant = de(r.observaciones, CONCEPTO.CANTIDAD, 'T1002')
  assert.equal(cant.comparable, false, `la excavación empezada se publicó como un desvío de ${cant.desvioPct?.toFixed(1)}%`)
  assert.equal(cant.motivoNoComparable, NO_COMPARABLE.PARTIDA_EN_CURSO)
  assert.equal(cant.real, 20, 'el dato real igual tiene que estar a la vista')
  assert.equal(cant.desvioPct, null)
})

test('el rendimiento SÍ se lee con la partida abierta: es un cociente, no un total', () => {
  // 20 m³ con 90 HH = 4,5 HH/m³ contra 3,4 cotizadas: +32% sin esperar a que termine.
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 20 }],
    horas: [{ actividad_id: 'a2', fecha: '2026-08-22', horas: 90, persona_id: 'x', tipo_hora: 'normal' }],
  }) })
  const rend = de(r.observaciones, CONCEPTO.RENDIMIENTO, 'T1002')
  assert.equal(rend.comparable, true)
  assert.equal(rend.plan, 3.4)
  assert.equal(rend.real, 4.5)
  assert.ok(Math.abs(rend.desvioPct - 32.35) < 0.1, `el rendimiento dio ${rend.desvioPct}%`)
  assert.equal(rend.unidad, UNIDAD.RATIO)
})

test('el rendimiento NO se calcula si sólo hay porcentaje: sin cantidad no hay HH/unidad', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', avance_pct: 45 }],
    horas: [{ actividad_id: 'a2', fecha: '2026-08-22', horas: 90, tipo_hora: 'normal' }],
  }) })
  const rend = de(r.observaciones, CONCEPTO.RENDIMIENTO, 'T1002')
  assert.equal(rend.comparable, false)
  assert.equal(rend.motivoNoComparable, NO_COMPARABLE.SOLO_PORCENTAJE)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// HH ≠ DURACIÓN, hecho cumplir por la comparación misma
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('comparar HH contra días levanta excepción, no devuelve un número plausible', () => {
  // MUTACIÓN CORRIDA: sacar el chequeo de unidad de `compararMagnitud` →
  // «AssertionError: Missing expected exception» + el test de duración dejó de proteger.  Revertida.
  assert.throws(
    () => compararMagnitud(magnitud(12, UNIDAD.DIA), magnitud(160, UNIDAD.HH)),
    /no se comparan día contra HH/,
  )
  assert.throws(() => compararMagnitud(magnitud(1000, UNIDAD.MONEDA), magnitud(5, UNIDAD.FISICA)), /no se comparan/)
})

test('la duración compara días con días: 3 días reales contra 6 planificados', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22' }, { actividad_id: 'a2', fecha: '2026-08-24' }],
    horas: [{ actividad_id: 'a2', fecha: '2026-08-22', horas: 160, tipo_hora: 'normal' }],
  }) })
  const dur = de(r.observaciones, CONCEPTO.DURACION, 'T1002')
  assert.equal(dur.unidad, UNIDAD.DIA)
  assert.equal(dur.plan, 6)
  assert.equal(dur.real, 3, `la duración salió ${dur.real}: si dice 160 alguien le pasó las HH`)
  assert.equal(dur.desvio, -3)
  const hh = de(r.observaciones, CONCEPTO.HH, 'T1002')
  assert.equal(hh.real, 160, 'las HH y los días son dos observaciones distintas de la misma partida')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// HH: EL CERO DEL SUBCONTRATO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('subcontratada sin HH imputadas: NO_APLICA, no un desvío ni un hueco', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({}) })
  const hh = de(r.observaciones, CONCEPTO.HH, 'T1059')
  assert.equal(hh.comparable, false)
  assert.equal(hh.estado, ESTADO.NO_APLICA)
  assert.equal(hh.motivoNoComparable, NO_COMPARABLE.SUBCONTRATADA_SIN_HH)
})

test('las HH de una partida ABIERTA no son un ahorro del 93,7%', () => {
  // DEFECTO REAL, encontrado por la corrida sobre Quattropani y no por la revisión: T1002 tenía 10
  // HH imputadas contra 158,916 cotizadas y la comparación publicaba «−93,7%» — la excavación más
  // eficiente de la historia, sobre una partida que recién empezaba.
  // MUTACIÓN CORRIDA: sacar el `if (!real.cerrada)` de `obsHH` →
  // «AssertionError: 10 de 158.916 HH se publicaron como un ahorro de -93.7%». Revertida.
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 20 }],
    horas: [{ actividad_id: 'a2', fecha: '2026-08-22', horas: 10, persona_id: 'x', tipo_hora: 'normal' }],
  }) })
  const hh = de(r.observaciones, CONCEPTO.HH, 'T1002')
  assert.equal(hh.comparable, false, `10 de 158.916 HH se publicaron como un ahorro de ${hh.desvioPct?.toFixed(1)}%`)
  assert.equal(hh.motivoNoComparable, NO_COMPARABLE.PARTIDA_EN_CURSO)
  assert.equal(hh.real, 10, 'el consumo real igual tiene que verse')

  // Pero el RENDIMIENTO sí, porque es un cociente: 10 HH / 20 m³ = 0,5 contra 3,4 cotizadas.
  const rend = de(r.observaciones, CONCEPTO.RENDIMIENTO, 'T1002')
  assert.equal(rend.comparable, true, 'el cociente se puede leer con la partida abierta')
  assert.equal(rend.real, 0.5)
})

test('cerrada, las HH SÍ dan rojo: el control puede decir que sí', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 46.74, avance_pct: 100 }],
    horas: [{ actividad_id: 'a2', fecha: '2026-08-22', horas: 210, persona_id: 'x', tipo_hora: 'normal' }],
  }) })
  const hh = de(r.observaciones, CONCEPTO.HH, 'T1002')
  assert.equal(hh.comparable, true)
  assert.ok(hh.desvioPct > 30, `las HH se pasaron ${hh.desvioPct?.toFixed(1)}%`)
})

test('subcontratada CON horas propias imputadas SÍ es un hallazgo, y sin dividir por cero', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    horas: [{ actividad_id: 'a3', fecha: '2026-08-22', horas: 64, persona_id: 'x', tipo_hora: 'normal' }],
  }) })
  const hh = de(r.observaciones, CONCEPTO.HH, 'T1059')
  assert.equal(hh.comparable, true, 'gastar horas propias en algo pagado a un tercero tiene que verse')
  assert.equal(hh.plan, 0)
  assert.equal(hh.desvio, 64)
  assert.equal(hh.desvioPct, null, 'dividir por un plan de 0 habría devuelto Infinity')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// COSTO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el costo de una partida abierta no es un ahorro', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 20 }],
    costos: [{ cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'H17', monto: 600_000, fecha: '2026-08-22' }],
  }) })
  const costo = de(r.observaciones, CONCEPTO.COSTO, 'T1002')
  assert.equal(costo.comparable, false, 'gastar el 41% del presupuesto se publicó como 59% de ahorro')
  assert.equal(costo.motivoNoComparable, NO_COMPARABLE.PARTIDA_EN_CURSO)
  assert.equal(costo.real, 600_000)
})

test('cerrada y sobrecostada: el costo SÍ da rojo', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 46.74, avance_pct: 100 }],
    costos: [{ cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'H17', monto: 1_900_000, fecha: '2026-08-22' }],
  }) })
  const costo = de(r.observaciones, CONCEPTO.COSTO, 'T1002')
  assert.equal(costo.comparable, true)
  assert.equal(costo.desvio, 1_900_000 - 1_451_151)
  assert.ok(costo.desvioPct > 30, `el sobrecosto dio ${costo.desvioPct}%`)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// MATERIAL Y PRECIO, RECURSO POR RECURSO
// ══════════════════════════════════════════════════════════════════════════════════════════════

const COMPOSICION = [
  { partida_id: 'p2', recurso_codigo: 'H17', recurso_nombre: 'Hormigón H17', tipo: 'material', unidad: 'm3', cantidad: 1.02, desperdicio: 0.03, costo_unitario: 120_000 },
]

test('material y precio se comparan por recurso, con desperdicio y precio ponderado', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, composicion: COMPOSICION, ejecucion: consolidarEjecucion({
    plan: PLAN, composicion: COMPOSICION,
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 46.74, avance_pct: 100 }],
    costos: [
      { cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'H17', unidad: 'm3', cantidad: 2, precio_unitario: 100_000, monto: 200_000, fecha: '2026-08-20' },
      { cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'H17', unidad: 'm3', cantidad: 50, precio_unitario: 140_000, monto: 7_000_000, fecha: '2026-08-22' },
    ],
  }) })
  const mat = de(r.observaciones, CONCEPTO.MATERIAL, 'T1002·H17')
  const previsto = 1.02 * 1.03 * 46.74
  assert.ok(Math.abs(mat.plan - previsto) < 1e-9, 'el desperdicio del 3% tiene que estar adentro del previsto')
  assert.equal(mat.real, 52)
  assert.equal(mat.comparable, true)

  const pre = de(r.observaciones, CONCEPTO.PRECIO, 'T1002·H17')
  // Ponderado: (100.000×2 + 140.000×50) / 52 = 138.461,54. El promedio simple daría 120.000 — o sea,
  // «compramos al precio cotizado», que es exactamente el desvío que se estaría escondiendo.
  assert.ok(Math.abs(pre.real - 138_461.538) < 0.01, `el precio real dio ${pre.real}`)
  assert.equal(pre.plan, 120_000)
  assert.ok(pre.desvioPct > 15, `el precio se compró ${pre.desvioPct?.toFixed(1)}% arriba`)
})

test('un material consumido que la composición NO preveía sale como CONFLICTO, no se descarta', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidarEjecucion({
    plan: PLAN, composicion: COMPOSICION,
    costos: [{ cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'ADITIVO', recurso_nombre: 'Aditivo acelerante', cantidad: 40, precio_unitario: 9_000, monto: 360_000, fecha: '2026-08-22' }],
  }) })
  const extra = r.observaciones.find((o) => o.motivoNoComparable === NO_COMPARABLE.SIN_RECURSO_EN_COMPOSICION)
  assert.ok(extra, 'un recurso consumido y no cotizado desapareció de la comparación')
  assert.equal(extra.estado, ESTADO.CONFLICTO)
  assert.equal(extra.evidencia.monto, 360_000)
  assert.equal(extra.real, 40)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CAUSA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('SIN_CAUSA por defecto: la causa no se deduce del signo del desvío', () => {
  // MUTACIÓN CORRIDA: en `causaDeDesvio`, devolver `{causa: 'RENDIMIENTO_MENOR'}` cuando no hay
  // incidencias → «AssertionError: se inventó la causa RENDIMIENTO_MENOR sin ninguna evidencia».
  // Revertida.
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 60, avance_pct: 100 }],
  }) })
  const cant = de(r.observaciones, CONCEPTO.CANTIDAD, 'T1002')
  assert.ok(cant.desvioPct > 25, 'hace falta que haya un desvío grande para que la tentación exista')
  assert.equal(cant.causa, SIN_CAUSA, `se inventó la causa ${cant.causa} sin ninguna evidencia`)
  assert.equal(r.resumen.conCausa, 0)
})

test('la causa SÍ aparece cuando alguien la escribió — el control puede decir que sí', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 60, avance_pct: 100, causa_desvio: 'ROCA_IMPREVISTA', comentario: 'roca a 1,2 m' }],
  }) })
  const cant = de(r.observaciones, CONCEPTO.CANTIDAD, 'T1002')
  assert.equal(cant.causa, 'ROCA_IMPREVISTA')
  assert.equal(cant.evidencia.incidencias[0].texto, 'roca a 1,2 m')
  assert.ok(r.resumen.conCausa > 0)
})

test('dos causas distintas no se promedian ni se elige una: CAUSAS_MULTIPLES', () => {
  const c = causaDeDesvio({ incidencias: [{ causa: 'LLUVIA' }, { causa: 'FALTA_MATERIAL' }] })
  assert.equal(c.causa, 'CAUSAS_MULTIPLES')
  assert.deepEqual(c.evidencia.causas, ['LLUVIA', 'FALTA_MATERIAL'])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CONSTRUCTOR DE OBSERVACIONES SE DEFIENDE SOLO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('no comparable sin motivo no se puede construir: sería un hueco escondido', () => {
  assert.throws(() => observacion({
    concepto: CONCEPTO.HH, entidad: 'X', unidad: UNIDAD.HH,
    plan: magnitud(10, UNIDAD.HH), real: magnitud(null, UNIDAD.HH), comparable: false,
  }), /hay que decir por qué/)
  assert.throws(() => observacion({
    concepto: CONCEPTO.HH, entidad: 'X', unidad: UNIDAD.HH,
    plan: magnitud(10, UNIDAD.HH), real: magnitud(8, UNIDAD.HH), comparable: true, motivoNoComparable: NO_COMPARABLE.SIN_REAL,
  }), /no puede traer motivo/)
  assert.throws(() => observacion({ concepto: 'PRODUCTIVIDAD', entidad: 'X', unidad: UNIDAD.HH, plan: magnitud(1, UNIDAD.HH), real: magnitud(1, UNIDAD.HH), comparable: true }), /concepto desconocido/)
})

test('el resumen desglosa POR MOTIVO: «14 no comparables» sin desglose no dice qué hacer', () => {
  const r = compararObra({ obraId: 'q', plan: PLAN, ejecucion: consolidar({
    ejecuciones: [{ actividad_id: 'a1', fecha: '2026-08-22', avance_pct: 60 }],
  }) })
  assert.ok(r.resumen.porMotivo[NO_COMPARABLE.SOLO_PORCENTAJE] >= 1)
  assert.ok(r.resumen.porMotivo[NO_COMPARABLE.SIN_REAL] >= 1)
  assert.equal(r.resumen.noComparables, Object.values(r.resumen.porMotivo).reduce((a, b) => a + b, 0), 'el desglose tiene que sumar el total')
  assert.equal(r.motor, 'plan-vs-real/1.0.0')
})

test('comparar sin plan o sin real levanta: una lista no es una comparación', () => {
  assert.throws(() => compararPartida({ plan: PLAN[0], real: null }), /no hay comparación/)
})

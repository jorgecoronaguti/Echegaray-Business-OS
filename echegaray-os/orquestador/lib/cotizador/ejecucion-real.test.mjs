// §17 · LA EJECUCIÓN REAL. Lo que se prueba acá es que el motor NO rellena huecos:
// HH ≠ DURACIÓN ≠ PERSONAS · NULL ≠ 0 · lo que no engancha con una partida NO desaparece.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  consolidarEjecucion, duracionDeCalendario, diasTrabajados, horasHombre, personasDistintas,
  cantidadEjecutada, magnitud, UNIDAD,
} from './ejecucion-real.mjs'

const PLAN = [
  { cotizacionPartidaId: 'p1', actividadId: 'a1', codigo: 'T1001', descripcion: 'REPLANTEO', unidad: 'm2', cantidadPlan: 258.77, hsUnitariasPlan: 0.12, hhPlan: 31.05, costoPlan: 315_603, diasPlan: 2, subcontratada: false },
  { cotizacionPartidaId: 'p2', actividadId: 'a2', codigo: 'T1002', descripcion: 'EXCAVACIONES', unidad: 'm3', cantidadPlan: 46.74, hsUnitariasPlan: 3.4, hhPlan: 158.92, costoPlan: 1_451_151, diasPlan: 6, subcontratada: false },
  { cotizacionPartidaId: 'p3', actividadId: null, codigo: 'T1059', descripcion: 'SANITARIA', unidad: 'un', cantidadPlan: 1, hsUnitariasPlan: null, hhPlan: 0, costoPlan: 719_689, diasPlan: null, subcontratada: true },
]

// ══════════════════════════════════════════════════════════════════════════════════════════════
// HH ≠ DURACIÓN ≠ PERSONAS · las tres magnitudes, etiquetadas
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('HH ≠ DURACIÓN ≠ PERSONAS: 160 HH de 4 personas en 5 días son tres números distintos', () => {
  // MUTACIÓN CORRIDA: en `duracionDeCalendario`, devolver `magnitud(fechas.length, UNIDAD.HH)` →
  // «AssertionError: la duración salió etiquetada HH». Revertida.
  const horas = []
  for (const f of ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']) {
    for (const p of ['pe1', 'pe2', 'pe3', 'pe4']) horas.push({ actividad_id: 'a1', fecha: f, horas: 8, persona_id: p, tipo_hora: 'normal' })
  }
  const hh = horasHombre(horas)
  const dur = duracionDeCalendario(horas.map((h) => h.fecha))
  const gente = personasDistintas(horas)

  assert.equal(hh.valor, 160); assert.equal(hh.unidad, UNIDAD.HH)
  assert.equal(dur.valor, 5); assert.equal(dur.unidad, UNIDAD.DIA, 'la duración salió etiquetada ' + dur.unidad)
  assert.equal(gente.valor, 4); assert.equal(gente.unidad, UNIDAD.PERSONA)
  assert.notEqual(hh.valor, dur.valor)
  assert.notEqual(hh.valor, gente.valor)
})

test('duración ≠ días trabajados: 3 jornadas en 3 semanas son 3 y 15', () => {
  const fechas = ['2026-08-03', '2026-08-10', '2026-08-17']
  assert.equal(duracionDeCalendario(fechas).valor, 15, 'un frente parado dos semanas duró dos semanas más')
  assert.equal(diasTrabajados(fechas).valor, 3)
})

test('un solo día trabajado dura 1 día, no 0 — dividir por 0 da un ritmo infinito', () => {
  assert.equal(duracionDeCalendario(['2026-08-22']).valor, 1)
})

test('sin fechas la duración es null, no 0', () => {
  const d = duracionDeCalendario([])
  assert.equal(d.valor, null)
  assert.equal(d.unidad, UNIDAD.DIA)
  assert.match(d.detalle, /sin ninguna fecha/)
})

test('magnitud rechaza una unidad inventada', () => {
  assert.throws(() => magnitud(5, 'jornadas'), /unidad desconocida/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NULL ≠ 0
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('NULL ≠ 0 en HH: sin imputaciones es null, no cero horas trabajadas', () => {
  // MUTACIÓN CORRIDA: en `horasHombre`, `if (!filas.length) return magnitud(0, UNIDAD.HH)` →
  // «AssertionError: cero imputaciones se publicó como cero horas trabajadas». Revertida.
  const h = horasHombre([])
  assert.equal(h.valor, null, 'cero imputaciones se publicó como cero horas trabajadas')
  assert.notEqual(h.valor, 0)
  assert.equal(horasHombre([{ horas: 8, tipo_hora: 'normal' }]).valor, 8, 'el contador tiene que poder dar un número')
})

test('las personas son null cuando la imputación no dice quién, no 1', () => {
  const g = personasDistintas([{ horas: 8 }, { horas: 8 }])
  assert.equal(g.valor, null, 'dos imputaciones anónimas se contaron como una cuadrilla de 1')
  assert.match(g.detalle, /no identifican/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL PORCENTAJE NO SE CONVIERTE EN CANTIDAD
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('SOLO_PORCENTAJE: un avance del 60% no produce una cantidad ejecutada', () => {
  // Es el caso de 247 de las 251 filas reales de obra_ejecucion.
  // MUTACIÓN CORRIDA: devolver `magnitud(avancePct/100*cantidadPlan, …)` cuando no hay cantidad →
  // «AssertionError: el porcentaje se convirtió en cantidad: el desvío daría cero siempre». Revertida.
  const r = cantidadEjecutada([{ fecha: '2026-08-20', cantidad: null, avance_pct: 60 }], { unidad: 'm2' })
  assert.equal(r.cantidad.valor, null, 'el porcentaje se convirtió en cantidad: el desvío daría cero siempre')
  assert.equal(r.avancePct, 60)
  assert.equal(r.motivo, 'SOLO_PORCENTAJE')
  assert.equal(r.cerrada, false)
})

test('el avance es acumulado: manda el último porcentaje, no la suma', () => {
  const r = cantidadEjecutada([
    { fecha: '2026-08-20', avance_pct: 40 }, { fecha: '2026-08-25', avance_pct: 70 }, { fecha: '2026-08-22', avance_pct: 55 },
  ])
  assert.equal(r.avancePct, 70, 'sumar los avances daría 165%')
})

test('la cantidad SÍ se suma cuando está cargada — y el 100% cierra la partida', () => {
  // Caso REAL de Quattropani: REPLANTEO se cargó en dos partes, 194,08 + 64,69 = 258,77 m².
  const r = cantidadEjecutada([
    { fecha: '2026-08-22', cantidad: 194.08, metodo: 'cantidad' },
    { fecha: '2026-08-22', cantidad: 64.69, metodo: 'cantidad', avance_pct: 100 },
  ], { unidad: 'm2' })
  assert.ok(Math.abs(r.cantidad.valor - 258.77) < 1e-9)
  assert.equal(r.cerrada, true)
  assert.equal(r.motivo, null)
})

test('sin ningún registro: SIN_REGISTRO, y NO es cantidad cero ni partida cerrada', () => {
  const r = cantidadEjecutada([])
  assert.equal(r.cantidad.valor, null)
  assert.equal(r.motivo, 'SIN_REGISTRO')
  assert.equal(r.cerrada, false)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE NO ENGANCHA NO DESAPARECE
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('una cantidad ejecutada sin partida asociada NO se cuenta callada', () => {
  // MUTACIÓN CORRIDA: en `sinImputar`, devolver listas vacías (`[]`) →
  // «AssertionError: 2 avances quedaron fuera de toda partida y nadie lo dijo». Revertida.
  const c = consolidarEjecucion({
    plan: PLAN,
    ejecuciones: [
      { actividad_id: 'a1', fecha: '2026-08-22', cantidad: 258.77, avance_pct: 100 },
      { actividad_id: 'a99', fecha: '2026-08-22', cantidad: 40, avance_pct: 100 },   // actividad ajena al plan
      { actividad_id: null, fecha: '2026-08-23', avance_pct: 100 },                   // sin actividad
    ],
    horas: [{ actividad_id: 'a77', fecha: '2026-08-22', horas: 24, persona_id: 'x', tipo_hora: 'normal' }],
    costos: [
      { cotizacion_partida_id: 'p1', tipo: 'MATERIAL', recurso_codigo: 'CAL', monto: 100_000, fecha: '2026-08-20' },
      { cotizacion_partida_id: null, tipo: 'MATERIAL', recurso_codigo: 'VARIOS', monto: 4_100_000, fecha: '2026-08-21' },
    ],
  })
  assert.equal(c.sinImputar.ejecuciones.length, 2, `${c.sinImputar.ejecuciones.length} avances quedaron fuera de toda partida y nadie lo dijo`)
  assert.equal(c.resumen.sinImputar.ejecuciones, 2)
  assert.equal(c.resumen.sinImputar.hhSinImputar, 24, 'las horas huérfanas tienen que sumar en algún lado')
  assert.equal(c.resumen.sinImputar.montoSinImputar, 4_100_000, 'un costo sin imputar que no se declara hace la obra más barata de lo que fue')
})

test('el contador de huérfanos PUEDE dar cero: todo imputado reporta nada suelto', () => {
  const c = consolidarEjecucion({
    plan: PLAN,
    ejecuciones: [{ actividad_id: 'a1', fecha: '2026-08-22', cantidad: 258.77, avance_pct: 100 }],
    costos: [{ cotizacion_partida_id: 'p2', tipo: 'MATERIAL', recurso_codigo: 'H17', monto: 50_000, fecha: '2026-08-20' }],
  })
  assert.equal(c.resumen.sinImputar.ejecuciones, 0)
  assert.equal(c.resumen.sinImputar.costos, 0)
  assert.equal(c.resumen.sinImputar.montoSinImputar, null, 'sin costos huérfanos el monto es null, no 0')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CONSOLIDACIÓN COMPLETA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('consolidar arma las tres magnitudes por partida sin mezclarlas', () => {
  const c = consolidarEjecucion({
    plan: PLAN,
    ejecuciones: [{ actividad_id: 'a2', fecha: '2026-08-22', cantidad: 20, causa_desvio: 'ROCA_IMPREVISTA', comentario: 'apareció roca a 1,2 m' }],
    horas: [
      { actividad_id: 'a2', fecha: '2026-08-22', horas: 45, persona_id: 'pe1', tipo_hora: 'normal' },
      { actividad_id: 'a2', fecha: '2026-08-24', horas: 45, persona_id: 'pe2', tipo_hora: 'normal' },
      { actividad_id: 'a2', fecha: '2026-08-24', horas: 6, persona_id: 'pe2', tipo_hora: 'normal', improductiva: true, causa_desvio: 'LLUVIA' },
    ],
    equipos: [{ actividad_id: 'a2', equipo: 'BOBCAT S650', horas: 12 }],
    costos: [{ cotizacion_partida_id: 'p2', tipo: 'SUBCONTRATO', recurso_nombre: 'movimiento de suelos', monto: 800_000, fecha: '2026-08-25' }],
  })
  const exc = c.partidas.find((p) => p.codigo === 'T1002')
  assert.equal(exc.cantidad.valor, 20)
  assert.equal(exc.cerrada, false, 'sin 100% declarado la partida sigue abierta')
  assert.equal(exc.hhReales.valor, 96)
  assert.equal(exc.hhImproductivas.valor, 6)
  assert.equal(exc.personas.valor, 2)
  assert.equal(exc.duracion.valor, 3, 'del 22 al 24 inclusive')
  assert.equal(exc.diasTrabajados.valor, 2)
  assert.equal(exc.equipoUtilizado[0].horas, 12)
  assert.equal(exc.subcontratoReal.valor, 800_000)
  assert.equal(exc.costoReal.valor, 800_000)
  assert.equal(exc.incidencias.length, 2, 'las causas escritas por personas tienen que llegar enteras')

  const sanitaria = c.partidas.find((p) => p.codigo === 'T1059')
  assert.equal(sanitaria.hhReales.valor, null, 'una partida sin actividad enganchada no puede tener horas')
  assert.equal(sanitaria.costoReal.valor, null)
  assert.equal(c.resumen.conHHReales, 1)
  assert.equal(c.resumen.sinNingunRegistro, 2)
})

test('las horas improductivas son null si nadie marcó ninguna, no cero', () => {
  const c = consolidarEjecucion({ plan: PLAN, horas: [{ actividad_id: 'a1', fecha: '2026-08-22', horas: 8, tipo_hora: 'normal' }] })
  const rep = c.partidas.find((p) => p.codigo === 'T1001')
  assert.equal(rep.hhImproductivas.valor, null, 'sin marcas de improductividad no se puede afirmar que fueron cero')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA CUADRILLA (§E1) · el hueco que no se veía porque el dato no llegaba a la salida
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('sin cuadrilla declarada el hueco se DECLARA: una lista vacía se lee como «no hubo cuadrillas»', () => {
  // MUTACIÓN CORRIDA: `motivoCuadrilla: null` fijo →
  //   AssertionError: null !== 'ningún parte ni imputación declara la cuadrilla'
  // Medido sobre las 6 obras: cuadrilla_id está en NULL en las 251 filas de obra_ejecucion. Sin el
  // motivo, esa ausencia total es indistinguible de una obra sin cuadrillas asignadas.
  const r = consolidarEjecucion({
    plan: [{ cotizacionPartidaId: 'p1', actividadId: 'a1', codigo: 'T1', unidad: 'm2', cantidadPlan: 10 }],
    ejecuciones: [{ actividad_id: 'a1', fecha: '2026-08-22', cantidad: 4, cuadrilla_id: null }],
    horas: [{ actividad_id: 'a1', fecha: '2026-08-22', horas: 8, persona_id: 'x' }],
  })
  assert.deepEqual([...r.partidas[0].cuadrillas], [])
  assert.equal(r.partidas[0].motivoCuadrilla, 'ningún parte ni imputación declara la cuadrilla')
  assert.equal(r.resumen.conCuadrilla, 0)
})

test('con cuadrilla declarada sale identificada y sin motivo — el control PUEDE dar verde', () => {
  const r = consolidarEjecucion({
    plan: [{ cotizacionPartidaId: 'p1', actividadId: 'a1', codigo: 'T1', unidad: 'm2', cantidadPlan: 10 }],
    ejecuciones: [{ actividad_id: 'a1', fecha: '2026-08-22', cantidad: 4, cuadrilla_id: 'cuad-3' }],
    horas: [{ actividad_id: 'a1', fecha: '2026-08-22', horas: 8, trabajador_o_cuadrilla: 'cuad-3' }],
  })
  assert.deepEqual([...r.partidas[0].cuadrillas], ['cuad-3'], 'la misma cuadrilla por dos puertas es UNA cuadrilla')
  assert.equal(r.partidas[0].motivoCuadrilla, null)
  assert.equal(r.resumen.conCuadrilla, 1)
})

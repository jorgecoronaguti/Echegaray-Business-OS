// §7 · HH ≠ personas ≠ duración, y SIN_DATO ≠ 0. Los dos invariantes que hacen que un plan de obra
// sea un plan y no una división.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  distribucion, rendimientoConDistribucion, hhDePartida, LECTURA,
  CV_QUE_OBLIGA_A_MOSTRAR_EL_RANGO,
} from './rendimiento-distribucion.mjs'
import { planDeMano } from './plano/cuadrilla.mjs'

const caso = (h, obraId, estado = 'VALIDADO') => ({ hsUnitarias: h, estado, confianza: 'alta', obraId })

test('SIN_DATO ≠ 0: sin rendimiento, las HH son null y no cero', () => {
  const r = rendimientoConDistribucion([])
  assert.equal(r.lectura, LECTURA.SIN_DATO)
  assert.equal(r.hsUnitarias, null)
  const hh = hhDePartida({ cantidad: 520, unidad: 'M2', rendimiento: r })
  assert.equal(hh.hh, null, '0 HH sería una afirmación: que la tarea no lleva trabajo')
  assert.notEqual(hh.hh, 0)
  assert.ok(hh.quienLoTiene, 'un hueco sin dueño no se llena nunca')
})

test('SIN_DATO no se rellena con el rendimiento de la tarea parecida', () => {
  const r = rendimientoConDistribucion([])
  assert.equal(r.hsUnitarias, null)
  assert.match(r.porQue, /no es 0 y no es el de la tarea parecida/)
})

test('cantidad ausente no produce «0 HH» (Number(null) === 0)', () => {
  const r = rendimientoConDistribucion([caso(1.6, 'o1'), caso(1.62, 'o2')])
  for (const c of [null, undefined, '', 'nada']) {
    assert.equal(hhDePartida({ cantidad: c, rendimiento: r }).hh, null, `cantidad «${c}» no puede dar 0 HH`)
  }
})

test('HH ≠ PERSONAS ≠ DURACIÓN: hhDePartida no contesta las tres', () => {
  const r = rendimientoConDistribucion([caso(1.6, 'o1'), caso(1.62, 'o2')])
  const hh = hhDePartida({ cantidad: 1000, unidad: 'M2', rendimiento: r })
  assert.equal(hh.hh, 1610, '1000 m² × 1,61 h/m²')
  // 1.610 HH no son 1.610 horas de calendario, ni 201 jornadas, ni una cantidad de gente.
  assert.equal(hh.personas, null)
  assert.equal(hh.duracion_jornadas, null)
  assert.match(hh.comoSeObtieneLaDuracion, /planDeMano/)
})

test('la duración SÍ existe, pero sale de otro lado y con otros datos', () => {
  // Las mismas 1.610 HH dan duraciones distintas según la cuadrilla: eso es exactamente lo que
  // significa que HH ≠ duración.
  const a = planDeMano({ cantidad: 1000, oficial_h_u: 0.9, ayudante_h_u: 0.7, relacionSalarial: 1.18 })
  const b = planDeMano({ cantidad: 1000, oficial_h_u: 0.9, ayudante_h_u: 0.7, relacionSalarial: 1.18, maxIntegrantes: 2 })
  assert.notEqual(a.duracion_jornadas, b.duracion_jornadas)
  assert.equal(a.horas.total_h, b.horas.total_h, 'las HH no cambiaron: cambió cuánta gente las hace')
})

test('la distribución con n=1 NO dice dispersión 0', () => {
  const d = distribucion([1.6])
  assert.equal(d.n, 1)
  assert.equal(d.desvio, null, 'un solo caso no tiene dispersión cero: no tiene dispersión medida')
  assert.equal(d.cv, null)
  assert.notEqual(d.desvio, 0)
})

test('dos muestras con la MISMA mediana no son el mismo hecho', () => {
  const dominada = distribucion([1.55, 1.6, 1.63])
  const erratica = distribucion([0.9, 1.6, 4.2])
  assert.equal(dominada.mediana, erratica.mediana, 'la mediana las hace ver iguales')
  assert.ok(erratica.cv > dominada.cv * 3, 'la dispersión las separa')
  assert.equal(dominada.rango, 0.08)
  assert.equal(erratica.rango, 3.3)
})

test('una muestra dispersa obliga a mostrar el rango, y el rango sale de lo observado', () => {
  const r = rendimientoConDistribucion([caso(0.9, 'o1'), caso(1.6, 'o2'), caso(4.2, 'o3')])
  assert.equal(r.lectura, LECTURA.EXPERIENCIA_ECSAS)
  assert.ok(r.distribucion.cv > CV_QUE_OBLIGA_A_MOSTRAR_EL_RANGO)
  assert.equal(r.usarElRango, true)
  const hh = hhDePartida({ cantidad: 100, unidad: 'M2', rendimiento: r })
  assert.equal(hh.hhMin, 90, 'el rango de HH sale del mínimo observado, no de un ± inventado')
  assert.equal(hh.hhMax, 420)
})

test('una muestra consistente no publica rango: no hay conversación que abrir', () => {
  const r = rendimientoConDistribucion([caso(1.55, 'o1'), caso(1.6, 'o2'), caso(1.63, 'o3')])
  assert.equal(r.usarElRango, false)
  assert.equal(hhDePartida({ cantidad: 100, rendimiento: r }).hhMin, null)
})

test('CANDIDATO no desplaza a la referencia: se muestra, no se aplica', () => {
  const filas = [
    { hsUnitarias: 2.0, estado: 'REFERENCIA', confianza: 'media' },
    caso(0.5, 'o1', 'CANDIDATO'),
  ]
  const r = rendimientoConDistribucion(filas)
  assert.equal(r.lectura, LECTURA.REFERENCIA_ANALISIS)
  assert.equal(r.hsUnitarias, 2.0, 'un caso sin confirmar no cambia un precio')
  assert.equal(r.distribucion.n, 1, 'pero se ve al lado, con su cantidad de casos')
})

test('sin experiencia ni referencia pero con el análisis de la planilla: es REFERENCIA, no experiencia', () => {
  const r = rendimientoConDistribucion([], { hsAnalisis: 1.6 })
  assert.equal(r.lectura, LECTURA.REFERENCIA_ANALISIS)
  assert.notEqual(r.lectura, LECTURA.EXPERIENCIA_ECSAS)
  assert.equal(hhDePartida({ cantidad: 10, rendimiento: r }).hh, 16)
})

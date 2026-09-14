// EL RECIBO ESTIMADO CONCEPTO POR CONCEPTO, CONTRA LOS RECIBOS REALES (dueño, 14/09/2026).
//
// El fixture son los recibos de Q2-06 a Q2-08/2026 tal como los leyó el parser de los PDF del estudio,
// anonimizados (P01…). Las reglas se derivan de las cuatro quincenas ANTERIORES a Q2-08, y el estimado de
// Rosales (P22) se compara contra SU recibo Q2-08, que no entró a la derivación: un control que se valida
// contra la misma información que produce no prueba nada.
//
// LAS MUTACIONES QUE TIENEN QUE PONER ESTO ROJO:
//   1. un porcentaje equivocado (la base mal elegida, la tasa de otro código);
//   2. olvidar el feriado (50 h al 0401 en lugar de 45 + 5 al 0431);
//   3. la asistencia perfecta sin su ajuste 0426 en media jornada;
//   4. el 92 ter liquidado a una jornada completa.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import { compararConReal, estimarRecibo } from './reciboEstimado.ts'

type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras, cs]) => ({
  persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const P22 = FIXTURE.rosales
const REAL_Q2_08 = RECIBOS.find((r) => r.persona === P22 && r.periodo === 'Q2-08/2026')!
const REGLAS = reglasDelRecibo(RECIBOS, 'Q2-08/2026')
const regla = (codigo: string) => REGLAS.conceptos.find((c) => c.codigo === codigo)!

test('las reglas salen de las cuatro quincenas anteriores, nunca de la que se estima', () => {
  assert.deepEqual(REGLAS.periodos, ['Q2-06/2026', 'Q1-07/2026', 'Q2-07/2026', 'Q1-08/2026'])
  assert.equal(REGLAS.recibos, RECIBOS.filter((r) => REGLAS.periodos.includes(r.periodo)).length)
})

test('aportes: porcentaje del remunerativo o de rem + no rem, cada uno reproduce todos sus recibos', () => {
  for (const [codigo, tasa, base] of [['4010', 0.11, 'remunerativo'], ['4020', 0.03, 'remunerativo'], ['4285', 0.02, 'remunerativo'],
    ['4050', 0.0255, 'remunerativo_y_no_remunerativo'], ['4150', 0.0045, 'remunerativo_y_no_remunerativo']] as const) {
    const r = regla(codigo)
    assert.deepEqual(r.modelo, { tipo: 'porcentaje', tasa, base }, codigo)
    assert.equal(r.evidencia.aciertos, r.evidencia.recibos, codigo)
    assert.equal(r.dudosa, false, codigo)
  }
})

test('Art. 92 ter: la tasa de la obra social × $/h × (88 − horas); la jornada completa sale de ahí', () => {
  assert.deepEqual(regla('4170').modelo, { tipo: 'horas_faltantes', tasa: 0.0255, jornada: 88, masNoRemunerativo: false })
  assert.deepEqual(regla('4175').modelo, { tipo: 'horas_faltantes', tasa: 0.0045, jornada: 88, masNoRemunerativo: false })
  assert.equal(REGLAS.jornada, 88)
  // La contribución de obra social 92 ter suma la no remunerativa de julio a su base; el aporte no.
  assert.deepEqual(regla('5051').modelo, { tipo: 'horas_faltantes', tasa: 0.051, jornada: 88, masNoRemunerativo: true })
  assert.equal(regla('5051').evidencia.aciertos, regla('5051').evidencia.recibos)
})

test('seguro de vida UOCRA: monto fijo, sólo en la segunda quincena, y avisa que cambió', () => {
  const r = regla('4287')
  assert.deepEqual(r.modelo, { tipo: 'monto_fijo', monto: 17976.34, periodo: 'Q2-07/2026' })
  assert.equal(r.soloQuincena, 2)
  assert.equal(r.aplica, true)
  assert.match(r.motivo ?? '', /cambió/)
  assert.equal(reglasDelRecibo(RECIBOS, 'Q1-09/2026').conceptos.find((c) => c.codigo === '4287')?.aplica, false)
})

test('fondo de cese por persona (12 % u 8 %); contribuciones con detracción variable: dudosas, sin número', () => {
  assert.equal(regla('5485').modelo.tipo, 'porcentaje_por_persona')
  assert.equal(regla('5485').dudosa, false)
  for (const c of ['5010', '5020', '5030', '5040']) assert.equal(regla(c).dudosa, true, c)
})

test('horas y asistencia: media jornada 50 h, 5 h por feriado; 0425 = 20 % del 0401; 0426 la anula en media jornada', () => {
  assert.equal(REGLAS.horas.parcial, 50)
  assert.equal(REGLAS.horas.feriadoPorDia.parcial, 5)
  assert.equal(REGLAS.asistencia.tasa, 0.2)
  assert.equal(REGLAS.asistencia.ajuste.parcial.anula, true)
  assert.equal(REGLAS.asistencia.ajuste.completa.anula, false)
})

const ROSALES = { persona: P22, periodo: 'Q2-08/2026', valorHora: 6348, horasRecibo: null, feriados: 1, recibosPropios: RECIBOS.filter((r) => r.persona === P22) }

test('Rosales Q2-08 estimado: 45 + 5 feriado a $6.348, cada concepto igual al recibo real salvo el seguro de vida', () => {
  const e = estimarRecibo(REGLAS, ROSALES)!
  const monto = (c: string) => e.lineas.find((l) => l.codigo === c)?.monto
  assert.deepEqual([monto('0401'), monto('0425'), monto('0426'), monto('0431')], [285660, 57132, -57132, 31740])
  assert.equal(e.remunerativo, 317400)
  const real = (c: string) => REAL_Q2_08.conceptos.find((x) => x.codigo === c)?.monto
  for (const c of ['4010', '4020', '4050', '4150', '4170', '4175', '4285', '5050', '5051', '5150', '5151', '5250', '5400', '5480', '5485']) {
    assert.equal(monto(c), real(c), c)
  }
  // El seguro de vida pasó de $17.976,34 (julio) a $19.617,16 (agosto): la regla no puede saberlo.
  // TOLERANCIA DECLARADA: el neto estimado difiere del real exactamente en esa actualización, $1.640,82.
  assert.equal(monto('4287'), 17976.34)
  assert.equal(e.neto, 231880.94)
  assert.equal(Math.round((e.neto! - 230240.12) * 100) / 100, 1640.82)
  // 5010–5040 son dudosas: la contribución y el costo total quedan sin número, no inventados.
  assert.equal(monto('5010'), null)
  assert.equal(e.costoTotal, null)
})

test('mutación «olvidar el feriado»: sin feriados, las 50 h van al 0401 y el 0431 desaparece', () => {
  const e = estimarRecibo(REGLAS, { ...ROSALES, feriados: 0 })!
  assert.equal(e.lineas.find((l) => l.codigo === '0401')?.monto, 317400)
  assert.equal(e.lineas.some((l) => l.codigo === '0431'), false)
  const sinCalendario = estimarRecibo(REGLAS, { ...ROSALES, feriados: null })!
  assert.match(sinCalendario.avisos.join(' '), /calendario/)
})

test('horas del recibo escritas a mano: 40 h → 35 + 5, y el 92 ter crece con las horas que faltan', () => {
  const e = estimarRecibo(REGLAS, { ...ROSALES, horasRecibo: 40 })!
  assert.equal(e.lineas.find((l) => l.codigo === '0401')?.unidad, 35)
  assert.equal(e.lineas.find((l) => l.codigo === '4170')?.monto, Math.round(0.0255 * 6348 * 48 * 100) / 100)
})

test('jornada completa (su último recibo ≥ 88 h): sin 0426 ni 92 ter', () => {
  const completa = RECIBOS.find((r) => r.periodo === 'Q1-08/2026' && (r.horasNormales ?? 0) >= 88)!
  const e = estimarRecibo(REGLAS, { persona: completa.persona, periodo: 'Q2-08/2026', valorHora: completa.valorHora, horasRecibo: null, feriados: 0, recibosPropios: RECIBOS.filter((r) => r.persona === completa.persona) })!
  assert.equal(e.jornada, 'completa')
  assert.equal(e.lineas.some((l) => l.codigo === '0426'), false)
  assert.equal(e.lineas.some((l) => l.codigo === '4170'), false)
  assert.equal(e.lineas.find((l) => l.codigo === '0425')?.monto, Math.round(0.2 * completa.horasNormales! * completa.valorHora! * 100) / 100)
})

test('real contra estimado: la única diferencia de Rosales Q2-08 es el seguro de vida', () => {
  const filas = compararConReal(estimarRecibo(REGLAS, ROSALES), REAL_Q2_08.conceptos)
  const conDiferencia = filas.filter((f) => f.diferencia != null && f.diferencia !== 0)
  assert.deepEqual(conDiferencia.map((f) => [f.codigo, f.diferencia]), [['4287', 1640.82]])
  // Las dudosas se ven con el real y sin estimado, no desaparecen.
  assert.deepEqual(filas.filter((f) => f.estimado == null).map((f) => f.codigo), ['5010', '5020', '5030', '5040'])
})

test('92 ter con ventana Q1-07 a Q2-08: la tasa madre de un aporte es un aporte (2,55 % × (88 − h)), no la contribución (5,1 % × (69 − h))', () => {
  const r = reglasDelRecibo(RECIBOS, 'Q1-09/2026')
  const c = (codigo: string) => r.conceptos.find((x) => x.codigo === codigo)!.modelo
  assert.deepEqual(c('4170'), { tipo: 'horas_faltantes', tasa: 0.0255, jornada: 88, masNoRemunerativo: false })
  assert.deepEqual(c('4175'), { tipo: 'horas_faltantes', tasa: 0.0045, jornada: 88, masNoRemunerativo: false })
  assert.equal(r.jornada, 88)
})

test('un embargo en su último recibo no se descuenta (no es regla del recibo) pero se avisa', () => {
  const conEmbargo = RECIBOS.find((r) => r.periodo === 'Q2-08/2026' && r.conceptos.some((c) => c.codigo === '4090'))!
  const reglasQ1_09 = reglasDelRecibo(RECIBOS, 'Q1-09/2026')
  const e = estimarRecibo(reglasQ1_09, { persona: conEmbargo.persona, periodo: 'Q1-09/2026', valorHora: conEmbargo.valorHora, horasRecibo: null, feriados: 0, recibosPropios: RECIBOS.filter((r) => r.persona === conEmbargo.persona) })!
  assert.equal(e.lineas.some((l) => l.codigo === '4090'), false)
  assert.match(e.avisos.join(' '), /4090 EMBARGO JUDICIAL/)
  // Rosales no tiene embargo: ningún aviso de descuentos propios.
  const r = estimarRecibo(reglasQ1_09, { ...ROSALES, periodo: 'Q1-09/2026', feriados: 0 })!
  assert.equal(r.avisos.some((a) => /no lo descuenta/.test(a)), false)
})

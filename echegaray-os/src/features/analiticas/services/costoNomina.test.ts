// EL COSTO DE LA SOLAPA NÓMINA ES EL DE OBRAS: mismas filas, misma función, misma suma.
//
// Todo entra como fixture (filas con la forma de `costo_mo_quincena`): un test que leyera la base
// cambiaría de color cuando se cierra una quincena, y eso no es un defecto del código.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { costoPorMes, leerCostoNomina, nominaConCosto, type QuincenaDeCosto } from './costoNomina.ts'
import { filasDeCosto, lineasDeCostoObra } from '../../administracion/services/costoObraQuincena.ts'
import type { MesPagado } from './nominaPagada.ts'

const fila = (obra: string | null, persona: string, total: number, estado: string, destino = 'obra') => ({
  obra_canonica_id: obra, persona_id: persona, horas: 80, costo_blanco: total * 0.6, costo_negro: total * 0.4,
  costo_total: total, estado, origen: 'x', destino, sellado_en: null, reabierta: false,
})
const crudo = (desde: string): unknown[] => [
  fila('OB1', 'p1', 1000, desde < '2026-07' ? 'estimado' : 'real'),
  fila('OB2', 'p2', 500, desde < '2026-07' ? 'estimado' : 'real'),
  fila(null, 'p3', 250, desde < '2026-07' ? 'estimado' : 'real', 'ES-ADM'),
  fila('OB1', 'p4', 9999, 'falta_dato'),
]
const q = (desde: string): QuincenaDeCosto => ({ desde, filas: filasDeCosto(crudo(desde)) })
const HOY = '2026-10-02'
const QUINCENAS = ['2026-06-01', '2026-06-16', '2026-07-01', '2026-07-16', '2026-10-01'].map(q)

test('la suma de cada mes es la de Obras sobre las mismas quincenas (incluida Estructura)', () => {
  const meses = costoPorMes(QUINCENAS, HOY)
  const deObras = (desdes: string[]) => desdes
    .flatMap((d) => lineasDeCostoObra(filasDeCosto(crudo(d)), new Map(), new Map(), new Map()))
    .reduce((s, l) => s + (l.costo ?? 0), 0)
  assert.equal(meses.find((m) => m.mes === '2026-07')!.costo, deObras(['2026-07-01', '2026-07-16']))
  assert.equal(meses.find((m) => m.mes === '2026-06')!.costo, deObras(['2026-06-01', '2026-06-16']))
  assert.equal(meses.find((m) => m.mes === '2026-07')!.costo, 3500)
})

test('real, estimado y parcial: cada mes dice con qué se midió y una persona sin tarifa no suma', () => {
  const [jun, jul, oct] = costoPorMes(QUINCENAS, HOY)
  assert.equal(jun.etiqueta, 'estimado')
  assert.equal(jul.etiqueta, 'real')
  assert.equal(jun.parcial, false)
  assert.equal(oct.parcial, true, 'octubre: el mes corriente y con una sola quincena')
  assert.equal(jul.sinDato, 2)
  assert.equal(jul.costo, 3500, 'los 9.999 sin tarifa no entran ni como parcial')
})

test('un mes con parte estimada no se presenta como real', () => {
  const mixto: QuincenaDeCosto[] = [
    { desde: '2026-08-01', filas: filasDeCosto([fila('OB1', 'p1', 100, 'real')]) },
    { desde: '2026-08-16', filas: filasDeCosto([fila('OB1', 'p1', 100, 'estimado')]) },
  ]
  const [ago] = costoPorMes(mixto, HOY)
  assert.equal(ago.etiqueta, 'en parte estimado')
  assert.equal(ago.estimado, 100)
})

test('una quincena que no se pudo leer deja el mes sin medir, no a medias', () => {
  const [m] = costoPorMes([q('2026-07-01'), { desde: '2026-07-16', filas: null }], HOY)
  assert.equal(m.costo, null)
  assert.equal(m.etiqueta, null)
})

const pagado = (mes: string, total: number, medida: MesPagado['medida']): MesPagado => ({
  mes, blanco: total * 0.4, negro: total * 0.6, total, estado: 'cerrado', quincenasCerradas: 2, quincenasAbiertas: 0,
  sinRecibo: { n: 0, importe: 0 }, sinLinea: { n: 0, importe: 0 }, reciboMayor: { n: 0, importe: 0 },
  medida, personas: 3, sinPagoRegistrado: 0,
})

test('la diferencia cierra costo = pagado + cargas sólo donde ambos son comparables', () => {
  const costos = costoPorMes(QUINCENAS, HOY)
  const n = nominaConCosto(costos, [
    pagado('2026-06', 2000, 'quincena_cerrada'), pagado('2026-07', 2500, 'quincena_cerrada'), pagado('2026-10', 100, 'registro_por_canal'),
  ])
  const jul = n.lineas.find((l) => l.mes === '2026-07')!
  assert.equal(jul.diferencia, 1000)
  assert.equal(jul.costo!.costo! - jul.pagado!.total!, jul.diferencia)
  assert.equal(n.lineas.find((l) => l.mes === '2026-10')!.diferencia, null, 'un pagado por canal no se resta')
  assert.deepEqual(n.diferenciaAnio, { total: 2500, meses: 2 })
  assert.equal(n.costoAnio!.meses, 2, 'el mes parcial no suma al año')
  assert.equal(n.costoAnio!.total, 7000)
})

test('lee con la MISMA función que Obras, una llamada por quincena, sin repetir', async () => {
  const llamadas: { fn: string; args: unknown }[] = []
  const fake = { rpc: async (fn: string, args: unknown) => { llamadas.push({ fn, args }); return { data: crudo('2026-07-01'), error: null } } }
  const r = await leerCostoNomina(fake as unknown as SupabaseClient, ['2026-07-16', '2026-07-01', '2026-07-01', '2026-08-01', '2026-08-16', '2026-09-01'])
  assert.equal(llamadas.length, 5)
  assert.ok(llamadas.every((c) => c.fn === 'costo_mo_quincena'))
  assert.deepEqual(r.map((x) => x.desde), ['2026-07-01', '2026-07-16', '2026-08-01', '2026-08-16', '2026-09-01'])
})

test('si la función falla, la quincena queda `null` y no vacía', async () => {
  const fake = { rpc: async () => ({ data: null, error: { code: '42883', message: 'no existe' } }) }
  const [x] = await leerCostoNomina(fake as unknown as SupabaseClient, ['2026-07-01'])
  assert.equal(x.filas, null)
})

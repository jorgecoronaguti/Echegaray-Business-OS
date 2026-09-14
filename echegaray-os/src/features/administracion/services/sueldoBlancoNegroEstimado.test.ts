// EL BLANCO CON EL RECIBO ESTIMADO POR CONCEPTOS: SU NETO ES EL BANCO PRELIMINAR (dueño, 14/09/2026).
//
// Textual: *«si me das a dar un valor preliminar a pagar por banco antes de tener el recibo … liquidacion estimada
// concepto por concepto»*. Precedencia del neto: manual > recibo real > nómina > estimado por conceptos > mediana.
//
// LAS MUTACIONES QUE TIENEN QUE PONER ESTO ROJO:
//   1. el neto sigue saliendo de la mediana aunque haya estimado por conceptos;
//   2. el estimado le gana al Banco escrito a mano;
//   3. las horas del recibo escritas no rehacen el estimado;
//   4. con recibo real, el panel se queda sin los totales o conceptos reales, o sin el estimado para compararlos;
//   5. un descuento dudoso se estima igual (un neto con un agujero).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import { compararConReal, estimarRecibo } from './reciboEstimado.ts'
import { entradaDeBlanco, sueldoBlancoNegro, type BaseDelEstimado, type EntradaDeSueldo, type ReciboDeSueldo } from './sueldoBlancoNegro.ts'
import { baseDelEstimado, esDiaHabil } from './reciboEstimadoService.ts'

type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const CUIL_ROSALES = '20358508783'
// Rosales vuelve a tener su CUIL: la entrada del blanco empareja por CUIL normalizado.
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([alias, periodo, valorHora, horasNormales, horasFeriado, horasOtras, cs]) => ({
  persona: alias === FIXTURE.rosales ? CUIL_ROSALES : alias, periodo, valorHora, horasNormales, horasFeriado, horasOtras,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const BASE: BaseDelEstimado = { periodo: 'Q2-08/2026', reglas: reglasDelRecibo(RECIBOS, 'Q2-08/2026'), feriados: 1, recibos: RECIBOS }
const RECIBO_REAL: ReciboDeSueldo = {
  personaId: 'rosales', cuil: CUIL_ROSALES, periodo: 'Q2-08/2026', categoria: 'Oficial',
  valorHora: 6348, horasBlanco: 50, bruto: 317400, descuentos: 87159.88, neto: 230240.12, driveFileId: 'pdf-q2-08',
}

const entrada = (e: Partial<EntradaDeSueldo> = {}): EntradaDeSueldo => ({
  recibo: null, netoDeNomina: null, pisoCategoria: 6348,
  proporcion: { cociente: 0.73, origen: 'persona', recibos: 6 },
  estimacion: { base: BASE, persona: CUIL_ROSALES },
  horas: 100, valorHoraNegro: 5000, ...e,
})

test('sin recibo: el Banco preliminar es el neto del recibo estimado, no bruto × mediana', () => {
  const s = sueldoBlancoNegro(entrada())
  assert.equal(s.estado, 'estimado')
  assert.equal(s.origenNeto, 'conceptos')
  assert.equal(s.horasBlanco, 50)
  assert.equal(s.bruto, 317400)
  assert.equal(s.neto, 231880.94)
  assert.notEqual(s.neto, Math.round(317400 * 0.73 * 100) / 100)
  assert.equal(s.negro, 50 * 5000)
  assert.ok((s.reciboEstimado?.lineas.length ?? 0) > 10)
})

test('el Banco escrito a mano gana al estimado', () => {
  const s = sueldoBlancoNegro(entrada({ manual: { neto: 200000 } }))
  assert.equal(s.origenNeto, 'manual')
  assert.equal(s.neto, 200000)
})

test('horas del recibo escritas a mano: el estimado se rehace y su neto sigue siendo el Banco', () => {
  const s = sueldoBlancoNegro(entrada({ manual: { horasRecibo: 40 } }))
  const esperado = estimarRecibo(BASE.reglas, { persona: CUIL_ROSALES, periodo: 'Q2-08/2026', valorHora: 6348, horasRecibo: 40, feriados: 1, recibosPropios: RECIBOS.filter((r) => r.persona === CUIL_ROSALES) })!
  assert.equal(s.horasBlanco, 40)
  assert.equal(s.origenNeto, 'conceptos')
  assert.equal(s.neto, esperado.neto)
  assert.equal(s.netoNoRecalculado, false)
  assert.equal(s.reciboEstimado?.horasNormales, 35)
})

test('con recibo real manda el real, y viajan sus totales, sus conceptos y el estimado para compararlos', () => {
  const s = sueldoBlancoNegro(entrada({ recibo: RECIBO_REAL }))
  assert.equal(s.estado, 'recibo')
  assert.equal(s.neto, 230240.12)
  assert.deepEqual(s.totalesReales, { haberes: 317400, descuentos: 87159.88, neto: 230240.12 })
  assert.ok((s.conceptosReales?.length ?? 0) > 0)
  assert.equal(s.reciboEstimado?.neto, 231880.94)
  const dif = compararConReal(s.reciboEstimado ?? null, s.conceptosReales ?? null).filter((f) => f.diferencia)
  assert.deepEqual(dif.map((f) => f.codigo), ['4287'])
})

test('un descuento que aplica con regla dudosa: el estimado no tiene neto y vuelve la mediana', () => {
  const reglas = { ...BASE.reglas, conceptos: BASE.reglas.conceptos.map((c) => (c.codigo === '4010' ? { ...c, dudosa: true, motivo: 'prueba' } : c)) }
  const s = sueldoBlancoNegro(entrada({ estimacion: { base: { ...BASE, reglas }, persona: CUIL_ROSALES } }))
  assert.equal(s.reciboEstimado?.neto, null)
  assert.equal(s.origenNeto, 'estimado')
  assert.equal(s.neto, Math.round(317400 * 0.73 * 100) / 100)
})

test('entradaDeBlanco: con base, la persona del estimado es el CUIL normalizado; sin base, sin estimación', () => {
  const con = entradaDeBlanco({ personaId: 'rosales', cuil: '20-35850878-3', periodo: 'Q2-08/2026', recibos: [], pisoCategoria: 6348, netoDeNomina: null, base: BASE })
  assert.equal(con.estimacion?.persona, CUIL_ROSALES)
  const sin = entradaDeBlanco({ personaId: 'rosales', cuil: '20-35850878-3', periodo: 'Q2-08/2026', recibos: [], pisoCategoria: 6348, netoDeNomina: null })
  assert.equal(sin.estimacion, null)
})

test('baseDelEstimado: el período es el que se estima; las horas «otras» son las que sobran', () => {
  const b = baseDelEstimado('Q1-09/2026', BASE.reglas, [{ ...RECIBO_REAL, id: 'r1', horasNormales: 0, horasFeriado: 5 }], null)
  assert.equal(b.periodo, 'Q1-09/2026')
  assert.equal(b.recibos[0].horasOtras, 45)
  assert.deepEqual(b.recibos[0].conceptos, [])
  assert.equal(b.feriados, null)
  assert.equal(esDiaHabil('2026-08-17'), true)
  assert.equal(esDiaHabil('2026-08-16'), false)
})

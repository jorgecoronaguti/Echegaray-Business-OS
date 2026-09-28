// EL RECIBO EN FORMATO CONTADOR: sólo blanco, los números del panel, y el real cuando existe.
//
// Lo que se cuida (dueño, 28/09/2026: «un recibo con todo lo blanco como si fuese el recibo que envía el
// contador»): que ningún importe del negro llegue al papel, que el neto cierre como cierra el recibo del
// estudio, que sea el MISMO número que el bloque BLANCO del panel, y que el estimado nunca se imprima
// cuando el recibo real de la quincena ya está.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reglasDelRecibo, type ConceptoDeRecibo, type ReciboParaReglas, type SeccionDelConcepto } from './reglasDelRecibo.ts'
import { compararConReal, estimarRecibo, type ReciboEstimado } from './reciboEstimado.ts'
import { esReciboContador, periodoDePago, reciboFormatoContador, type ReciboContador } from './reciboFormatoContador.ts'
import { importeEnLetras } from './importeEnLetras.ts'
import type { SueldoBlancoNegro } from './sueldoBlancoNegro.ts'

type Tupla = [string, string, number, number, number, number, [string, string, number | null, number | null, number][]]
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/recibos-2026-q2-06-a-q2-08.json', import.meta.url), 'utf8')) as
  { rosales: string; catalogo: Record<string, string>; recibos: Tupla[] }
const SECCION: Record<string, SeccionDelConcepto> = { R: 'remunerativo', N: 'no_remunerativo', D: 'descuento', C: 'contribucion' }
const RECIBOS: ReciboParaReglas[] = FIXTURE.recibos.map(([persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras, cs]) => ({
  persona, periodo, valorHora, horasNormales, horasFeriado, horasOtras,
  conceptos: cs.map(([codigo, s, unidad, base, monto]): ConceptoDeRecibo => ({ codigo, descripcion: FIXTURE.catalogo[codigo], seccion: SECCION[s], unidad, base, monto })),
}))
const P22 = FIXTURE.rosales
const REAL = RECIBOS.find((r) => r.persona === P22 && r.periodo === 'Q2-08/2026')!
const REGLAS = reglasDelRecibo(RECIBOS, 'Q2-08/2026')
const EST = estimarRecibo(REGLAS, { persona: P22, periodo: 'Q2-08/2026', valorHora: 6348, horasRecibo: null, feriados: 1, recibosPropios: RECIBOS.filter((r) => r.persona === P22) })!

// EL NEGRO Y LOS PAGOS CON IMPORTES QUE NO SE PARECEN A NINGÚN CONCEPTO: si alguno aparece en el papel, entró.
const NEGRO = 987654.32
const sueldo = (o: Partial<SueldoBlancoNegro>): SueldoBlancoNegro => ({
  estado: 'estimado', horas: 90, horasBlanco: 50, valorHoraCategoria: 6348, pisoCategoria: 6348, categoriaRecibo: 'OFICIAL',
  periodoRecibo: 'Q1-08/2026', bruto: EST.remunerativo, neto: EST.neto, origenNeto: 'conceptos', netoNoRecalculado: false,
  editado: { horasRecibo: false, valorHoraRecibo: false, neto: false }, proporcion: null, reciboEstimado: EST,
  conceptosReales: null, totalesReales: null, horasNegro: 40, recargoExtras: 3, valorHoraNegro: 11111.11, negro: NEGRO,
  total: 1234567.89, reciboExcedeHoras: false, driveFileId: null, ...o,
})
const armar = (s: SueldoBlancoNegro): ReciboContador => {
  const r = reciboFormatoContador(s)
  assert.ok(esReciboContador(r), 'debería haber recibo')
  return r
}
const renglones = (r: ReciboContador) => [...r.remunerativo, ...r.noRemunerativo, ...r.descuentos, ...r.contribuciones]
const importes = (r: ReciboContador): number[] => [
  ...renglones(r).flatMap((x) => [x.monto, x.base, x.unidad]),
  r.totalRemunerativo, r.totalNoRemunerativo, r.totalDescuentos, r.sueldoBruto, r.neto, r.contribucionesEmpleador, r.costoTotalEmpleador, r.valorHora,
].filter((n): n is number => n != null)

test('ningún importe del negro ni de lo pagado entra al recibo en blanco', () => {
  for (const s of [sueldo({}), sueldo({ estado: 'recibo', conceptosReales: REAL.conceptos, totalesReales: null })]) {
    const r = armar(s)
    for (const prohibido of [NEGRO, 1234567.89, 11111.11, 40, 3]) {
      assert.ok(!importes(r).includes(prohibido), `${r.origen}: ${prohibido} es del negro`)
    }
  }
})

test('estimado: los mismos renglones y el mismo neto que el bloque BLANCO del panel', () => {
  const r = armar(sueldo({}))
  assert.equal(r.origen, 'estimado')
  // EL PANEL LEE `compararConReal(est, null)` Y SU «Neto estimado · Banco» ES `est.neto`: el papel, lo mismo.
  const panel = compararConReal(EST, null).filter((f) => f.seccion !== 'contribucion')
  const papel = [...r.remunerativo, ...r.noRemunerativo, ...r.descuentos]
  assert.deepEqual(papel.map((x) => [x.codigo, x.monto]).sort(), panel.map((f) => [f.codigo, f.estimado]).sort())
  assert.equal(r.neto, EST.neto)
  assert.equal(r.totalRemunerativo, EST.remunerativo)
  assert.equal(r.totalDescuentos, EST.descuentos)
})

test('neto = remunerativo + no remunerativo − descuentos, en el estimado y en el real', () => {
  for (const s of [sueldo({}), sueldo({ estado: 'recibo', conceptosReales: REAL.conceptos })]) {
    const r = armar(s)
    assert.equal(r.cuadra, true, r.origen)
    assert.equal(Math.round((r.totalRemunerativo! + r.totalNoRemunerativo! - r.totalDescuentos!) * 100) / 100, r.neto, r.origen)
  }
})

test('con recibo real concepto por concepto se imprime el real, no el estimado', () => {
  const r = armar(sueldo({ estado: 'recibo', conceptosReales: REAL.conceptos, driveFileId: 'abc' }))
  assert.equal(r.origen, 'recibo')
  const suma = (s: SeccionDelConcepto) => REAL.conceptos.filter((c) => c.seccion === s).reduce((a, c) => a + c.monto, 0)
  assert.equal(r.neto, Math.round((suma('remunerativo') + suma('no_remunerativo') - suma('descuento')) * 100) / 100)
  assert.equal(r.contribuciones.length, REAL.conceptos.filter((c) => c.seccion === 'contribucion').length, 'el oficial trae las contribuciones')
  assert.equal(r.driveFileId, 'abc')
})

test('recibo real sin detalle: no se cae al estimado, manda al PDF', () => {
  const r = reciboFormatoContador(sueldo({ estado: 'recibo', conceptosReales: null, totalesReales: { haberes: 1, descuentos: 1, neto: 1 }, driveFileId: 'pdf' }))
  assert.equal(esReciboContador(r), false)
  assert.equal(r.driveFileId, 'pdf')
})

test('una regla dudosa deja el neto sin número y el papel no cuadra: no se imprime', () => {
  const dudoso: ReciboEstimado = { ...EST, lineas: EST.lineas.map((l) => (l.codigo === '4287' ? { ...l, monto: null } : l)), descuentos: null, neto: null }
  const r = armar(sueldo({ reciboEstimado: dudoso }))
  assert.equal(r.cuadra, false)
  assert.ok(r.avisos.some((a) => /sin número/.test(a)))
})

test('un Banco del panel distinto del neto del recibo se avisa en pantalla, sin pisar el recibo', () => {
  const r = armar(sueldo({ neto: 100000, origenNeto: 'manual' }))
  assert.equal(r.neto, EST.neto)
  assert.ok(r.avisos.some((a) => /Banco del panel/.test(a) && /manual/.test(a)))
})

test('los conceptos reales que no dan el neto del pie del recibo se avisan', () => {
  const r = armar(sueldo({ estado: 'recibo', conceptosReales: REAL.conceptos, totalesReales: { haberes: null, descuentos: null, neto: 1 } }))
  assert.ok(r.avisos.some((a) => /pie del recibo/.test(a)))
})

test('estimado sin contribuciones con número: no imprime un costo total empleador', () => {
  const r = armar(sueldo({}))
  if (EST.contribuciones == null) {
    assert.equal(r.contribuciones.length, 0)
    assert.equal(r.costoTotalEmpleador, null)
  } else assert.equal(r.costoTotalEmpleador, EST.costoTotal)
})

test('sin sueldo o sin estimado: dice por qué, nunca un recibo vacío', () => {
  assert.equal(esReciboContador(reciboFormatoContador(null)), false)
  assert.equal(esReciboContador(reciboFormatoContador(sueldo({ reciboEstimado: null }))), false)
})

// EL 0425 EN EL PAPEL (auditor, 28/09/2026): los recibos reales pagan 0425 = 20 % exacto del 0401. En jornada
// completa va solo; en media jornada el 0426 lo anula. El papel tiene que decir lo mismo que el estudio, venga
// del estimado o del real.
const P14 = 'P14'
const REAL_P14 = RECIBOS.find((r) => r.persona === P14 && r.periodo === 'Q2-08/2026')!
const monto = (r: ReciboContador, codigo: string) => r.remunerativo.find((x) => x.codigo === codigo)?.monto

test('jornada completa (P14 Q2-08, recibo real 88 + 8 h): 0425 = 0,20 × 0401 y sin 0426, igual que el estudio', () => {
  assert.equal(REAL_P14.conceptos.some((c) => c.codigo === '0426'), false, 'el recibo real no trae 0426')
  // Las horas del recibo, escritas como las cargaría quien liquida (88 + 8 de feriado): lo que se prueba es la regla, no las horas.
  const estP14 = estimarRecibo(REGLAS, { persona: P14, periodo: 'Q2-08/2026', valorHora: 7420, horasRecibo: 96, feriados: 1, recibosPropios: RECIBOS.filter((r) => r.persona === P14) })!
  const estimado = armar(sueldo({ reciboEstimado: estP14, neto: estP14.neto }))
  const real = armar(sueldo({ estado: 'recibo', conceptosReales: REAL_P14.conceptos, neto: null }))
  for (const r of [estimado, real]) {
    assert.equal(monto(r, '0425'), Math.round(0.2 * monto(r, '0401')! * 100) / 100, r.origen)
    assert.equal(monto(r, '0426'), undefined, `${r.origen}: en jornada completa no hay 0426`)
  }
  assert.equal(monto(estimado, '0425'), monto(real, '0425'), 'el estimado reproduce el 0425 del recibo real')
})

test('media jornada (Rosales Q2-08, recibo real 45 + 5 h): el 0426 anula al 0425, igual que el estudio', () => {
  const real = armar(sueldo({ estado: 'recibo', conceptosReales: REAL.conceptos, neto: null }))
  const estimado = armar(sueldo({}))
  for (const r of [estimado, real]) {
    assert.equal(monto(r, '0425'), Math.round(0.2 * monto(r, '0401')! * 100) / 100, r.origen)
    assert.equal(monto(r, '0426'), -monto(r, '0425')!, `${r.origen}: el 0426 lo anula`)
  }
})

test('el importe en letras, como el recibo del estudio Q2-08/2026', () => {
  assert.equal(importeEnLetras(230240.12), 'Son Pesos Doscientos Treinta Mil Doscientos Cuarenta Con 12/100')
  assert.equal(importeEnLetras(1000), 'Son Pesos Mil Con 00/100')
  assert.equal(importeEnLetras(21100.5), 'Son Pesos Veintiún Mil Cien Con 50/100')
  assert.equal(importeEnLetras(1001001), 'Son Pesos Un Millón Mil Uno Con 00/100')
  assert.equal(importeEnLetras(35), 'Son Pesos Treinta y Cinco Con 00/100')
  assert.equal(importeEnLetras(-1), null)
})

test('el período de pago como lo escribe el recibo', () => {
  assert.equal(periodoDePago('2026-08-16').texto, 'SEGUNDA QUINCENA 08/2026')
  assert.equal(periodoDePago('2026-09-01').q, 1)
})

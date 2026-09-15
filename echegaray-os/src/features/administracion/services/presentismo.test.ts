import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cobraConPresentismo, fechasCortas, importeDePresentismo, presentismoDeLinea, totalesDePresentismo,
  PRESENTISMO_DESDE, type EntradaDePresentismo,
} from './presentismo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN (cada uno pone en rojo una mutación de la regla):
//
//  1. Que el porcentaje deje de ser 20 % o que las horas no se dividan por 2 (el ejemplo aprobado
//     por el dueño: Agüero, 105 h, oficial → $66.654 exactos).
//  2. Que el básico no sea el de SU categoría (un ayudante con el básico del oficial).
//  3. Que haga falta más de una marca para perderlo, o que «salió antes» no cuente igual que
//     «llegó tarde».
//  4. Que rija antes de la quincena 16–30/09/2026, o sobre jefes, mensuales o un cuadro cerrado.
//  5. Que sin categoría se invente un importe en vez de decir «sin categoría».
//  6. Que el descuento no salga del cobra, o que salga cuando no se perdió (plata nueva).

const AGUERO: EntradaDePresentismo = {
  categoria: 'oficial', basico: 6348, tardanzas: [], quincenaDesde: '2026-09-16',
  modalidad: 'hora', esJefe: false, cerrada: false,
}

test('el ejemplo aprobado: 20 % × (105 ÷ 2) × 6.348 = 66.654 y cobra lo mismo que hoy sin marcas', () => {
  const p = presentismoDeLinea(AGUERO, 105)
  assert.equal(p.estado, 'aplica')
  assert.equal(p.importe, 66654)
  assert.equal(cobraConPresentismo(627000, p), 627000)
})

test('el 20 % y el ÷ 2 son los del convenio: 100 h × 6.348 no da 126.960 ni 253.920', () => {
  assert.equal(importeDePresentismo(100, 6348), 63480)
  assert.notEqual(importeDePresentismo(100, 6348), 126960)
})

test('con UNA marca pierde el presentismo entero: 627.000 − 66.654 = 560.346', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }, 105)
  assert.equal(p.estado, 'perdido')
  assert.deepEqual(p.perdido, ['2026-09-17'])
  assert.equal(cobraConPresentismo(627000, p), 560346)
})

test('salir antes cuenta igual que llegar tarde, y dos marcas no descuentan dos veces', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [
    { fecha: '2026-09-23', llegoTarde: false, salioAntes: true },
    { fecha: '2026-09-17', llegoTarde: true, salioAntes: true },
  ] }, 105)
  assert.equal(p.estado, 'perdido')
  assert.deepEqual(p.perdido, ['2026-09-17', '2026-09-23'])
  assert.equal(cobraConPresentismo(627000, p), 560346)
  assert.equal(fechasCortas(p.perdido), '17/09, 23/09')
})

test('una marca en falso no es una marca', () => {
  const p = presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: false, salioAntes: false }] }, 105)
  assert.equal(p.estado, 'aplica')
})

test('el básico es el de SU categoría: el ayudante no cobra el presentismo del oficial', () => {
  const ayudante = presentismoDeLinea({ ...AGUERO, categoria: 'ayudante', basico: 5399 }, 105)
  assert.equal(ayudante.importe, 56689.5)
  assert.notEqual(ayudante.importe, 66654)
})

test('no rige antes de la quincena 16–30/09/2026: la 01–15/09 no descuenta aunque tenga marcas', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-03', llegoTarde: true, salioAntes: false }] }
  const p = presentismoDeLinea({ ...marcada, quincenaDesde: '2026-09-01' }, 105)
  assert.equal(p.estado, 'no_rige')
  assert.equal(p.importe, null)
  assert.equal(cobraConPresentismo(627000, p), 627000)
  assert.equal(PRESENTISMO_DESDE, '2026-09-16')
  assert.equal(presentismoDeLinea({ ...marcada, quincenaDesde: '2026-10-01' }, 105).estado, 'perdido')
})

test('los jefes y quien cobra por mes quedan afuera; un cuadro cerrado también (lo sellado no se toca)', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }
  assert.equal(presentismoDeLinea({ ...marcada, esJefe: true }, 105).estado, 'no_rige')
  assert.equal(presentismoDeLinea({ ...marcada, modalidad: 'mensual' }, 105).estado, 'no_rige')
  const cerrada = presentismoDeLinea({ ...marcada, cerrada: true }, 105)
  assert.equal(cerrada.estado, 'no_rige')
  assert.equal(cobraConPresentismo(627000, cerrada), 627000)
})

test('sin categoría o sin básico: «sin categoría», importe null, y el cobra no cambia aunque haya marca', () => {
  const marcada = { ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }
  const sinCat = presentismoDeLinea({ ...marcada, categoria: null }, 105)
  assert.equal(sinCat.estado, 'sin_categoria')
  assert.equal(sinCat.importe, null)
  assert.equal(cobraConPresentismo(627000, sinCat), 627000)
  assert.equal(presentismoDeLinea({ ...marcada, basico: null }, 105).estado, 'sin_categoria')
  assert.equal(presentismoDeLinea({ ...marcada, basico: 0 }, 105).estado, 'sin_categoria')
})

test('sin horas no hay importe (null, nunca 0) y el cobra no se toca', () => {
  const p = presentismoDeLinea(AGUERO, null)
  assert.equal(p.estado, 'sin_horas')
  assert.equal(p.importe, null)
  assert.equal(cobraConPresentismo(null, p), null)
})

test('el pie: en juego suma a todos los que lo tienen; perdido sólo a quienes lo perdieron', () => {
  const t = totalesDePresentismo([
    { presentismo: presentismoDeLinea(AGUERO, 105) },
    { presentismo: presentismoDeLinea({ ...AGUERO, tardanzas: [{ fecha: '2026-09-17', llegoTarde: true, salioAntes: false }] }, 100) },
    { presentismo: presentismoDeLinea({ ...AGUERO, categoria: null }, 100) },
    { presentismo: null },
  ])
  assert.equal(t.enJuego, 66654 + 63480)
  assert.equal(t.perdido, 63480)
  assert.equal(t.perdidos, 1)
  assert.equal(t.sinCategoria, 1)
})

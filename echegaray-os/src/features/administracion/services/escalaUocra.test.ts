import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escalaVigente, mesDeVigencia } from './escalaUocra.ts'

const fila = (vigencia: string, categoria: string, basico: number | null, mensual: number | null = null, cargado = '2026-07-31T18:58:00Z') =>
  ({ categoria, basico_hora: basico, mensual, vigencia_desde: `${vigencia}T03:00:00.000Z`, cct: '76/75', fuente: `Acuerdo · ${vigencia}`, cargado_en: cargado })

const BASE = [
  fila('2026-07-01', 'Ayudante', 4948), fila('2026-07-01', 'Oficial', 5817),
  fila('2026-08-01', 'Ayudante', 5399), fila('2026-08-01', 'Medio Oficial', 5866), fila('2026-08-01', 'Oficial', 6348),
  fila('2026-08-01', 'Oficial Especializado', 7420), fila('2026-08-01', 'Sereno (mensual)', null, 980858, '2026-08-02T10:00:00Z'),
  fila('2026-10-01', 'Oficial', 9999),
]

test('RIGE LA VIGENCIA MÁS NUEVA QUE NO SEA FUTURA, EN EL ORDEN DE LAS CATEGORÍAS', () => {
  const e = escalaVigente(BASE, '2026-09-16')!
  assert.equal(e.desde, '2026-08-01')
  assert.equal(e.rige, 'ago 2026')
  assert.deepEqual(e.valores.map((v) => [v.corto, v.valor, v.porMes]), [
    ['Ayud.', 5399, false], ['½ Of.', 5866, false], ['Of.', 6348, false], ['Of. Esp.', 7420, false], ['Sereno', 980858, true],
  ])
  assert.equal(e.cargadoEn, '2026-08-02T10:00:00Z', 'la fila más nueva de esa vigencia')
  assert.equal(e.cct, '76/75')
})

test('UN ACUERDO FUTURO NO SE MUESTRA HASTA SU MES; ANTES DE AGOSTO RIGE JULIO', () => {
  assert.equal(escalaVigente(BASE, '2026-10-01')!.valores.find((v) => v.corto === 'Of.')!.valor, 9999)
  assert.equal(escalaVigente(BASE, '2026-07-20')!.rige, 'jul 2026')
})

test('SIN FILAS O SIN CATEGORÍAS CONOCIDAS, NULL: LA TIRA LO DICE, NO INVENTA', () => {
  assert.equal(escalaVigente([], '2026-09-16'), null)
  assert.equal(escalaVigente([fila('2026-08-01', 'Capataz', 1)], '2026-09-16'), null)
})

test('EL MES SE LEE EN CASTELLANO CORTO', () => {
  assert.equal(mesDeVigencia('2026-01-01'), 'ene 2026')
  assert.equal(mesDeVigencia('2026-12-01T03:00:00Z'), 'dic 2026')
})

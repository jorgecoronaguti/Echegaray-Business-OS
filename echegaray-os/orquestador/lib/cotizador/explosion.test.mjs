// LA EXPLOSIÓN RECONCILIA CONTRA EL COSTO DIRECTO, O DICE POR CUÁNTO NO.
//
// El control tiene que poder dar ROJO: si la tolerancia fuera generosa, «cuadra» sería una
// constante que siempre dice que sí, que es el defecto que este repo ya midió en otro control.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { explotarRecursos, reconciliar, requerimientosParaCompras, TOLERANCIA_RECONCILIACION } from './explosion.mjs'
import { costoDePartida, costoDirecto, subcontrato, CAJON } from './costo.mjs'
import { observacionDePrecio, TIPO_RECURSO } from './precios.mjs'
import { ESTADO } from './contrato.mjs'

const HOY = new Date('2026-08-29T12:00:00Z')

const PRECIOS = [
  observacionDePrecio({ recursoCodigo: 'MAT-LAD', precio: 950, fuente: 'lista 08/2026', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MAT-HORM', precio: 180_000, fuente: 'Hormigonera SJ', observadoEn: '2026-08-10' }),
  observacionDePrecio({ recursoCodigo: 'MO-OF', precio: 4_200, fuente: 'convenio UOCRA', observadoEn: '2026-08-01' }),
  observacionDePrecio({ recursoCodigo: 'MO-AY', precio: 3_400, fuente: 'convenio UOCRA', observadoEn: '2026-08-01' }),
]

const MAMPOSTERIA = [
  { recursoCodigo: 'MAT-LAD', nombre: 'Ladrillón', tipo: TIPO_RECURSO.MATERIAL, cantidad: 45, unidad: 'un', desperdicio: 0.05 },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
  { recursoCodigo: 'MO-AY', nombre: 'Ayudante', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 2, unidad: 'hs' },
]
const COLUMNA = [
  { recursoCodigo: 'MAT-HORM', nombre: 'Hormigón H21', tipo: TIPO_RECURSO.MATERIAL, cantidad: 1.05, unidad: 'm3' },
  { recursoCodigo: 'MO-OF', nombre: 'Oficial albañil', tipo: TIPO_RECURSO.MANO_OBRA, cantidad: 8, unidad: 'hs' },
]

const armar = () => [
  costoDePartida({ partida: { codigo: 'T4010', cantidad: 520, unidad: 'M2' }, composicion: MAMPOSTERIA, observaciones: PRECIOS, hoy: HOY }),
  costoDePartida({ partida: { codigo: 'T1010', cantidad: 47.2, unidad: 'M3' }, composicion: COLUMNA, observaciones: PRECIOS, hoy: HOY }),
]

test('un recurso que aparece en DOS partidas sale UNA vez, con la cantidad sumada', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `explotarRecursos`, `acc.cantidad = Number(l.cantidad)`.
  const e = explotarRecursos(armar())
  const of = e.recursos.find((r) => r.recurso === 'MO-OF')
  // 520 m² × 2 hs + 47,2 m³ × 8 hs = 1.040 + 377,6 = 1.417,6
  assert.equal(of.cantidad, 1417.6)
  assert.equal(of.demandantes.length, 2)
  assert.deepEqual(of.demandantes.map((d) => d.partida), ['T4010', 'T1010'])
  assert.equal(e.recursos.filter((r) => r.recurso === 'MO-OF').length, 1)
})

test('la cantidad física incluye el desperdicio: se compran los ladrillones que se rompen', () => {
  const e = explotarRecursos(armar())
  const lad = e.recursos.find((r) => r.recurso === 'MAT-LAD')
  // 520 m² × 45 un/m² × 1,05 = 24.570
  assert.equal(lad.cantidad, 24_570)
  assert.notEqual(lad.cantidad, 23_400, 'sin desperdicio faltarían 1.170 ladrillones en la obra')
  assert.equal(lad.unidad, 'un')
})

test('RECONCILIACIÓN · Σ recursos × precios = el costo directo, con el residuo declarado', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `costoDePartida`, `const cantidadFisica = Number(l.cantidad) *
  // Number(cant)` (sin el desperdicio) — la explosión quedaría por debajo del costo.
  const costos = armar()
  const cd = costoDirecto(costos)
  const r = reconciliar(explotarRecursos(costos), cd)
  assert.equal(r.cuadra, true, r.porQue)
  assert.ok(Math.abs(r.residuo) <= TOLERANCIA_RECONCILIACION, `residuo ${r.residuo}`)
  assert.equal(r.costoDirecto, cd.total)
  assert.match(r.porQue, /por redondeo a centavos/)
})

test('EL CONTROL PUEDE DAR ROJO: si un recurso se cuenta de más, la reconciliación lo dice', () => {
  // Un control que no puede decir que no es una constante. Acá se rompe a mano: se duplica el
  // hormigón en la explosión y se comprueba que el residuo aparece con su plata.
  const costos = armar()
  const cd = costoDirecto(costos)
  const e = explotarRecursos(costos)
  const roto = { ...e, recursos: [...e.recursos, e.recursos.find((r) => r.recurso === 'MAT-HORM')], nSinPrecio: 0 }
  const r = reconciliar(roto, cd)
  assert.equal(r.cuadra, false)
  assert.ok(r.residuo > 8_000_000, `el residuo tendría que ser el hormigón entero, dio ${r.residuo}`)
  assert.match(r.porQue, /contado dos veces o uno perdido/)
})

test('la tolerancia es UN PESO, no un porcentaje', () => {
  // MUTACIÓN QUE LO PONE ROJO: `TOLERANCIA_RECONCILIACION = 100000`.
  assert.equal(TOLERANCIA_RECONCILIACION, 1)
  const costos = armar()
  const cd = costoDirecto(costos)
  const e = explotarRecursos(costos)
  const casi = { ...e, recursos: [...e.recursos, { recurso: 'ZZ', cajon: CAJON.MATERIALS, costoTotal: 2, cantidad: 1, demandantes: [] }], nSinPrecio: 0 }
  assert.equal(reconciliar(casi, cd).cuadra, false, '$2 de diferencia ya no cuadra: la única diferencia legítima es el redondeo a centavos')
})

test('sin costo directo afirmado, la reconciliación devuelve NULL y no `false`', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `reconciliar`, `cuadra: false` en la rama sin total.
  const costos = [...armar(), costoDePartida({ partida: { codigo: 'SAN', cantidad: 1, unidad: 'un', subcontrato: subcontrato({ alcance: 'sanitaria' }) } })]
  const r = reconciliar(explotarRecursos(costos), costoDirecto(costos))
  assert.equal(r.cuadra, null)
  assert.notEqual(r.cuadra, false, 'decir que no cuadra sería afirmar un desvío que nadie midió')
  assert.match(r.porQue, /no hay contra qué reconciliar/)
})

test('un recurso SIN PRECIO sale igual, con cantidad y sin costo: hay que comprarlo lo mismo', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `explotarRecursos`, filtrar los que tienen `sinPrecio`.
  const costos = [costoDePartida({
    partida: { codigo: 'T4010', cantidad: 520, unidad: 'M2' }, composicion: MAMPOSTERIA,
    observaciones: PRECIOS.filter((p) => p.recursoCodigo !== 'MO-AY'), hoy: HOY,
  })]
  const e = explotarRecursos(costos)
  const ay = e.recursos.find((r) => r.recurso === 'MO-AY')
  assert.equal(ay.cantidad, 1_040, 'la obra necesita 1.040 horas de ayudante aunque no se sepa cuánto salen')
  assert.equal(ay.costoTotal, null)
  assert.equal(ay.estado, ESTADO.FALTA_DATO)
  assert.equal(e.nSinPrecio, 1)
})

test('un recurso con precio en una partida y sin precio en otra NO publica costo total', () => {
  const conPrecio = costoDePartida({ partida: { codigo: 'A', cantidad: 10, unidad: 'M2' }, composicion: [MAMPOSTERIA[1]], observaciones: PRECIOS, hoy: HOY })
  const sinPrecio = costoDePartida({ partida: { codigo: 'B', cantidad: 10, unidad: 'M2' }, composicion: [MAMPOSTERIA[1]], observaciones: [], hoy: HOY })
  const of = explotarRecursos([conPrecio, sinPrecio]).recursos.find((r) => r.recurso === 'MO-OF')
  assert.equal(of.cantidad, 40, 'la cantidad sí se suma: se necesitan igual')
  assert.equal(of.costoTotal, null, 'pero el costo de la mitad con cara de completo, no')
})

test('HH POR CATEGORÍA no es dotación ni duración (§42)', () => {
  const e = explotarRecursos(armar())
  assert.deepEqual(e.hhPorCategoria.map((h) => [h.recurso, h.horas]).sort(), [['MO-AY', 1040], ['MO-OF', 1417.6]])
  assert.equal('dotacion' in e.hhPorCategoria[0], false)
  assert.equal('duracion' in e.hhPorCategoria[0], false)
})

test('DOS UNIDADES para el mismo recurso NO se suman en silencio', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar la marca `unidadesMezcladas`.
  // Sumar 40 kg de hierro con 3 barras da 43 de nada.
  const enKg = costoDePartida({
    partida: { codigo: 'A', cantidad: 1, unidad: 'M3' },
    composicion: [{ recursoCodigo: 'MAT-HIERRO', nombre: 'Hierro', tipo: TIPO_RECURSO.MATERIAL, cantidad: 40, unidad: 'kg' }],
    observaciones: [observacionDePrecio({ recursoCodigo: 'MAT-HIERRO', precio: 1_800, fuente: 'x', observadoEn: '2026-08-01' })], hoy: HOY,
  })
  const enBarras = costoDePartida({
    partida: { codigo: 'B', cantidad: 1, unidad: 'M3' },
    composicion: [{ recursoCodigo: 'MAT-HIERRO', nombre: 'Hierro', tipo: TIPO_RECURSO.MATERIAL, cantidad: 3, unidad: 'un' }],
    observaciones: [observacionDePrecio({ recursoCodigo: 'MAT-HIERRO', precio: 1_800, fuente: 'x', observadoEn: '2026-08-01' })], hoy: HOY,
  })
  const e = explotarRecursos([enKg, enBarras])
  assert.equal(e.nUnidadesMezcladas, 1)
  assert.equal(e.recursos.find((r) => r.recurso === 'MAT-HIERRO').unidadesMezcladas, true)
})

test('DERIVADO, NO EDITABLE: la explosión sale congelada y no hay función que la modifique', () => {
  const e = explotarRecursos(armar())
  assert.throws(() => { e.recursos[0].cantidad = 1 }, TypeError)
  assert.throws(() => { e.nRecursos = 99 }, TypeError)
  assert.throws(() => { e.recursos.push({}) }, TypeError)
})

test('lo que Compras va a consumir dice PARA QUÉ PARTIDAS es cada renglón', () => {
  const r = requerimientosParaCompras(explotarRecursos(armar()))
  assert.deepEqual(r.map((x) => x.recurso).sort(), ['MAT-HORM', 'MAT-LAD'])
  assert.deepEqual(r.find((x) => x.recurso === 'MAT-LAD').paraQuePartidas, ['T4010'])
  assert.equal(r.find((x) => x.recurso === 'MAT-LAD').cantidad, 24_570)
  // Sin esto Compras recibe «600 kg de hierro» y no sabe a quién preguntarle si el número no cierra.
  assert.ok(r.every((x) => x.paraQuePartidas.length > 0))
})

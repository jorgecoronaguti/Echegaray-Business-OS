// QUÉ PRUEBA ESTE ARCHIVO
//
// El resolvedor COMPARABLE puede decir «acá hay precio». Este archivo prueba, sobre todo, que puede
// decir que NO — que es la mitad que se rompe en silencio. Los nombres y los precios de los casos
// salen de `public.recurso` y `public.recurso_precio` reales, no están inventados para el test:
//
//   · HIERRO TORSIONADO ø 4,2/6/8/10/12/16/20 · kg · $1.615 · 01/04/2026  (los siete, el mismo precio)
//   · HIERRO LISO ø 16 · kg · $2.359,79 · 23/03/2025  (vencido)
//   · CEMENTO BLANCO · kg · $6.198,35 · 01/08/2025    (vencido)
//   · CEMENTO PORTLAND LOMA NEGRA · kg · $190 · 27/05/2026  (fresco)
//
// El caso del cemento es el que justifica la regla dura: un puntaje de similitud textual junta
// «CEMENTO BLANCO» con «CEMENTO PORTLAND» y le mete $190/kg a un material que en la base vale
// $6.198,35/kg. Ese error no deja un hueco: deja un número plausible 32 veces más barato.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseDescriptiva, sonComparables, cohorteDe, candidatoComparable,
  DIMENSIONES_INTENSIVAS, MINIMO_COHORTE, DISPERSION_MAXIMA,
} from './precio-comparable.mjs'
import { ORIGEN, FUENTE_DE_ORIGEN } from './precio-resolucion.mjs'
import { FUENTE } from '../plano/fuente.mjs'
import { DIMENSION } from './unidades.mjs'

const rec = (codigo, nombre, unidad) => ({ codigo, nombre, unidad })
const obs = (recurso, valor, observadoEn, moneda = 'ARS') => ({ recurso, valor, observadoEn, moneda })

const TORSIONADO = [
  obs(rec('16', 'HIERRO TORSIONADO ø 4,2', 'kg'), 1615, '2026-04-01'),
  obs(rec('17', 'HIERRO TORSIONADO ø 6', 'kg'), 1615, '2026-04-01'),
  obs(rec('18', 'HIERRO TORSIONADO ø 8', 'kg'), 1615, '2026-04-01'),
  obs(rec('19', 'HIERRO TORSIONADO ø 10', 'kg'), 1615, '2026-04-01'),
  obs(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), 1615, '2026-04-01'),
]

// ── LA BASE DESCRIPTIVA ───────────────────────────────────────────────────────────────────────

test('la base descriptiva le saca las medidas al nombre y deja el producto', () => {
  const b = baseDescriptiva('HIERRO TORSIONADO ø 12')
  assert.equal(b.clave, 'hierro·torsionado')
  assert.deepEqual([...b.dimensionales], ['12'])
})

test('dos diámetros del mismo producto comparten base; liso y torsionado NO', () => {
  assert.equal(baseDescriptiva('HIERRO TORSIONADO ø 12').clave, baseDescriptiva('HIERRO TORSIONADO ø 16').clave)
  assert.notEqual(baseDescriptiva('HIERRO LISO ø 16').clave, baseDescriptiva('HIERRO TORSIONADO ø 16').clave)
})

test('la base no depende del orden en que se escribió el nombre', () => {
  assert.equal(baseDescriptiva('PLACA DE YESO 12,5').clave, baseDescriptiva('YESO PLACA 12,5').clave)
})

// ── CUÁNDO DOS RECURSOS SON EL MISMO MERCADO ──────────────────────────────────────────────────

test('mismo producto, distinta medida, unidad de masa: comparable', () => {
  const r = sonComparables(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), rec('20', 'HIERRO TORSIONADO ø 12', 'kg'))
  assert.equal(r.comparable, true)
  assert.equal(r.factor, 1)
})

test('HIERRO LISO no toma el precio de HIERRO TORSIONADO: son dos productos', () => {
  const r = sonComparables(rec('243', 'HIERRO LISO ø 16', 'kg'), rec('21', 'HIERRO TORSIONADO ø 16', 'kg'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /base descriptiva no coincide/)
})

test('CEMENTO BLANCO no toma el precio de CEMENTO PORTLAND — el error de $190 contra $6.198', () => {
  const r = sonComparables(rec('5', 'CEMENTO BLANCO', 'kg'), rec('6', 'CEMENTO PORTLAND LOMA NEGRA', 'kg'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /son dos productos/)
})

test('en unidades de CONTEO no hay comparable: el precio es del objeto', () => {
  const r = sonComparables(rec('154', 'PLACA DE YESO 12,5 X 2,4 X 1,2', 'un'), rec('999', 'PLACA DE YESO 15 X 2,4 X 1,2', 'un'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /CONTEO/)
})

test('en horas tampoco: una hora de Bobcat y una de oficial no comparten precio', () => {
  const r = sonComparables(rec('334', 'COSTO HORA BOBCAT S650', 'hs'), rec('1', 'COSTO HORA OFICIAL', 'hs'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /TIEMPO_TRABAJO/)
})

test('CONTEO y TIEMPO_TRABAJO no están en la lista de dimensiones intensivas', () => {
  assert.equal(DIMENSIONES_INTENSIVAS.includes(DIMENSION.CONTEO), false)
  assert.equal(DIMENSIONES_INTENSIVAS.includes(DIMENSION.TIEMPO_TRABAJO), false)
  assert.equal(DIMENSIONES_INTENSIVAS.includes(DIMENSION.MASA), true)
})

test('dimensiones distintas no se comparan aunque el nombre coincida', () => {
  const r = sonComparables(rec('a', 'HIERRO TORSIONADO ø 16', 'kg'), rec('b', 'HIERRO TORSIONADO ø 12', 'm'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /MASA|LONGITUD/)
})

test('dentro de la dimensión SÍ convierte con factor declarado: t → kg', () => {
  const r = sonComparables(rec('a', 'HIERRO TORSIONADO ø 16', 'kg'), rec('b', 'HIERRO TORSIONADO ø 12', 't'))
  assert.equal(r.comparable, true)
  assert.equal(r.factor, 1000)
})

test('una unidad que el diccionario no conoce bloquea en vez de adivinar', () => {
  const r = sonComparables(rec('a', 'HIERRO TORSIONADO ø 16', 'pl'), rec('b', 'HIERRO TORSIONADO ø 12', 'kg'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /diccionario de unidades/)
})

test('un conflicto de atributos voltea la comparación aunque la base coincida', () => {
  // Mismo token base («panel·chapa»), espesores declarados distintos: 50 mm contra 100 mm.
  const r = sonComparables(rec('a', 'PANEL CHAPA e=50 mm', 'm2'), rec('b', 'PANEL CHAPA e=100 mm', 'm2'))
  assert.equal(r.comparable, false)
  assert.match(r.porQue, /atributos se contradicen/)
})

// ── LA COHORTE: LO QUE PRUEBA QUE LA MEDIDA NO MUEVE EL PRECIO ────────────────────────────────

test('cinco diámetros al mismo precio prueban que el diámetro no mueve el $/kg', () => {
  const c = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), TORSIONADO)
  assert.equal(c.sirve, true)
  assert.equal(c.miembros.length, 5)
  assert.equal(c.dispersion, 0)
  assert.equal(c.elegido.valorEnLaUnidad, 1615)
})

test('UN solo comparable no prueba nada: hacen falta dos', () => {
  const c = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), [TORSIONADO[0]])
  assert.equal(c.sirve, false)
  assert.match(c.porQue, new RegExp(`hacen falta ${MINIMO_COHORTE}`))
})

test('si los comparables NO coinciden entre sí, lo probado es que la medida SÍ mueve el precio', () => {
  const dispersa = [
    obs(rec('19', 'HIERRO TORSIONADO ø 10', 'kg'), 1000, '2026-04-01'),
    obs(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), 2000, '2026-04-01'),
  ]
  const c = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), dispersa)
  assert.equal(c.sirve, false)
  assert.match(c.porQue, /SÍ mueve el precio/)
  assert.equal(c.dispersion, null)
})

test('el umbral de dispersión discrimina: 4% pasa, 6% no', () => {
  const base = rec('21', 'HIERRO TORSIONADO ø 16', 'kg')
  const par = (alto) => [
    obs(rec('19', 'HIERRO TORSIONADO ø 10', 'kg'), 1000, '2026-04-01'),
    obs(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), alto, '2026-04-01'),
  ]
  assert.equal(cohorteDe(base, par(1000 * (1 + DISPERSION_MAXIMA - 0.01))).sirve, true)
  assert.equal(cohorteDe(base, par(1000 * (1 + DISPERSION_MAXIMA + 0.01))).sirve, false)
})

test('una cohorte que mezcla monedas no se compara sin tipo de cambio', () => {
  const mixta = [
    obs(rec('19', 'HIERRO TORSIONADO ø 10', 'kg'), 1615, '2026-04-01', 'ARS'),
    obs(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), 1615, '2026-04-01', 'USD'),
  ]
  const c = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), mixta)
  assert.equal(c.sirve, false)
  assert.match(c.porQue, /tipo de cambio/)
})

test('el propio recurso no entra a su cohorte', () => {
  const c = cohorteDe(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), TORSIONADO)
  assert.equal(c.miembros.some((m) => m.recurso.codigo === '20'), false)
  assert.equal(c.miembros.length, 4)
})

test('la elección del miembro es determinística: dos corridas eligen el mismo (§39)', () => {
  const barajado = [...TORSIONADO].reverse()
  const a = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), TORSIONADO)
  const b = cohorteDe(rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), barajado)
  assert.equal(a.elegido.recurso.codigo, b.elegido.recurso.codigo)
})

// ── EL CANDIDATO Y SUS LÍMITES ────────────────────────────────────────────────────────────────

test('el candidato sale con ORIGEN.COMPARABLE, fuente INFERIDO y NO es hecho de ECSAS', () => {
  const { candidato } = candidatoComparable({ recurso: rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), frescos: TORSIONADO })
  assert.ok(candidato)
  assert.equal(candidato.origen, ORIGEN.COMPARABLE)
  assert.equal(candidato.fuente, FUENTE.INFERIDO)
  assert.equal(candidato.esHechoEcsas, false)
})

test('un comparable NO puede declararse experiencia de ECSAS: la tabla de origen es congelada', () => {
  assert.equal(FUENTE_DE_ORIGEN[ORIGEN.COMPARABLE], FUENTE.INFERIDO)
  assert.notEqual(FUENTE_DE_ORIGEN[ORIGEN.COMPARABLE], FUENTE.EXPERIENCIA_ECSAS)
  assert.notEqual(FUENTE_DE_ORIGEN[ORIGEN.COMPARABLE], FUENTE.BASE_MAESTRA)
})

test('el candidato cita a quién le copió el precio, con nombre y fecha', () => {
  const { candidato } = candidatoComparable({ recurso: rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), frescos: TORSIONADO })
  assert.match(candidato.detalleFuente, /HIERRO TORSIONADO/)
  assert.match(candidato.detalleFuente, /2026-04-01/)
  assert.equal(candidato.evidencia.cohorte.length, 5)
  assert.equal(candidato.evidencia.dispersion, 0)
})

test('sin cohorte no hay candidato, y el motivo viaja escrito', () => {
  const r = candidatoComparable({ recurso: rec('243', 'HIERRO LISO ø 16', 'kg'), frescos: TORSIONADO })
  assert.equal(r.candidato, null)
  assert.match(r.porQue, /hacen falta/)
})

test('el valor transferido NO es el promedio de la cohorte', () => {
  const desparejos = [
    obs(rec('19', 'HIERRO TORSIONADO ø 10', 'kg'), 1000, '2026-04-01'),
    obs(rec('20', 'HIERRO TORSIONADO ø 12', 'kg'), 1040, '2026-04-02'),
  ]
  const { candidato } = candidatoComparable({ recurso: rec('21', 'HIERRO TORSIONADO ø 16', 'kg'), frescos: desparejos })
  assert.equal(candidato.valor, 1040)          // el más reciente, citado
  assert.notEqual(candidato.valor, 1020)       // NO el promedio
  assert.equal(candidato.observadoEn, '2026-04-02')
})

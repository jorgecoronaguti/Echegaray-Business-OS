// LO QUE ESTOS TESTS DEFIENDEN: QUE "LA MO DE LAS OBRAS ESTÁ EN EL CASH FLOW" SEA UNA MEDICIÓN.
//
// Hasta el 14/08 la corrida del libro imprimía *"$126.974.442 de MO va por Jornales"* copiando el
// número de la explosión del dueño. Nadie comparaba contra lo que la planilla de Jornales publica de
// verdad, y la celda que decide es `MAX(convenio; demanda)`: si el piso del plantel vigente queda
// corto frente a la demanda de las obras, el cash flow muestra de menos y la línea sigue diciendo que
// está todo. Estos tests fijan el control que lo ve — y, sobre todo, fijan que NO grite cuando el piso
// cubre de sobra, que es el falso positivo que haría que nadie lo mire más.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  demandaJornalPorQuincena, publicadasPorQuincena, coberturaDeManoDeObra, informeCobertura,
  fechaLocalDeSerial,
} from './obras-en-cash-flow.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'
import { claveQuincena } from './jornales-demanda-obras.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

const DESDE = new Date(2026, 7, 14) // el 14/08/2026, el día del pedido
/** Una obra mínima: 100 horas de Oficial dentro de una quincena. */
const obra = (extra = {}) => ({
  clave: 'test', cliente: 'X', obra: 'Y', inicio: '2026-09-01', fin: '2026-09-15',
  horas: { oficialEspecializado: 0, oficial: 100, ayudante: 0 }, moCargasPesos: 1_000_000, ...extra,
})
/** Los rangos con nombre como los lee el script: filas de una celda. */
const rango = (vs) => vs.map((v) => [v])

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA DEMANDA SALE DE LAS MISMAS FUNCIONES QUE USA JORNALES
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('las 7 obras reales piden jornal en quincenas identificadas, y nada queda sin fechas', () => {
  const d = demandaJornalPorQuincena(OBRAS_FUTURAS, { desde: DESDE })
  assert.deepEqual(d.sinFechas, [], 'las 7 obras declaran inicio y fin')
  assert.deepEqual(d.sinEscala, [], 'todas las categorías con horas tienen escala de convenio')
  assert.ok(d.total > 0)
  for (const k of d.porQuincena.keys()) assert.match(k, /^\d{4}-\d{2}-[12]$/, k)
})

test('una obra sin fechas no se proyecta y se REPORTA — no desaparece en silencio', () => {
  const d = demandaJornalPorQuincena([obra({ inicio: null, fin: null })], { desde: DESDE })
  assert.equal(d.total, 0)
  assert.equal(d.sinFechas.length, 1)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LO PUBLICADO POR LA PLANILLA SE UBICA POR SU QUINCENA, NO POR SU POSICIÓN
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('cada quincena publicada cae en la clave de su fecha de cierre', () => {
  const p = publicadasPorQuincena({
    hasta: rango([serialDe(2026, 9, 15), serialDe(2026, 9, 30)]),
    total: rango([3_000_000, 4_000_000]),
  })
  assert.equal(p.porQuincena.get('2026-09-1'), 3_000_000)
  assert.equal(p.porQuincena.get('2026-09-2'), 4_000_000)
  assert.equal(p.total, 7_000_000)
})

test('el serial se lee como fecha LOCAL: el huso no puede correr una quincena de mes', () => {
  // El 30/09 leído en UTC y mirado con getters locales en San Juan (UTC−3) sería el 29/09 21:00.
  // Sigue siendo la 2ª quincena de septiembre, pero la conversión no puede depender de eso.
  const d = fechaLocalDeSerial(serialDe(2026, 9, 30))
  assert.equal(d.getFullYear(), 2026)
  assert.equal(d.getMonth() + 1, 9)
  assert.equal(d.getDate(), 30)
  assert.equal(claveQuincena(d), '2026-09-2')
  assert.equal(claveQuincena(fechaLocalDeSerial(serialDe(2026, 1, 1))), '2026-01-1')
})

test('una quincena con importe y sin fecha de cierre se cuenta aparte, no como cero', () => {
  const p = publicadasPorQuincena({ hasta: rango([null]), total: rango([5_000_000]) })
  assert.equal(p.total, 0)
  assert.equal(p.sinFecha, 5_000_000)
  // Tratarla como 0 inventaría un faltante de $5.000.000 que quizá no existe.
  assert.equal(p.porQuincena.size, 0)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL DEFECTO QUE EL CONTROL EXISTE PARA VER
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('si la planilla queda corta, el control lo dice y lo cuantifica', () => {
  const d = demandaJornalPorQuincena([obra()], { desde: DESDE })
  const [clave, { jornales }] = [...d.porQuincena.entries()][0]
  const p = { porQuincena: new Map([[clave, jornales - 500_000]]) }
  const c = coberturaDeManoDeObra(d, p)
  assert.equal(Math.round(c.falta), 500_000)
  assert.ok(c.cobertura < 1)
  const informe = informeCobertura(c).join('\n')
  assert.match(informe, /Faltan \$500\.000/)
  assert.match(informe, new RegExp(`quincena ${clave}`))
})

test('una quincena con demanda y SIN fila publicada falta ENTERA', () => {
  // Es el caso más grave —la planilla no llega hasta ahí— y el que un promedio taparía.
  const d = demandaJornalPorQuincena([obra()], { desde: DESDE })
  const c = coberturaDeManoDeObra(d, { porQuincena: new Map() })
  assert.equal(Math.round(c.falta), Math.round(c.demanda))
  assert.equal(c.cobertura, 0)
})

test('cuando el piso del convenio cubre de sobra, el control NO grita', () => {
  // La celda de Jornales es MAX(convenio; demanda): publicado MAYOR que la demanda significa que la
  // MO de la obra está ADENTRO de ese número. Un control que marcara falta acá sería un falso
  // positivo, y un falso positivo recurrente es cómo un control deja de mirarse.
  const d = demandaJornalPorQuincena([obra()], { desde: DESDE })
  const [clave, { jornales }] = [...d.porQuincena.entries()][0]
  const c = coberturaDeManoDeObra(d, { porQuincena: new Map([[clave, jornales * 3]]) })
  assert.equal(c.falta, 0)
  assert.equal(c.cobertura, 1)
  assert.equal(informeCobertura(c).length, 1, 'una sola línea: el número, sin alarmas')
  assert.match(informeCobertura(c)[0], /100,0%/)
})

test('la cobertura nunca supera el 100%: lo que sobra no compensa lo que falta en otra quincena', () => {
  // Sin el MIN por quincena, una quincena con el triple compensaría a otra en cero y el total diría
  // "todo cubierto" con media obra afuera del flujo. Es el mismo error que un promedio.
  const d = demandaJornalPorQuincena([obra({ inicio: '2026-09-01', fin: '2026-09-30' })], { desde: DESDE })
  const claves = [...d.porQuincena.keys()]
  assert.ok(claves.length >= 2, 'la obra pisa las dos quincenas de septiembre')
  const total = [...d.porQuincena.values()].reduce((s, v) => s + v.jornales, 0)
  const c = coberturaDeManoDeObra(d, { porQuincena: new Map([[claves[0], total * 2]]) })
  assert.ok(c.cobertura < 1, `cobertura ${c.cobertura}`)
  assert.ok(c.falta > 0)
})

test('el control habla SIEMPRE, también cuando no hay nada que cubrir', () => {
  const c = coberturaDeManoDeObra({ porQuincena: new Map() }, { porQuincena: new Map() })
  assert.equal(c.demanda, 0)
  assert.equal(c.cobertura, 1)
  assert.equal(informeCobertura(c).length, 1)
  assert.match(informeCobertura(c)[0], /nada que cubrir/)
})

test('el detalle se acota, pero el resto se declara en vez de desaparecer', () => {
  const quincenas = Array.from({ length: 9 }, (_, i) => ({ clave: `2026-0${i + 1}-1`, demanda: 100, publicado: 0, falta: 100 }))
  const informe = informeCobertura({ demanda: 900, cubierta: 0, falta: 900, cobertura: 0, quincenas }, { tope: 6 })
  assert.equal(informe.length, 8) // 1 encabezado + 6 quincenas + 1 "y 3 más"
  assert.match(informe.at(-1), /3 quincena\(s\) más/)
})

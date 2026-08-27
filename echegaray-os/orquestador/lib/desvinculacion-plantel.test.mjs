// LAS TRES TRAMPAS DE `_J_OBREROS`, CADA UNA CON SU TEST.
//
// Ninguna da error: todas devuelven un número plausible. El nombre dado vuelta duplica personas y
// entonces media planilla parece recién ingresada; el año tipeado mal ("21/1/16") le regala diez años
// de antigüedad a quien entró en 2026 y le duplica los días de vacaciones; y tomarle a un reingreso
// la fecha de su relación anterior le baja el aporte del 12% al 8%. Los tres se ven acá o no se ven.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveNombre, parsearFechaIngreso, horas, jornal, tramoVigente, plantelDelEspejo,
  separarPlantel, mejorMesDelSemestre, fclDevengadoDelAnio, periodoDe,
} from './desvinculacion-plantel.mjs'
import { alicuotaFcl } from './desvinculacion-22250.mjs'

test('el nombre dado vuelta es la MISMA persona', () => {
  assert.equal(claveNombre('Marcelo Pastran'), claveNombre('Pastran Marcelo'))
  assert.equal(claveNombre('Raul Sosa. 1'), claveNombre('Sosa Raul'))
  assert.equal(claveNombre('Zogber Leonardo '), claveNombre('Leonardo Zogber'))
  assert.notEqual(claveNombre('Quiroga Sebastian'), claveNombre('Quiroga Alexander'))
})

test('lo que la planilla escribe se lee en es-AR', () => {
  assert.equal(horas('1,5'), 1.5)
  assert.equal(horas(''), 0)
  assert.equal(jornal('$5.400'), 5400)
  assert.deepEqual(parsearFechaIngreso('26/5/25'), new Date(2025, 4, 26))
  assert.equal(parsearFechaIngreso('sin fecha'), null)
})

test('un hueco corto es una licencia; uno largo es una relación nueva', () => {
  assert.deepEqual(tramoVigente([0, 1, 2, 3]), { desde: 0, hasta: 3, reingreso: false })
  // Dos quincenas de ausencia: sigue siendo la misma relación.
  assert.deepEqual(tramoVigente([0, 1, 4, 5]), { desde: 0, hasta: 5, reingreso: false })
  // Tres o más: se cortó. Es el caso real de Ochoa Eduardo (trabajó hasta mayo, volvió el 19/8).
  assert.deepEqual(tramoVigente([0, 1, 8, 9]), { desde: 8, hasta: 9, reingreso: true })
})

// Un espejo mínimo con la forma real: fila de fechas arriba, personas numeradas debajo.
// Columnas: A=n · B=nombre · C=ingreso · D=categoría · F..U=días · W=$/hora.
const fila = (n, nombre, ingreso, cat, dias, hora) => {
  const f = new Array(23).fill('')
  f[0] = String(n); f[1] = nombre; f[2] = ingreso; f[3] = cat; f[22] = hora
  dias.forEach((h, i) => { f[5 + i] = h })
  return f
}
const fechas = (...ds) => { const f = new Array(23).fill(''); ds.forEach((x, i) => { f[5 + i] = x }); return f }

const GRID = [
  fechas('28/7', '29/7'),
  fila(1, 'Marcelo Pastran', '10/11/25', 'OF', ['8', '8'], '$6.000'),
  fila(2, 'Eduardo Ochoa', '13/1/25', 'OF', ['8', '8'], '$5.875'),
  fechas('3/8', '4/8'),
  fila(1, 'Pastran Marcelo', '21/1/16', 'OF', ['8', '4'], '$6.200'),
  fechas('5/8', '6/8'),
  fila(1, 'Pastran Marcelo', '21/1/16', 'OF', ['', ''], '$6.200'),
  fechas('7/8', '10/8'),
  fila(1, 'Pastran Marcelo', '21/1/16', 'OF', ['', ''], '$6.200'),
  fechas('17/8', '18/8'),
  fila(1, 'Pastran Marcelo', '21/1/16', 'OF', ['8', '8'], '$6.200'),
  fila(2, 'Ochoa Eduardo', '19/8/26', 'OF', ['0', '8'], '$5.600'),
]
// Ochoa está en el bloque 0 y en el 4: tres quincenas de ausencia. Es el hueco real que dejó entre
// mayo y agosto de 2026, y el que tiene que cortar la relación anterior.
const BLOQUES = [
  { filaFecha: 1, inicio: 2, fin: 3 },
  { filaFecha: 4, inicio: 5, fin: 5 },
  { filaFecha: 6, inicio: 7, fin: 7 },
  { filaFecha: 8, inicio: 9, fin: 9 },
  { filaFecha: 10, inicio: 11, fin: 12 },
]

test('LA TRAMPA DEL AÑO TIPEADO MAL: gana la fecha del primer bloque del tramo', () => {
  const p = plantelDelEspejo(GRID, BLOQUES, { anio: 2026 })
  const pastran = p.find((x) => claveNombre(x.nombre) === claveNombre('Pastran Marcelo'))
  // Si se tomara la del último bloque —o la mínima— saldría 21/1/2016 y le daría 10 años.
  assert.deepEqual(pastran.ingreso, new Date(2025, 10, 10))
  assert.equal(pastran.reingreso, false)
})

test('LA TRAMPA DEL REINGRESO: Ochoa arranca de cero y vuelve al 12%', () => {
  const p = plantelDelEspejo(GRID, BLOQUES, { anio: 2026 })
  const ochoa = p.find((x) => claveNombre(x.nombre) === claveNombre('Ochoa Eduardo'))
  assert.equal(ochoa.reingreso, true)
  assert.deepEqual(ochoa.ingreso, new Date(2026, 7, 19))
  // Con la fecha vieja (13/1/25) la alícuota habría caído al 8%: media deuda de menos.
  assert.equal(alicuotaFcl(ochoa.ingreso, new Date(2026, 7, 27)), 0.12)
})

test('las horas se reparten por la FECHA del día, no por el bloque', () => {
  const p = plantelDelEspejo(GRID, BLOQUES, { anio: 2026 })
  const pastran = p.find((x) => claveNombre(x.nombre) === claveNombre('Pastran Marcelo'))
  // El primer bloque cae en julio; los otros dos, en agosto. Un bloque a caballo del mes no puede
  // caer entero en uno de los dos: el Fondo de Cese se devenga POR MES.
  assert.equal(pastran.horasPorMes.get('2026-07'), 16)
  assert.equal(pastran.horasPorMes.get('2026-08'), 28)
})

test('activo es quien está en la quincena en curso; el resto ya se fue', () => {
  const { activos, desafectados } = separarPlantel(plantelDelEspejo(GRID, BLOQUES, { anio: 2026 }), BLOQUES)
  assert.deepEqual(activos.map((x) => claveNombre(x.nombre)).sort(),
    [claveNombre('Ochoa Eduardo'), claveNombre('Pastran Marcelo')].sort())
  assert.equal(desafectados.length, 0)
})

test('el mejor mes del SAC sólo mira el semestre del cese', () => {
  const horasPorMes = new Map([['2026-05', 200], ['2026-07', 100], ['2026-08', 50]])
  // Cese en agosto ⇒ segundo semestre: mayo no puede ganar aunque sea el mes más grande del año.
  const m = mejorMesDelSemestre(horasPorMes, 6348, new Date(2026, 7, 27))
  assert.equal(m.periodo, '2026-07')
  assert.equal(m.importe, 634800)
})

test('el fondo devengado cambia de alícuota EN EL MES en que se cumple el año', () => {
  const horasPorMes = new Map([['2026-07', 100], ['2026-08', 100]])
  // Ingreso 15/8/2025: julio todavía es primer año (12%), agosto ya no (8%).
  const t = fclDevengadoDelAnio({
    horasPorMes, basicoHora: 1000, ingreso: new Date(2025, 7, 15), alicuotaDe: alicuotaFcl,
  })
  assert.equal(t, 100000 * 0.12 + 100000 * 0.08)
  assert.equal(fclDevengadoDelAnio({ horasPorMes, basicoHora: 1000, ingreso: null, alicuotaDe: alicuotaFcl }), null)
})

test('periodoDe da la clave con la que se indexan los meses', () => {
  assert.equal(periodoDe(new Date(2026, 0, 5)), '2026-01')
  assert.equal(periodoDe(null), null)
})

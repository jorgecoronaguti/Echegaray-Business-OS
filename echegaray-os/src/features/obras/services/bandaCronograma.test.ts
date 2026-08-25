import test from 'node:test'
import assert from 'node:assert/strict'

import { bandasDePeriodo, franjasNoLaborables } from './bandaCronograma.ts'
import { celdasDe, tramoDe } from './escalaCronograma.ts'

test('la banda de período nombra cada mes que cruza la ventana, una sola vez', () => {
  const b = bandasDePeriodo('2026-08-03', '2026-09-05', 'dia')
  assert.deepEqual(b.map((x) => x.etiqueta), ['Agosto 2026', 'Septiembre 2026'])
  assert.equal(b[0]!.izqPct, 0)
})

test('las bandas cubren el lienzo entero y no se pisan', () => {
  const b = bandasDePeriodo('2026-08-03', '2026-10-20', 'semana')
  assert.equal(b.length, 3)
  b.forEach((x, i) => {
    if (i > 0) assert.equal(Math.round(x.izqPct * 1e6), Math.round((b[i - 1]!.izqPct + b[i - 1]!.anchoPct) * 1e6))
  })
  const ultima = b.at(-1)!
  assert.equal(Math.round(ultima.izqPct + ultima.anchoPct), 100)
})

// EL DEFECTO QUE ATRAPA: una cabecera calculada con otro denominador que las barras. Si la banda
// dividiera por `diasEntre` (sin contar la punta) y la barra por `celdasDe`, el mes de arriba y la
// actividad de abajo quedarían corridos entre sí y nadie daría un error.
test('la banda del mes arranca donde arranca una barra que empieza ese mismo día', () => {
  const escala = { desde: '2026-08-03', hasta: '2026-09-05' }
  const b = bandasDePeriodo(escala.desde, escala.hasta, 'dia')
  const barraDelPrimeroDeSeptiembre = tramoDe(escala, '2026-09-01', '2026-09-01')!
  assert.equal(b[1]!.izqPct.toFixed(6), barraDelPrimeroDeSeptiembre.izqPct.toFixed(6))
})

test('con zoom de mes la banda de arriba es el año, no el mes repetido', () => {
  const b = bandasDePeriodo('2026-11-01', '2027-02-10', 'mes')
  assert.deepEqual(b.map((x) => x.etiqueta), ['2026', '2027'])
})

test('se sombrean los días que la obra NO trabaja, agrupando el fin de semana en una franja', () => {
  // 2026-08-03 es lunes. Con semana de lunes a viernes, el primer no laborable es el sábado 08.
  const f = franjasNoLaborables('2026-08-03', '2026-08-16', [1, 2, 3, 4, 5])
  assert.equal(f.length, 2)
  assert.equal(f[0]!.clave, '2026-08-08')
  const celdas = celdasDe('2026-08-03', '2026-08-16')
  assert.equal(Math.round((f[0]!.anchoPct * celdas) / 100), 2) // sábado + domingo, una sola franja
})

// EL DEFECTO QUE ATRAPA: leer el día con `getUTCDay()` (0 domingo) contra `dias_habiles`, que usa
// isodow (7 domingo). Una obra que trabaja los domingos vería sus domingos pintados como francos.
test('una obra que trabaja los domingos no tiene el domingo sombreado', () => {
  const f = franjasNoLaborables('2026-08-03', '2026-08-16', [1, 2, 3, 4, 5, 7])
  assert.deepEqual(f.map((x) => x.clave), ['2026-08-08', '2026-08-15'])
})

test('sobre una ventana larga no se dibuja ninguna franja: a esa escala un día no se ve', () => {
  assert.deepEqual(franjasNoLaborables('2026-01-01', '2027-06-30', [1, 2, 3, 4, 5]), [])
})

test('sin días hábiles declarados no se inventa una semana laboral', () => {
  assert.deepEqual(franjasNoLaborables('2026-08-03', '2026-08-16', []), [])
})

// ═══ LAS DIVISIONES DE LA ESCALA ═══

import { divisionesDe } from './bandaCronograma.ts'
import { construirEscalaCronograma } from './escalaCronograma.ts'

const cols = (desde: string, hasta: string, unidad: 'dia' | 'semana' | 'mes', hoy: string) =>
  construirEscalaCronograma({ desde, hasta }, unidad, hoy).columnas

test('en escala de día hay una división por día y son todas del mismo ancho', () => {
  const d = divisionesDe(cols('2026-08-03', '2026-08-07', 'dia', '2026-08-05'), '2026-08-05', [1, 2, 3, 4, 5])
  assert.equal(d.length, 5)
  assert.deepEqual(d.map((x) => x.dias), [1, 1, 1, 1, 1])
  assert.equal(d.filter((x) => x.esHoy).length, 1)
  assert.equal(d.find((x) => x.esHoy)!.clave, '2026-08-05')
})

test('en escala de semana la división agrupa siete días y hoy cae adentro de una sola', () => {
  const d = divisionesDe(cols('2026-08-03', '2026-08-23', 'semana', '2026-08-12'), '2026-08-12', [1, 2, 3, 4, 5])
  assert.deepEqual(d.map((x) => x.dias), [7, 7, 7])
  assert.equal(d.filter((x) => x.esHoy).length, 1)
  assert.equal(d[1].esHoy, true)
})

test('una división es franco sólo si NINGUNO de sus días se trabaja', () => {
  // El defecto que atrapa: sombrear la semana entera porque tiene un domingo adentro.
  const semana = divisionesDe(cols('2026-08-03', '2026-08-09', 'semana', '2026-08-03'), '2026-08-03', [1, 2, 3, 4, 5])
  assert.equal(semana[0].franco, false)
  const dias = divisionesDe(cols('2026-08-08', '2026-08-09', 'dia', '2026-08-03'), '2026-08-03', [1, 2, 3, 4, 5])
  assert.deepEqual(dias.map((x) => x.franco), [true, true])
})

test('sin días hábiles declarados no se sombrea nada: no se asume sábado y domingo', () => {
  const d = divisionesDe(cols('2026-08-08', '2026-08-09', 'dia', '2026-08-03'), '2026-08-03', [])
  assert.deepEqual(d.map((x) => x.franco), [false, false])
})

test('las divisiones cubren el lienzo entero, sin huecos ni desbordes', () => {
  const d = divisionesDe(cols('2026-08-03', '2026-09-30', 'mes', '2026-08-20'), '2026-08-20', [1, 2, 3, 4, 5])
  assert.equal(d[0].izqPct, 0)
  const ultima = d[d.length - 1]
  assert.ok(Math.abs(ultima.izqPct + ultima.anchoPct - 100) < 0.0001)
})

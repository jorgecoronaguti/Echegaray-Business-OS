import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  alicuotasVigentes, costoDeHora, lineasDeObra, multiplicadorDeCosto, proyectarQuincena,
  type Alicuota, type HorasDeObra,
} from './costoHora.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que el multiplicador ignore `base` y devuelva 1,262 tanto si el no-trabajado-pago pesa sobre
//     lo declarado como si pesa sobre el total. Son dos costos distintos de la misma hora
//     (1,262 vs 1,311) y la diferencia se carga a la obra sin que nadie la vea.
//  2. Que «vigente» signifique «la última fila cargada». Cargar hoy la ART que rige desde octubre
//     reescribiría en silencio el costo de la quincena de septiembre ya cargado a una obra.
//  3. Que la ausencia de alícuotas se publique como multiplicador 1 o costo 0. Un 1 afirma «la
//     hora cuesta lo que cobra» — que es falso — con la misma cara que un número correcto.
//  4. Que el consumo del presupuesto de una obra sin mano de obra presupuestada salga 0 %, que se
//     lee como «no consumió nada» cuando en realidad nadie cargó la base.

const a = (
  concepto: Alicuota['concepto'], desde: string, porcentaje: number,
  base: Alicuota['base'] = 'declarado',
): Alicuota => ({ concepto, desde, porcentaje, base, fuente: 'test' })

/** Las cinco del handoff v2 §5: 26,4 + 7,2 + 8 + 1 + 9,8 = 52,4 %. */
const CINCO = [
  a('cargas_sociales', '2026-01-01', 26.4),
  a('art', '2026-01-01', 7.2),
  a('fondo_cese', '2026-01-01', 8),
  a('seguro_vida_sepelio', '2026-01-01', 1),
  a('no_trabajado_pago', '2026-01-01', 9.8),
]

const redondo = (n: number | null, d = 3): number | null =>
  n == null ? null : Math.round(n * 10 ** d) / 10 ** d

test('§5 · las cinco alícuotas del handoff dan multiplicador 1,524', () => {
  const m = multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09'))
  assert.equal(redondo(m.valor), 1.524)
  assert.deepEqual(m.faltan, [])
  // El ejemplo del handoff: bolsillo 3.650. (El mockup escribe 5.564 porque redondea el
  // multiplicador a 1,5244; la cuenta exacta con 52,4 % da 5.562,6. Se computa la exacta.)
  assert.equal(redondo(costoDeHora(3650, m.valor), 1), 5562.6)
})

test('§5 · la mitad declarada baja el multiplicador a 1,262, y no es un redondeo del 1,524', () => {
  const m = multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09'), 0.5)
  assert.equal(redondo(m.valor), 1.262)
})

test('`base` cambia el resultado: no-trabajado-pago sobre el total da 1,311, no 1,262', () => {
  // Si el multiplicador ignorara `base`, este caso daría 1,262 igual que el anterior.
  const mixto = [...CINCO.slice(0, 4), a('no_trabajado_pago', '2026-01-01', 9.8, 'total')]
  const m = multiplicadorDeCosto(alicuotasVigentes(mixto, '2026-09-09'), 0.5)
  assert.equal(redondo(m.valor), 1.311)
  assert.notEqual(redondo(m.valor), 1.262)
})

test('vigente es la de mayor `desde` YA EMPEZADO, no la última cargada', () => {
  const filas = [
    a('art', '2026-01-01', 7.2),
    a('art', '2026-10-01', 9.9), // cargada hoy, rige desde octubre
    a('art', '2026-06-01', 8.4),
  ]
  const vig = alicuotasVigentes(filas, '2026-09-09')
  assert.equal(vig.art?.porcentaje, 8.4, 'la de junio rige en septiembre')
  assert.equal(alicuotasVigentes(filas, '2026-10-15').art?.porcentaje, 9.9)
  assert.equal(alicuotasVigentes(filas, '2025-12-31').art, undefined, 'antes de la primera: sin cargar')
})

test('R1 · sin alícuotas el multiplicador es null y el costo es null, nunca 1 ni 0', () => {
  const m = multiplicadorDeCosto(alicuotasVigentes([], '2026-09-09'))
  assert.equal(m.valor, null)
  assert.equal(m.faltan.length, 5, 'los cinco conceptos se nombran, no se asumen en cero')
  assert.equal(costoDeHora(3650, m.valor), null)
  assert.equal(costoDeHora(null, 1.524), null, 'sin tarifa no hay costo, aunque haya multiplicador')
})

test('una alícuota parcial no completa el resto en cero: suma lo que hay y dice qué falta', () => {
  const m = multiplicadorDeCosto(alicuotasVigentes([a('art', '2026-01-01', 7.2)], '2026-09-09'))
  assert.equal(redondo(m.valor), 1.072)
  assert.deepEqual(m.faltan, ['cargas_sociales', 'fondo_cese', 'seguro_vida_sepelio', 'no_trabajado_pago'])
})

test('la proporción declarada se acota a [0,1]: fuera de rango no infla el costo', () => {
  assert.equal(redondo(multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09'), 3).valor), 1.524)
  assert.equal(redondo(multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09'), -1).valor), 1)
  assert.equal(redondo(multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09'), NaN).valor), 1.524)
})

test('pantalla 6 · sin mano de obra presupuestada el consumo es null, no 0 %', () => {
  const horas: HorasDeObra[] = [
    { obraId: 'quattropani', rotulo: 'SALÓN COMERCIAL', horas: 319, gente: 6, bolsillo: 1_600_000, sinTarifa: 0 },
    { obraId: 'le-comedor', rotulo: 'COMEDOR', horas: 45, gente: 1, bolsillo: 200_000, sinTarifa: 0 },
    { obraId: null, rotulo: 'Sin obra imputada', horas: 60.8, gente: 2, bolsillo: null, sinTarifa: 2 },
  ]
  const m = multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09')).valor
  const l = lineasDeObra(horas, new Map([['quattropani', 38_802_169]]), m)
  assert.equal(redondo(l[0].costoReal, 0), 2_438_400)
  assert.equal(redondo(l[0].consumo, 2), 6.28)
  assert.equal(l[1].presupuesto, null)
  assert.equal(l[1].consumo, null, 'sin base no hay porcentaje')
  assert.equal(l[2].costoReal, null, 'sin bolsillo completo no se publica un costo por obra')
})

test('pantalla 6 · sin multiplicador ninguna obra publica costo', () => {
  const l = lineasDeObra(
    [{ obraId: 'x', rotulo: 'X', horas: 10, gente: 1, bolsillo: 50_000, sinTarifa: 0 }],
    new Map([['x', 1_000_000]]), null,
  )
  assert.equal(l[0].costoReal, null)
  assert.equal(l[0].consumo, null)
})

test('pantalla 9 · la persona sin tarifa no se proyecta en cero: se cuenta', () => {
  const p = proyectarQuincena(
    [
      { personaId: '1', nombre: 'A', valorHora: 3650 },
      { personaId: '2', nombre: 'B', valorHora: null },
    ],
    97, multiplicadorDeCosto(alicuotasVigentes(CINCO, '2026-09-09')).valor,
  )
  assert.equal(p.bolsillo, 354_050, 'sólo la que tiene tarifa')
  assert.equal(p.sinTarifa, 1)
  assert.equal(redondo(p.costoReal, 1), 539_572.2)
})

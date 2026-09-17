import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  armarRetribucionDelPlantel, celdasDeLaPersona, medidaDe, mesesDeColumnas, plantelActivo, quincenaDeLaPersona,
  type LineaDelCuadro, type QuincenaLeida,
} from './retribucionDelPlantel.ts'
import { armarRetribucion, quincenasDelAnio, type ReciboDelBlanco } from './retribucionDelLegajo.ts'
import { pagoDeLaLinea } from './pagoDeLaQuincena.ts'
import { quincenaDe } from './quincena.ts'
import { rotuloDeValorHora } from './valorHoraDelLegajo.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//  1. Que la fila del plantel y la ficha de la persona den números distintos: el total del año tiene que
//     ser `totales.pagado` / `totales.total` de `armarRetribucion`, no una suma propia de las celdas.
//  2. Que una línea de otra persona del mismo cuadro caiga en la fila equivocada.
//  3. Que el mes de un mensual se dibuje dos veces (una por quincena) y sume el neto doble a la vista.
//  4. Que una quincena fuera del plantel se escriba $0, o que «sin neto» en Liquidado se escriba $0.
//  5. Que una liquidación final cuente como plantel activo, o que el plantel salga de una quincena vieja.
//  6. Que la columna de una quincena no coincida con su período (un corrimiento de una columna).

const rotulo = rotuloDeValorHora({ puedeVer: true, tarifas: [], recibo: null, piso: null, categoria: null, hoy: '2026-09-17' })

const porHora = (personaId: string, nombre: string, o: {
  banco: number | null; negro: number | null; pagadoBanco?: number; pagadoEfectivo?: number; sinNeto?: boolean
}): LineaDelCuadro => ({
  personaId, nombre, modalidad: 'hora', horas: 80, valorHora: 6000, netoMensual: null, sinTarifa: false,
  sinNeto: o.sinNeto === true, sueldo: { estado: 'recibo' },
  pago: pagoDeLaLinea({ banco: o.banco, negro: o.negro, pagadoBanco: o.pagadoBanco, pagadoEfectivo: o.pagadoEfectivo }),
})

const mensual = (personaId: string, nombre: string, neto: number, pagadoBanco: number): LineaDelCuadro => ({
  personaId, nombre, modalidad: 'mensual', horas: 90, valorHora: null, netoMensual: neto, sinTarifa: false,
  sinNeto: false, sueldo: null, pago: pagoDeLaLinea({ banco: neto, negro: 0, pagadoBanco }),
})

const leida = (desde: string, obreros: LineaDelCuadro[], oficina: LineaDelCuadro[] = [], final: LineaDelCuadro[] = []): QuincenaLeida => ({
  quincena: quincenaDe(desde),
  cuadros: [{ grupo: 'obreros', lineas: obreros }, { grupo: 'oficina', lineas: oficina }, { grupo: 'final', lineas: final }],
  estados: { obreros: { id: 'x', estado: desde < '2026-09-01' ? 'cerrada' : 'abierta', cerradaEn: null } },
})

const LECTURAS: QuincenaLeida[] = [
  leida('2026-08-01', [porHora('a', 'Ana', { banco: 200000, negro: 300000, pagadoBanco: 200000, pagadoEfectivo: 300000 })],
    [mensual('m', 'Mora', 1800000, 900000)]),
  leida('2026-08-16', [
    porHora('a', 'Ana', { banco: 210000, negro: null, pagadoEfectivo: 50000 }),
    porHora('b', 'Beto', { banco: null, negro: 100000, sinNeto: true }),
  ], [mensual('m', 'Mora', 1800000, 900000)]),
  leida('2026-09-01', [
    porHora('b', 'Beto', { banco: 150000, negro: 150000, pagadoBanco: 150000 }),
    porHora('a', 'Ana', { banco: 220000, negro: 330000, pagadoBanco: 220000 }),
  ], [mensual('m', 'Mora', 1900000, 1000000)], [porHora('z', 'Zulema', { banco: 1, negro: 1 })]),
]

const recibos: ReciboDelBlanco[] = [{ periodo: 'Q1-09/2026', categoria: 'OFICIAL', valorHora: 3000, neto: 220000 }]

const armar = (medida: 'pagado' | 'liquidado') => armarRetribucionDelPlantel({
  puedeVer: true, anio: 2026, medida, lecturas: LECTURAS, errores: [],
  personas: plantelActivo(LECTURAS).map((p) => ({ ...p, cuil: null })),
  recibosDe: (p) => (p.personaId === 'a' ? recibos : []),
  rotuloDe: () => rotulo,
})

test('el plantel activo es el de la quincena más nueva, sin liquidaciones finales y por nombre', () => {
  assert.deepEqual(plantelActivo([...LECTURAS].reverse()).map((p) => p.personaId), ['a', 'b', 'm'])
})

test('la línea de cada persona es la suya aunque compartan cuadro', () => {
  const q = quincenaDeLaPersona(LECTURAS[1], 'b')
  assert.equal(q.linea?.sinNeto, true)
  assert.equal(q.estado, 'cerrada')
  assert.deepEqual(quincenaDeLaPersona(LECTURAS[1], 'nadie'), { quincena: quincenaDe('2026-08-16'), estado: null, linea: null })
})

test('la fila de cada persona coincide con su ficha: mismas filas y mismo total del año', () => {
  for (const medida of ['pagado', 'liquidado'] as const) {
    for (const f of armar(medida).filas) {
      const ficha = armarRetribucion({
        puedeVer: true, anio: 2026, errores: [],
        quincenas: LECTURAS.map((l) => quincenaDeLaPersona(l, f.personaId)),
        recibos: f.personaId === 'a' ? recibos : [],
      })
      assert.deepEqual(f.retribucion, ficha)
      assert.equal(f.total, medida === 'pagado' ? ficha.totales.pagado : ficha.totales.total)
    }
  }
  const ana = armar('pagado').filas.find((f) => f.personaId === 'a')
  assert.equal(ana?.total, 500000 + 50000 + 220000)
})

test('cada quincena cae en su columna, y fuera del plantel no es $0', () => {
  const beto = armar('pagado').filas.find((f) => f.personaId === 'b')
  assert.deepEqual(beto?.celdas.map((c) => [c.desde, c.valor, c.motivo]), [
    ['2026-08-01', null, 'fuera'], ['2026-08-16', 0, null], ['2026-09-01', 150000, null],
  ])
})

test('en Liquidado, «sin neto» se dice y una fila sin negro no inventa total', () => {
  const d = armar('liquidado')
  const beto = d.filas.find((f) => f.personaId === 'b')
  assert.deepEqual(beto?.celdas.map((c) => c.motivo), ['fuera', 'sin neto', null])
  const ana = d.filas.find((f) => f.personaId === 'a')
  assert.deepEqual(ana?.celdas.map((c) => c.valor), [500000, null, 550000])
  assert.equal(ana?.celdas[1].motivo, 'sin total')
})

test('el mensual ocupa su mes en UNA celda con lo pagado de las dos quincenas', () => {
  const mora = armar('pagado').filas.find((f) => f.personaId === 'm')
  assert.deepEqual(mora?.celdas.map((c) => [c.desde, c.span, c.valor]), [
    ['2026-08-01', 2, 1800000], ['2026-08-16', 0, 1800000], ['2026-09-01', 1, 1000000],
  ])
  // Lo que se DIBUJA: sólo las celdas con span > 0 suman, y dan el total de la ficha.
  const dibujado = (mora?.celdas ?? []).filter((c) => c.span > 0).reduce((a, c) => a + (c.valor ?? 0), 0)
  assert.equal(dibujado, mora?.total)
})

test('las columnas del año son sus quincenas agrupadas por mes, sin una de más', () => {
  const meses = mesesDeColumnas(quincenasDelAnio(2026, '2026-09-17'))
  assert.equal(meses.length, 9)
  assert.deepEqual(meses[8], { mes: '2026-09', rotulo: 'sep', quincenas: [quincenaDe('2026-09-01'), quincenaDe('2026-09-16')] })
  assert.equal(meses.flatMap((m) => m.quincenas).length, 18)
  const celdas = celdasDeLaPersona([], meses, 'pagado')
  assert.equal(celdas.length, 18)
  assert.ok(celdas.every((c) => c.motivo === 'fuera' && c.valor === null))
})

test('sin permiso no se arma ninguna fila; la medida desconocida es «pagado»', () => {
  const d = armarRetribucionDelPlantel({
    puedeVer: false, anio: 2026, medida: 'pagado', lecturas: LECTURAS, errores: ['x'],
    personas: [{ personaId: 'a', nombre: 'Ana', cuil: null }], recibosDe: () => [], rotuloDe: () => rotulo,
  })
  assert.deepEqual([d.puedeVer, d.filas, d.errores], [false, [], []])
  assert.equal(medidaDe('liquidado'), 'liquidado')
  assert.equal(medidaDe('cualquiera'), 'pagado')
})

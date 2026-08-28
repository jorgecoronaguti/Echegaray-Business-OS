// EL CONTROL DE LA ASIMETRÍA — y la prueba de que PUEDE decir que no.
//
// LA REGLA QUE GOBIERNA ESTE ARCHIVO: todo control que puede devolver verde necesita un test negativo
// que lo ponga en rojo con una MUTACIÓN mínima. Un control que no puede decir que no es una constante
// disfrazada, y en este repo ya escondió $4,1M. Por eso cada criterio aparece dos veces: el cuadro
// sano que lo deja en verde, y el mismo cuadro con un solo número cambiado que lo pone en rojo.
//
// Las grillas de acá son SINTÉTICAS y están declaradas como tales. Las únicas cifras medidas sobre el
// archivo real son las del test que reproduce noviembre y diciembre de 2026.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  asimetriaDeLaProyeccion, esMesProyectado, mesesDesdeLaPestana,
  RUBROS_NOMINA, RUBRO_JORNALES,
} from './cash-flow-asimetria.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

/** Un mes REAL sintético: la obra ya ocurrió y consumió material. */
const real = (mes, { jornales = 10, materiales = 22, ingreso = 0 } = {}) => ({
  mes,
  egresoRealPorRubro: { [RUBRO_JORNALES]: jornales, 'Materiales Civil': materiales },
  egresoProyectadoPorRubro: {},
  ingresoProyectado: ingreso,
})

/** Un mes PROYECTADO sintético: sale entero de la proyección, nada real adentro. */
const proyectado = (mes, { jornales = 10, materiales = 22, sueldos = 5, ingreso = 100 } = {}) => ({
  mes,
  egresoRealPorRubro: {},
  egresoProyectadoPorRubro: {
    [RUBRO_JORNALES]: jornales,
    'Materiales de obra proyectados': materiales,
    'Nómina · Sueldos administración': sueldos,
  },
  ingresoProyectado: ingreso,
})

/** Un cuadro sano: ocho meses reales y cuatro proyectados con obra y con cobro suficiente. */
const cuadroSano = () => [
  ...Array.from({ length: 8 }, (_, i) => real(`m${i + 1}`)),
  ...Array.from({ length: 4 }, (_, i) => proyectado(`m${i + 9}`)),
]

test('EL CONTROL PUEDE DAR VERDE: un cuadro que proyecta obra y cobro no reporta nada', () => {
  const r = asimetriaDeLaProyeccion(cuadroSano())
  assert.equal(r.ok, true, JSON.stringify(r.hallazgos))
  assert.deepEqual(r.hallazgos, [])
  assert.equal(r.total.cobroFaltante, 0)
  // Si esto diera rojo, el control estaría gritando siempre y dejaría de significar algo.
})

test('MUTACIÓN 1 — materiales proyectados a CERO: el control tiene que ponerse rojo', () => {
  const cuadro = cuadroSano()
  cuadro[9].egresoProyectadoPorRubro['Materiales de obra proyectados'] = 0
  const r = asimetriaDeLaProyeccion(cuadro)
  assert.equal(r.ok, false, 'un mes con jornales y CERO material pasó como bueno')
  const h = r.hallazgos.find((x) => x.tipo === 'obra-sin-material')
  assert.equal(h.mes, 'm10')
  assert.equal(h.jornales, 10)
  // La magnitud es lo que se informa, no un booleano: 10 jornales × el ratio real observado (22/10).
  assert.equal(h.ratio, 2.2)
  assert.equal(h.materialEstimado, 22)
  assert.equal(r.total.materialFaltante, 22)
})

test('MUTACIÓN 2 — el cobro proyectado por debajo de la nómina: el control tiene que ponerse rojo', () => {
  const cuadro = cuadroSano()
  // Nómina proyectada de m11 = 10 jornales + 5 sueldos = 15. Un cobro de 14 no la cubre.
  cuadro[10].ingresoProyectado = 14
  const r = asimetriaDeLaProyeccion(cuadro)
  assert.equal(r.ok, false)
  const h = r.hallazgos.find((x) => x.tipo === 'cobro-no-cubre-nomina')
  assert.deepEqual(
    { mes: h.mes, nomina: h.nomina, ingreso: h.ingreso, faltante: h.faltante },
    { mes: 'm11', nomina: 15, ingreso: 14, faltante: 1 })
  assert.equal(Math.round(h.cobertura * 100) / 100, 0.93)
})

test('EL BORDE NO SE REPORTA: un cobro exactamente igual a la nómina cubre y no es hallazgo', () => {
  const cuadro = cuadroSano()
  cuadro[10].ingresoProyectado = 15
  assert.equal(asimetriaDeLaProyeccion(cuadro).ok, true)
  // Y con el umbral más severo que el dueño quiera, el MISMO mes sí se reporta: el criterio es un
  // parámetro declarado, no una opinión escondida en el código.
  assert.equal(asimetriaDeLaProyeccion(cuadro, { coberturaMinima: 1.5 }).ok, false)
})

test('un mes REAL con cero material NO se reporta: el control mira la proyección, no el pasado', () => {
  const cuadro = cuadroSano()
  cuadro[0].egresoRealPorRubro['Materiales Civil'] = 0
  const r = asimetriaDeLaProyeccion(cuadro)
  assert.equal(r.hallazgos.filter((h) => h.mes === 'm1').length, 0,
    'un mes que ya ocurrió con material cero es un dato de carga, no una proyección imposible')
})

test('el mes EN CURSO —con real y proyectado a la vez— no es un mes proyectado', () => {
  const mixto = {
    mes: 'ago',
    egresoRealPorRubro: { [RUBRO_JORNALES]: 10 },
    egresoProyectadoPorRubro: { [RUBRO_JORNALES]: 5 },
    ingresoProyectado: 0,
  }
  assert.equal(esMesProyectado(mixto), false,
    'su material del mes ya está cargado del lado real: el cero de la proyección no prueba nada')
  assert.equal(asimetriaDeLaProyeccion([mixto]).ok, true)
})

test('SIN meses reales no se inventa un ratio, y el hallazgo sale igual pero sin estimación', () => {
  const solos = [proyectado('nov', { materiales: 0 })]
  const r = asimetriaDeLaProyeccion(solos)
  assert.equal(r.ratio, null, 'dividir por cero jornales publicaría un Infinity con cara de dato')
  const h = r.hallazgos.find((x) => x.tipo === 'obra-sin-material')
  assert.equal(h.materialEstimado, null, 'null es "no se pudo estimar"; un 0 diría "no falta nada"')
  assert.equal(r.total.materialFaltante, null)
})

test('la nómina se deriva de los rubros del libro: un rubro nuevo de nómina entra solo', () => {
  assert.ok(RUBROS_NOMINA.includes(RUBRO_JORNALES))
  assert.ok(RUBROS_NOMINA.includes('Nómina · Cargas sociales'))
  assert.ok(RUBROS_NOMINA.includes('Nómina · SAC'))
  assert.ok(!RUBROS_NOMINA.includes('Materiales Civil'))
  assert.ok(RUBROS_NOMINA.every((r) => r.startsWith('Nómina · ')))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CASO REAL — noviembre y diciembre de 2026, con las cifras leídas del archivo el 28/08/2026
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('el defecto medido: noviembre y diciembre proyectan la cuadrilla y no proyectan la obra', () => {
  // Meses reales ene→ago agregados en uno solo: la referencia del propio cuadro, $248.173.492 de
  // materiales contra $113.561.006 de jornales de obra.
  const eneAgo = {
    mes: 'ene–ago',
    egresoRealPorRubro: { [RUBRO_JORNALES]: 113561006, 'Materiales Civil': 248173492 },
    egresoProyectadoPorRubro: {},
    ingresoProyectado: 0,
  }
  const nov = {
    mes: 'nov 26',
    egresoRealPorRubro: {},
    egresoProyectadoPorRubro: {
      [RUBRO_JORNALES]: 22049666,
      'Nómina · Sueldos administración': 13339127,
      'Nómina · Cargas sociales': 10510564,
      'Nómina · Gremiales': 2487136,
      'Materiales Civil': 0,
      'Materiales de obra proyectados': 0,
    },
    ingresoProyectado: 24727867,
  }
  const dic = {
    mes: 'dic 26',
    egresoRealPorRubro: {},
    egresoProyectadoPorRubro: {
      [RUBRO_JORNALES]: 23142262,
      'Nómina · Sueldos administración': 13592571,
      'Nómina · Cargas sociales': 10107193,
      'Nómina · Gremiales': 2392286,
      'Nómina · SAC': 8500000,
      'Materiales Civil': 0,
      'Materiales de obra proyectados': 0,
    },
    ingresoProyectado: 19219578,
  }
  const r = asimetriaDeLaProyeccion([eneAgo, nov, dic])
  assert.equal(r.ok, false)
  assert.equal(Math.round(r.ratio.valor * 100) / 100, 2.19, '2,19 pesos de material por peso de jornal')
  assert.deepEqual(r.hallazgos.map((h) => `${h.tipo}·${h.mes}`), [
    'obra-sin-material·nov 26', 'cobro-no-cubre-nomina·nov 26',
    'obra-sin-material·dic 26', 'cobro-no-cubre-nomina·dic 26',
  ])
  // La nómina de noviembre son los $48.386.493 que publica el cuadro, y el cobro contratado cubre
  // apenas la mitad: eso es un piso, no un pronóstico.
  const covNov = r.meses.find((m) => m.mes === 'nov 26')
  assert.equal(covNov.nomina, 48386493)
  assert.equal(Math.round(covNov.cobertura * 100) / 100, 0.51)
  assert.equal(r.meses.find((m) => m.mes === 'dic 26').nomina, 57734312)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL LECTOR — verifica el rótulo antes de creerle a la fila
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** El rectángulo que devolvería la pestaña, armado desde el `meta` que la escribió. */
function pestanaFalsa(valorPorRubro = () => 0) {
  const { meta } = grillaMeses({ anio: 2026, refs: {} })
  const filas = []
  const poner = (f, c, v) => { (filas[f - 1] || (filas[f - 1] = []))[c] = v }
  for (const b of meta.bloques) {
    for (const r of b.rubros) {
      poner(r.fila, 0, `    · ${r.rubro}`)
      for (let j = 0; j < meta.cab.n; j++) poner(r.fila, meta.cab.col0 + j, valorPorRubro(b.clave, r.rubro, j))
    }
    for (let j = 0; j < meta.cab.n; j++) poner(b.subtotal, meta.cab.col0 + j, 0)
  }
  return { filas, meta }
}

test('el lector arma un mes por columna y verifica el rótulo de cada rubro', () => {
  const { filas, meta } = pestanaFalsa((clave, rubro) => (clave === 'egresoProyectado' && rubro === RUBRO_JORNALES ? 7 : 0))
  const { meses, problemas } = mesesDesdeLaPestana(filas, meta)
  assert.deepEqual(problemas, [])
  assert.equal(meses.length, 12)
  assert.equal(meses[0].egresoProyectadoPorRubro[RUBRO_JORNALES], 7)
  assert.equal(meses[0].mes, meta.rotulos[0])
})

test('UN RÓTULO CORRIDO NO SE LEE COMO CERO: se reporta, porque el cero es justo el hallazgo', () => {
  const { filas, meta } = pestanaFalsa()
  const b = meta.bloques.find((x) => x.clave === 'egresoProyectado')
  filas[b.rubros[0].fila - 1][0] = '    · Otro rótulo cualquiera'
  const { meses, problemas } = mesesDesdeLaPestana(filas, meta)
  assert.equal(problemas.length, 1, JSON.stringify(problemas))
  assert.ok(problemas[0].includes(b.rubros[0].rubro))
  assert.equal(meses[0].egresoProyectadoPorRubro[b.rubros[0].rubro], undefined,
    'un rubro que no se pudo leer queda ausente, no en cero')
})

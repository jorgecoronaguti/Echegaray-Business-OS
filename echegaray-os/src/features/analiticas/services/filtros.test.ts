import test from 'node:test'
import assert from 'node:assert/strict'
import { aUrl, apartado, cuantosApartados, DEFECTO, leerFiltros, leerPeriodo, rangoDe, rangoParaVista, razonNoAplica, redireccionDe, VISTAS } from './filtros.ts'

test('sin parámetros abre Resumen, y la URL de los defectos es la ruta pelada', () => {
  const f = leerFiltros({})
  assert.equal(f.vista, 'resumen')
  assert.equal(f.estado, 'curso')
  assert.deepEqual(f.obras, [])
  assert.equal(aUrl(f), '/analiticas')
  assert.equal(cuantosApartados(f), 0)
  assert.equal(redireccionDe({}), null)
})

test('las cinco vistas, en el orden que confirmó el dueño', () => {
  assert.deepEqual(VISTAS.map((v) => v.rotulo), ['Resumen', 'Obras', 'Caja', 'Nómina', 'Cobranza'])
})

test('las vistas retiradas redirigen: las de una obra a Obras, «Estado del gasto» e inválidas a Resumen', () => {
  for (const v of ['contrato', 'obra', 'hora']) {
    assert.equal(leerFiltros({ vista: v }).vista, 'obras')
    assert.equal(redireccionDe({ vista: v }), '/analiticas?vista=obras')
  }
  assert.equal(leerFiltros({ vista: 'estado' }).vista, 'resumen')
  assert.equal(redireccionDe({ vista: 'estado', estado: 'todas' }), '/analiticas?estado=todas')
  assert.equal(redireccionDe({ vista: 'margen' }), '/analiticas')
  assert.equal(redireccionDe({ vista: 'caja' }), null, 'una vista vigente no redirige')
})

test('la URL sólo lleva lo que se aparta del defecto, y vuelve a leerse igual', () => {
  const f = leerFiltros({ vista: 'obras', periodo: '2026-08-01..2026-08-31', estado: 'todas', obras: 'quattropani,le-comedor', obra: 'quattropani' })
  const url = aUrl(f)
  assert.equal(url, '/analiticas?vista=obras&obra=quattropani&periodo=2026-08-01..2026-08-31&estado=todas&obras=quattropani,le-comedor')
  const again = leerFiltros(Object.fromEntries(new URL(url, 'http://x').searchParams))
  assert.deepEqual(again, f)
  assert.equal(cuantosApartados(f), 3)
})

test('lo que la URL trae mal no llega a la base: fecha imposible, rango invertido, slug con SQL', () => {
  assert.deepEqual(leerFiltros({ periodo: '2026-02-30..2026-03-01' }).periodo, { tipo: 'preset', preset: 'inicio' })
  assert.deepEqual(leerFiltros({ periodo: '2026-09-01..2026-08-01' }).periodo, { tipo: 'preset', preset: 'inicio' })
  assert.deepEqual(leerFiltros({ obras: "x';drop table obras;--,quattropani" }).obras, ['quattropani'])
  assert.equal(leerFiltros({ obra: "x';--" }).obra, null)
})

test('la obra elegida es de la vista Obras: no viaja a otra', () => {
  assert.equal(aUrl(leerFiltros({ vista: 'caja', obra: 'quattropani' })), '/analiticas?vista=caja')
})

test('los presets son el período en curso hasta hoy, inclusive', () => {
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'mes' }, '2026-09-17'), { desde: '2026-09-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'tri' }, '2026-09-17'), { desde: '2026-07-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'tri' }, '2026-01-02'), { desde: '2026-01-01', hasta: '2026-01-02' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'anio' }, '2026-09-17'), { desde: '2026-01-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'inicio' }, '2026-09-17'), { desde: null, hasta: null })
})

test('Resumen y Obras son acumuladas: el período no viaja a la base aunque esté puesto', () => {
  const f = leerFiltros({ vista: 'resumen', periodo: 'mes' })
  assert.deepEqual(rangoParaVista(f, '2026-09-17'), { desde: null, hasta: null })
  assert.ok(razonNoAplica('resumen', 'periodo'))
  assert.ok(razonNoAplica('obras', 'periodo'))
  assert.deepEqual(rangoParaVista({ ...f, vista: 'obras' }, '2026-09-17'), { desde: null, hasta: null })
  assert.equal(razonNoAplica('caja', 'periodo'), null)
  assert.deepEqual(rangoParaVista({ ...f, vista: 'caja' }, '2026-09-17'), { desde: '2026-09-01', hasta: '2026-09-17' })
})

test('estado y obras no aplican a Caja, Nómina ni Cobranza; el período sí, salvo en Nómina', () => {
  for (const v of ['caja', 'nomina', 'cobranza'] as const) {
    assert.ok(razonNoAplica(v, 'estado'))
    assert.ok(razonNoAplica(v, 'obras'))
  }
  assert.equal(razonNoAplica('caja', 'periodo'), null)
  assert.equal(razonNoAplica('cobranza', 'periodo'), null)
  // NÓMINA NO: es el año calendario entero (dueño, 22/09/2026), y el rango no viaja a la base.
  assert.ok(razonNoAplica('nomina', 'periodo'))
  assert.deepEqual(rangoParaVista({ ...DEFECTO, vista: 'nomina', periodo: { tipo: 'preset', preset: 'mes' } }, '2026-09-22'),
    { desde: null, hasta: null })
  assert.equal(apartado(leerFiltros({ obras: 'quattropani' }), 'obras'), true)
})

test('los atajos de Caja: mes anterior es un mes cerrado y los últimos 30 días incluyen hoy', () => {
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'mesAnt' }, '2026-09-18'), { desde: '2026-08-01', hasta: '2026-08-31' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'mesAnt' }, '2026-01-10'), { desde: '2025-12-01', hasta: '2025-12-31' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: '30d' }, '2026-09-18'), { desde: '2026-08-20', hasta: '2026-09-18' })
  assert.equal(leerPeriodo('mesAnt').tipo, 'preset')
  assert.equal(aUrl({ ...DEFECTO, vista: 'caja', periodo: { tipo: 'preset', preset: '30d' } }), '/analiticas?vista=caja&periodo=30d')
})

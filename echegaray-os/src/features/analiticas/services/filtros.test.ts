import test from 'node:test'
import assert from 'node:assert/strict'
import { aUrl, apartado, cuantosApartados, leerFiltros, rangoDe, rangoParaVista, razonNoAplica } from './filtros.ts'

test('sin parámetros son los defectos, y la URL de los defectos es la ruta pelada', () => {
  const f = leerFiltros({})
  assert.equal(f.vista, 'estado')
  assert.equal(f.estado, 'curso')
  assert.deepEqual(f.obras, [])
  assert.equal(aUrl(f), '/analiticas')
  assert.equal(cuantosApartados(f), 0)
})

test('la URL sólo lleva lo que se aparta del defecto, y vuelve a leerse igual', () => {
  const f = leerFiltros({ vista: 'obra', periodo: '2026-08-01..2026-08-31', estado: 'todas', obras: 'quattropani,le-comedor', orden: 'pct' })
  const url = aUrl(f)
  assert.equal(url, '/analiticas?vista=obra&orden=pct&periodo=2026-08-01..2026-08-31&estado=todas&obras=quattropani,le-comedor')
  const again = leerFiltros(Object.fromEntries(new URL(url, 'http://x').searchParams))
  assert.deepEqual(again, f)
  assert.equal(cuantosApartados(f), 3)
})

test('lo que la URL trae mal no llega a la base: fecha imposible, rango invertido, slug con SQL', () => {
  assert.deepEqual(leerFiltros({ periodo: '2026-02-30..2026-03-01' }).periodo, { tipo: 'preset', preset: 'inicio' })
  assert.deepEqual(leerFiltros({ periodo: '2026-09-01..2026-08-01' }).periodo, { tipo: 'preset', preset: 'inicio' })
  assert.deepEqual(leerFiltros({ obras: "x';drop table obras;--,quattropani" }).obras, ['quattropani'])
  assert.equal(leerFiltros({ vista: 'margen' }).vista, 'estado')
})

test('cliente y orden son de su vista: no viajan a otra', () => {
  const f = leerFiltros({ vista: 'caja', cliente: 'messina', orden: 'pct' })
  assert.equal(aUrl(f), '/analiticas?vista=caja')
})

test('los presets son el período en curso hasta hoy, inclusive', () => {
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'mes' }, '2026-09-17'), { desde: '2026-09-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'tri' }, '2026-09-17'), { desde: '2026-07-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'tri' }, '2026-01-02'), { desde: '2026-01-01', hasta: '2026-01-02' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'anio' }, '2026-09-17'), { desde: '2026-01-01', hasta: '2026-09-17' })
  assert.deepEqual(rangoDe({ tipo: 'preset', preset: 'inicio' }, '2026-09-17'), { desde: null, hasta: null })
})

test('las vistas acumuladas NO mandan el período a la base aunque esté puesto', () => {
  const f = leerFiltros({ vista: 'resumen', periodo: 'mes' })
  assert.deepEqual(rangoParaVista(f, '2026-09-17'), { desde: null, hasta: null })
  assert.ok(razonNoAplica('resumen', 'periodo'))
  assert.ok(razonNoAplica('contrato', 'periodo'))
  assert.equal(razonNoAplica('obra', 'periodo'), null)
  assert.deepEqual(rangoParaVista({ ...f, vista: 'obra' }, '2026-09-17'), { desde: '2026-09-01', hasta: '2026-09-17' })
})

test('estado y obras no aplican a Nómina ni a Cobranza; el período sí', () => {
  for (const v of ['nomina', 'cobranza'] as const) {
    assert.ok(razonNoAplica(v, 'estado'))
    assert.ok(razonNoAplica(v, 'obras'))
    assert.equal(razonNoAplica(v, 'periodo'), null)
  }
  assert.equal(apartado(leerFiltros({ obras: 'quattropani' }), 'obras'), true)
})

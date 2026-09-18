import test from 'node:test'
import assert from 'node:assert/strict'
import { leerConsumoMensual, mesesCerrados, mesesParaAgotar, ritmoPorObra } from './consumo.ts'

const fila = (obra_id: string, mes: string | null, extra: Record<string, unknown> = {}) => ({ obra_id, mes, ...extra })

test('la ventana son los tres meses CERRADOS anteriores al de hoy, también cruzando el año', () => {
  assert.deepEqual(mesesCerrados('2026-09-17'), ['2026-06', '2026-07', '2026-08'])
  assert.deepEqual(mesesCerrados('2026-02-01'), ['2025-11', '2025-12', '2026-01'])
})

test('lo consumido por rubro: filas de `costo_de_obras_por_rubro` a un mapa por obra; el rubro sin fila queda null, no 0', async () => {
  const { leerConsumoPorRubro } = await import('./consumo.ts')
  assert.equal(leerConsumoPorRubro(null), null)
  const m = leerConsumoPorRubro([
    { obra_id: 'a', rubro: 'mano_obra', monto: '10', monto_estimado: '4', n: 2, detalle: [{ grupo: '01/08 a 15/08/26', n: 3, monto: 6, horas: 100, estimado: true, horas_sin_dato: null }] },
    { obra_id: 'a', rubro: 'subcontratistas', monto: 5, n: 1, detalle: [{ grupo: 'Pedro Fredes', n: 1, monto: 5 }] },
    { obra_id: 'a', rubro: 'inventado', monto: 5, n: 1, detalle: [] },
    { obra_id: '', rubro: 'otros', monto: 5, n: 1, detalle: [] },
  ])!
  const a = m.get('a')!
  assert.equal(a.manoObra?.monto, 10)
  assert.equal(a.manoObra?.estimado, 4)
  assert.equal(a.manoObra?.detalle[0].horas, 100)
  assert.equal(a.subcontratos?.detalle[0].grupo, 'Pedro Fredes')
  assert.equal(a.materiales, null)
  assert.equal(a.otros, null)
  assert.equal(m.size, 1)
})

test('no se pudo leer ≠ no hay consumo; filas sin obra se descartan; mes sin fecha queda null', () => {
  assert.equal(leerConsumoMensual(null), null)
  assert.deepEqual(leerConsumoMensual([]), [])
  const f = leerConsumoMensual([fila('a', '2026-08-01', { materiales: '10' }), fila('', '2026-08-01'), fila('b', null, { materiales: 3 })])!
  assert.deepEqual(f.map((x) => [x.obraId, x.mes, x.materiales]), [['a', '2026-08', 10], ['b', null, 3]])
})

test('el mes en curso NO entra al ritmo: medio mes bajaría el promedio sin que nadie frene', () => {
  const f = leerConsumoMensual([
    fila('a', '2026-06-01', { materiales: 30 }), fila('a', '2026-07-01', { mano_obra: 30 }),
    fila('a', '2026-08-01', { subcontratos: 30 }), fila('a', '2026-09-01', { materiales: 1 }),
  ])!
  assert.equal(ritmoPorObra(f, '2026-09-17').get('a')?.porMes, 30)
})

test('un mes de la ventana sin consumo cuenta como cero; una obra que arrancó dentro se divide por los meses que lleva', () => {
  const vieja = leerConsumoMensual([fila('a', '2026-01-01', { materiales: 1 }), fila('a', '2026-08-01', { materiales: 90 })])!
  assert.equal(ritmoPorObra(vieja, '2026-09-17').get('a')?.porMes, 30)
  const nueva = leerConsumoMensual([fila('b', '2026-08-01', { materiales: 90 })])!
  assert.equal(ritmoPorObra(nueva, '2026-09-17').get('b')?.porMes, 90)
})

test('sin consumo en la ventana no hay ritmo (null, no cero); la mano de obra estimada se marca', () => {
  const f = leerConsumoMensual([fila('a', '2026-01-01', { materiales: 50 }), fila('b', '2026-08-01', { mano_obra: 10, mano_obra_estimada: 4 })])!
  const r = ritmoPorObra(f, '2026-09-17')
  assert.equal(r.get('a')?.porMes, null)
  assert.equal(r.get('b')?.conEstimada, true)
  assert.equal(r.get('a')?.conEstimada, false)
})

test('meses para agotar: sólo con las dos patas; pasada = 0', () => {
  assert.equal(mesesParaAgotar(90, 30), 3)
  assert.equal(mesesParaAgotar(-5, 30), 0)
  assert.equal(mesesParaAgotar(null, 30), null)
  assert.equal(mesesParaAgotar(90, null), null)
  assert.equal(mesesParaAgotar(90, 0), null)
})

test('«alcanza» con los mismos rubros que el «queda»: entrepiso sólo cotizó MO, su ritmo no cuenta materiales', async () => {
  const { rubrosComparables } = await import('./obras.ts')
  const f = leerConsumoMensual([
    fila('entrepiso-y-escalera', '2026-08-01', { mano_obra: 30, materiales: 900, subcontratos: 60 }),
    fila('entrepiso-y-escalera', '2026-07-01', { mano_obra: 30 }),
    fila('entrepiso-y-escalera', '2026-06-01', { mano_obra: 30 }),
  ])!
  const soloMO = rubrosComparables({ manoObra: 3829741.63, materiales: null, subcontratos: null, otros: null })
  assert.deepEqual(soloMO, ['manoObra'])
  assert.equal(ritmoPorObra(f, '2026-09-17', soloMO).get('entrepiso-y-escalera')?.porMes, 30)
  assert.equal(ritmoPorObra(f, '2026-09-17').get('entrepiso-y-escalera')?.porMes, 350, 'sin rubros, todo lo consumido: (990 + 30 + 30) ÷ 3')
  assert.deepEqual(rubrosComparables({ manoObra: 1, materiales: 1, subcontratos: null, otros: null }), ['manoObra', 'materiales'], 'cada rubro contra el suyo: subcontratistas sin presupuesto no entra')
})

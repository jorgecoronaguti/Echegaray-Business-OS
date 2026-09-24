import test from 'node:test'
import assert from 'node:assert/strict'
import { NOMBRES_PUENTE, serieDelPuente, formulaDelPuente, ubicarNomina, cuadroPuente, ROTULO_PUENTE } from './nomina-puente.mjs'
import { deJornalesQuincenas, deOficina } from './libro-extractores-nomina.mjs'
import { deCargasSociales } from './libro-extractores-cargas.mjs'

// Serial de Sheets de una fecha ISO (días desde 1899-12-30).
const serial = (iso) => Math.round((Date.UTC(...iso.split('-').map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(1899, 11, 30)) / 86400000)
const col = (arr) => arr.map((v) => [v])
const doce = (f) => Array.from({ length: 12 }, (_, i) => f(i))

test('la fórmula del puente va en es_AR y reparte el mes entre sus quincenas', () => {
  assert.equal(formulaDelPuente(NOMBRES_PUENTE.jornales, 10, 2), '=INDEX(NOMINA_CF_JORNALES;1;10)/2')
  assert.equal(formulaDelPuente(NOMBRES_PUENTE.oficina, 9), '=INDEX(NOMINA_CF_OFICINA;1;9)')
  assert.throws(() => formulaDelPuente('OTRO', 1))
  assert.throws(() => formulaDelPuente(NOMBRES_PUENTE.f931, 13))
})

test('la serie del puente: doce importes, nunca negativos; sin rango, null (vuelve la proyección de antes)', () => {
  assert.deepEqual(serieDelPuente([[1, -5, 'x', 2.555]]).slice(0, 4), [1, 0, 0, 2.56])
  assert.equal(serieDelPuente([[1, 2]]).length, 12)
  assert.equal(serieDelPuente(null), null)
})

test('Nómina se ubica por rótulo y el cuadro 6 apunta a sus filas', () => {
  const g = []
  g[3] = ['Parámetros']; g[7] = ['1 · NÓMINA 2026 · COBRADO Y PROYECTADO POR PERSONA']; g[8] = ['Persona']
  g[9] = ['Aguero']; g[26] = ['Desvinculados en el año']; g[27] = ['Oficina']; g[28] = ['TOTAL']
  g[33] = ['2 · CARGAS SOCIALES POR EMPLEADO']; g[55] = ['TOTAL']; g[75] = ['TOTAL DIRECCIÓN']; g[88] = ['x']
  const u = ubicarNomina(g)
  assert.deepEqual(u.falta, [])
  assert.equal(u.filaParametros, 5); assert.equal(u.primeraPersona, 10); assert.equal(u.ultimaPersona, 26)
  assert.equal(u.filaOficina, 28); assert.equal(u.filaTotal, 29); assert.equal(u.filaTotalCargas, 56); assert.equal(u.filaDireccion, 76)
  const c = cuadroPuente(u)
  assert.equal(c.filaInicio, 92) // al pie, dos filas libres debajo de la última usada (89)
  assert.equal(c.filas[0][0], ROTULO_PUENTE)
  assert.match(c.filas[2][3], /^=MAX\(0;N\(D\$29\)-N\(D\$28\)-SUMPRODUCT/)
  assert.match(c.filas[6][14], /N\(O\$56\)-N\(O97\)/) // gremiales = total de cargas − F931 (fila 97)
  assert.deepEqual(ubicarNomina([['nada']]).falta.length > 0, true)
})

test('jornales: lo que falta del mes según Nómina se reparte entre las quincenas proyectadas de ese mes', () => {
  const nomina = doce((i) => (i === 9 ? 20_000_000 : i === 8 ? 12_000_000 : 0))
  const proy = {
    pago: col([serial('2026-10-01'), serial('2026-10-16'), serial('2026-11-02')]),
    hasta: col([serial('2026-09-30'), serial('2026-10-15'), serial('2026-10-31')]),
    total: col([7_000_000, 13_000_000, 7_000_000]),
  }
  const out = deJornalesQuincenas({ proyectadas: proy }, serial('2026-09-24'), { nomina, aviso: () => {} })
  assert.deepEqual(out.map((m) => m.importe), [12_000_000, 10_000_000, 10_000_000])
  assert.deepEqual(out.map((m) => m.importeNomina), ['=INDEX(NOMINA_CF_JORNALES;1;9)', '=INDEX(NOMINA_CF_JORNALES;1;10)/2', '=INDEX(NOMINA_CF_JORNALES;1;10)/2'])
  // Sin puente, lo de antes: la planilla de jornales, sin fórmula.
  const viejo = deJornalesQuincenas({ proyectadas: proy }, serial('2026-09-24'), { aviso: () => {} })
  assert.deepEqual(viejo.map((m) => m.importe), [7_000_000, 13_000_000, 7_000_000])
  assert.equal(viejo[0].importeNomina, undefined)
})

test('oficina: el mes sin pagar toma lo de Nómina; el pagado en parte deja el resto con fórmula', () => {
  const pago = col(doce((i) => serial(`2026-${String(i + 2 > 12 ? 12 : i + 2).padStart(2, '0')}-01`)))
  const pagado = col(doce((i) => (i === 8 ? 1_000_000 : '')))
  const proyectado = col(doce(() => 3_000_000))
  const nomina = doce((i) => (i === 8 ? 2_606_800 : i === 9 ? 3_606_800 : 0)) // septiembre: ya restado lo pagado
  const out = deOficina({ pago, pagado, proyectado, pactado: col(doce(() => null)) }, serial('2026-09-24'), { nomina })
  const oct = out.find((m) => m.importeNomina === '=INDEX(NOMINA_CF_OFICINA;1;10)')
  assert.equal(oct.importe, 3_606_800)
  const restoSep = out.find((m) => m.importeNomina === '=INDEX(NOMINA_CF_OFICINA;1;9)')
  assert.equal(restoSep.importe, 2_606_800)
})

test('cargas: el «declarado» que repite la proyección es proyección y toma Nómina; una DDJJ distinta gana', () => {
  const fechas = [doce((i) => serial(`${i === 11 ? 2027 : 2026}-${String(i === 11 ? 1 : i + 2).padStart(2, '0')}-10`))]
  const proyPropia = doce((i) => (i >= 8 ? 7_000_000 : ''))
  const declarado = doce((i) => (i < 8 ? 8_000_000 : i === 9 ? 9_999_999 : 7_000_000)) // oct con DDJJ «real» distinta
  const nomina = { f931: doce((i) => (i >= 8 ? 10_000_000 : 0)), gremiales: doce(() => 0) }
  const out = deCargasSociales({ fechas, f931: [proyPropia], gremiales: [doce(() => '')], declarado: [declarado], gremialesDeclarado: [doce(() => '')] },
    serial('2026-09-24'), { nomina, aviso: () => {} })
  const sep = out.find((m) => /nómina de sep-26/.test(m.concepto))
  assert.equal(sep.importe, 10_000_000)
  assert.equal(sep.estado, 'PROYECTADO')
  assert.equal(sep.importeFormula, '=INDEX(NOMINA_CF_F931;1;9)')
  const oct = out.find((m) => /nómina de oct-26/.test(m.concepto))
  assert.equal(oct.importe, 9_999_999) // la DDJJ manda
  assert.equal(oct.importeFormula, '=INDEX(CARGAS_MES_F931_DECLARADO;1;10)') // la DDJJ, viva a su celda
})

test('cargas vivas: la fecha apunta a CARGAS_MES_FECHAS; la DDJJ al declarado (menos lo que cubrió el banco); la proyección a Nómina', async () => {
  const { vivoDeCargas } = await import('./nomina-puente.mjs')
  const mov = Object.freeze({ importe: 100, estado: 'COMPROMETIDO' })
  const decl = vivoDeCargas(mov, { b: { que: 'F931', puente: 'NOMINA_CF_F931' }, o: { estado: 'COMPROMETIDO', importe: 100 }, neto: { importe: 100, parcial: false }, i: 7 })
  assert.equal(decl.importeFormula, '=INDEX(CARGAS_MES_F931_DECLARADO;1;8)')
  assert.equal(decl.fechaFormula, '=INDEX(CARGAS_MES_FECHAS;1;8)')
  const parcial = vivoDeCargas(mov, { b: { que: 'gremiales', puente: null }, o: { estado: 'COMPROMETIDO', importe: 2374397.18 }, neto: { importe: 219055.92, parcial: true }, i: 7 })
  assert.equal(parcial.importeFormula, '=MAX(0;INDEX(CARGAS_MES_GREMIALES_DECLARADO;1;8)-2155341.26)')
  const proy = vivoDeCargas(mov, { b: { que: 'F931', puente: 'NOMINA_CF_F931' }, o: { estado: 'PROYECTADO', importe: 5 }, neto: { importe: 5, parcial: false }, i: 9 })
  assert.equal(proy.importeFormula, '=INDEX(NOMINA_CF_F931;1;10)')
  assert.equal(vivoDeCargas(mov, { b: { que: 'F931' }, o: { estado: 'PROYECTADO', importe: 1 }, neto: { importe: 1 }, i: 12 }), mov)
})

test('jornales y oficina: la fecha del libro apunta a «Se paga el» de Jornales por Quincena', () => {
  const proy = { pago: col([serial('2026-10-16')]), hasta: col([serial('2026-10-15')]), total: col([1]) }
  const [q] = deJornalesQuincenas({ proyectadas: proy }, serial('2026-09-24'), { nomina: doce((i) => (i === 9 ? 2 : 0)), aviso: () => {} })
  assert.equal(q.fechaFormula, '=INDEX(JORNALES_PROY_PAGO;1;1)')
  const pago = col(doce((i) => serial(`2026-${String(Math.min(i + 2, 12)).padStart(2, '0')}-01`)))
  const out = deOficina({ pago, pagado: col(doce(() => '')), proyectado: col(doce(() => 1)), pactado: col(doce(() => null)) }, serial('2026-09-24'), { nomina: doce((i) => (i === 9 ? 5 : 0)) })
  assert.equal(out.find((m) => m.importeNomina === '=INDEX(NOMINA_CF_OFICINA;1;10)').fechaFormula, '=INDEX(OFICINA_PAGO;10;1)')
})

test('SAC vivo: 50% del mejor mes DEVENGADO del semestre según Nómina, con fórmula al total de cada mes', async () => {
  const { sacDesdeNomina } = await import('./nomina-puente.mjs')
  const mov = Object.freeze({ importe: 13_402_838, estado: 'PROYECTADO', origen: { fila: 'semestre 2' } })
  const total = doce((i) => (i === 9 ? 24_597_797 : i >= 6 ? 20_000_000 : 1))
  const s = sacDesdeNomina(mov, total)
  assert.equal(s.importe, 12_298_898.5)
  assert.equal(s.importeFormula, '=MAX(INDEX(NOMINA_MES_TOTAL;1;7);INDEX(NOMINA_MES_TOTAL;1;8);INDEX(NOMINA_MES_TOTAL;1;9);INDEX(NOMINA_MES_TOTAL;1;10);INDEX(NOMINA_MES_TOTAL;1;11);INDEX(NOMINA_MES_TOTAL;1;12))/2')
  assert.equal(sacDesdeNomina({ ...mov, estado: 'REAL' }, total).importeFormula, undefined) // lo pagado no se toca
  assert.equal(sacDesdeNomina(mov, null), mov) // sin Nómina, lo de antes
})

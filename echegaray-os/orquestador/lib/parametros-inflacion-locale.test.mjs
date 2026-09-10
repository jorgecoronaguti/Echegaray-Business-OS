import test from 'node:test'
import assert from 'node:assert/strict'
import { ar, filasBloque } from '../scripts/parametros-inflacion.mjs'
import { indicesCompletos } from './reglas-de-oro.mjs'

// EL DEFECTO QUE ATRAPA (medido el 10/09/2026 contra `public.sheet_tab_firma`).
//
// `ar()` escribía «9/1/2026» para septiembre de 2026 —mes/día/año— y el Sheet, que está en es-AR, lo
// guardó como el 9 DE ENERO. Las cuatro filas del bloque de índices valen 46031..46034: 9, 10, 11 y
// 12 de enero. Consecuencia: el `MATCH(EOMONTH(...))` de las tres proyecciones no encuentra ningún
// mes de septiembre a diciembre, cae en el `IFERROR(…;1)` y el archivo proyecta a peso constante
// mientras el auditor informa «ajusta por inflación en 144 fórmulas».
//
// El único control que lo dijo —«la tabla llega hasta enero»— se leyó dos veces como un error suyo.

/** Cómo lee Google una celda con forma de fecha en un archivo es-AR: DÍA primero. */
const comoLoLeeElSheet = (texto) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto)
  assert.ok(m, `"${texto}" no tiene forma de fecha`)
  return { dia: Number(m[1]), mes: Number(m[2]), anio: Number(m[3]) }
}

test('el período se escribe DÍA/MES/AÑO — el archivo es es-AR', () => {
  assert.deepEqual(comoLoLeeElSheet(ar('2026-09')), { dia: 1, mes: 9, anio: 2026 })
  assert.deepEqual(comoLoLeeElSheet(ar('2026-12')), { dia: 1, mes: 12, anio: 2026 })
  // El caso que el defecto hacía indistinguible: enero es el mes 1, no el día 1 de otro mes.
  assert.deepEqual(comoLoLeeElSheet(ar('2026-01')), { dia: 1, mes: 1, anio: 2026 })
})

test('los cuatro meses del bloque NO caen todos en enero', () => {
  const indices = ['2026-09', '2026-10', '2026-11', '2026-12']
    .map((periodo) => ({ periodo, variacion: 0.018, tipo: 'proyección', fuente: 'REM BCRA' }))
  const meses = filasBloque(indices).map((f) => comoLoLeeElSheet(f[0]).mes)
  assert.deepEqual(meses, [9, 10, 11, 12], 'con el defecto daban [1,1,1,1]: cuatro días de enero')
})

test('y el auditor de reglas de oro vuelve a decir que la tabla llega a diciembre', () => {
  const filas = ['2026-09', '2026-10', '2026-11', '2026-12']
    .map((p) => [ar(p), 0.018, 1, 'proyección · REM BCRA'])
  const i = indicesCompletos(filas, new Date(2026, 11, 1))
  assert.equal(i.meses, 4)
  assert.equal(i.cubreHasta.getMonth(), 11, 'diciembre')
  assert.ok(i.alcanza, 'la tabla cubre hasta fin de año')
})

test('con el bloque como está HOY en el archivo, el aviso es verdadero y trae la celda cruda', () => {
  // Las cuatro celdas reales, tal como quedaron escritas (mes/día/año contra un archivo es-AR).
  const filas = [['9/1/2026', 0.018, 1, 'REM BCRA'], ['10/1/2026', 0.017, 1, 'REM BCRA'],
    ['11/1/2026', 0.017, 1, 'REM BCRA'], ['12/1/2026', 0.018, 1, 'REM BCRA']]
  const i = indicesCompletos(filas, new Date(2026, 11, 1))
  assert.equal(i.cubreHasta.getMonth(), 0, 'las cuatro caen en enero: el aviso NO era un falso positivo')
  assert.equal(i.alcanza, false)
  assert.equal(i.ultimoCrudo, '12/1/2026', 'el hallazgo viaja con la celda que lo produjo')
})

// EL GIRO BANCARIO DEL MES — agosto con el extracto REAL, y septiembre con el corte simulado al 02/10.
//
// Los débitos de abajo son las filas de `_BANCO_RAW` (lectura del 25/09/2026) del 28/08 al 17/09:
// copiadas tal cual, sin redondear. Lo que se prueba es lo que el dueño pidió: agosto tiene que dar
// PAGADO sin la carga manual de `_PAGOS_NO_COMPRA_RAW`, y septiembre no puede publicar $12,6 M de
// VENCIDO si el giro del mes está en el banco — ni esconder la deuda si no está.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  giroDelMes, finDeMesSerial, formulaGiroOficinaN, formulaGiroDireccionN, formulaPagadoOficinaConGiro,
  formulaPagadoDireccionConGiro, UMBRAL_HABER_OFICINA,
} from './nomina-giro-banco.mjs'
import { deOficina, deDireccion } from './libro-extractores-nomina.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

const S = 'Sueldos'
const T = 'Transferencias a proveedores'
const d = (a, m, dd, concepto, importe, naturaleza) => ({ fecha: serialDe(a, m, dd), concepto, importe, naturaleza })
// _BANCO_RAW f502–f524 (lote 260828507 y 260831507) y los retiros de septiembre (f571, f609, f650).
const AGOSTO = [
  d(2026, 8, 25, 'Debito transf. online banking emp - A ana laura echegaray ovi / - var', 150000, T),
  d(2026, 8, 28, 'Pago haberes - 260828507 260828507', 200000, S),
  d(2026, 8, 28, 'Pago haberes - 260828507 260828507', 300000, S),
  d(2026, 8, 28, 'Pago haberes - 260828507 260828507', 300000, S),
  d(2026, 8, 31, 'Pago de haberes por cci - &&000000000000001', 215564.62, S),
  d(2026, 8, 31, 'Pago haberes - 260831507 260831507', 230240.12, S),
  d(2026, 8, 31, 'Pago haberes - 260831507 260831507', 663141.56, S),
  d(2026, 8, 31, 'Pago haberes - 260831507 260831507', 192887.48, S),
  d(2026, 8, 31, 'Pago haberes - 260831507 260831507', 663141.56, S),
  d(2026, 9, 9, 'Debito transf. online banking emp - A rodrigo alejandro j ech / - var / 20355074', 1000000, T),
  d(2026, 9, 11, 'Debito transf. online banking emp - A ana laura echegaray ovi / - var', 300000, T),
  d(2026, 9, 15, 'Pago haberes - 260915507 260915507', 200000, S),
  d(2026, 9, 17, 'Debito transf. online banking emp - A ana laura echegaray ovi / - var', 500000, T),
]
const CORTE_2409 = serialDe(2026, 9, 24)
const CORTE_0210 = serialDe(2026, 10, 2)
// Doce renglones (enero..diciembre); sólo se llena el mes que se prueba.
const doce = (i, v) => Array.from({ length: 12 }, (_, k) => (k === i ? v : ''))
const pagoDe = (mes) => serialDe(2026, mes + 1, 1)

test('OFICINA agosto: el giro son los DOS haberes de $663.141,56 del 31/08, no los jornaleros', () => {
  const g = giroDelMes(AGOSTO, { bloque: 'Oficina', anio: 2026, mes: 8 })
  assert.equal(g.hay, true)
  assert.equal(g.n, 2, 'los $300.000 y $230.240 son de obreros: debajo del umbral')
  assert.equal(g.importe, 1326283.12)
  assert.equal(g.fecha, serialDe(2026, 8, 31))
  assert.ok(344401.2 < UMBRAL_HABER_OFICINA, 'el haber de jornalero más alto medido (30/06) queda afuera')
})

test('DIRECCIÓN agosto: el giro son las transferencias del 09/09, 11/09 y 17/09; la del 25/08 no es de agosto', () => {
  const g = giroDelMes(AGOSTO, { bloque: 'Dirección', anio: 2026, mes: 8 })
  assert.deepEqual([g.hay, g.n, g.importe, g.fecha], [true, 3, 1800000, serialDe(2026, 9, 17)])
  const julio = giroDelMes(AGOSTO, { bloque: 'Dirección', anio: 2026, mes: 7 })
  assert.equal(julio.hay, false, 'el 25/08 cae fuera de las dos ventanas: no se le atribuye a ningún mes')
})

test('LIBRO · agosto SIN la carga manual: Oficina (planilla $814.500) y Dirección ($0) salen PAGADOS', () => {
  const extracto = { debitos: AGOSTO, corte: CORTE_2409, usados: new Set() }
  const avisos = []
  const ofi = deOficina({ pago: doce(7, pagoDe(8)), pagado: doce(7, 814500), proyectado: doce(7, 2792300), pactado: doce(7, 3606800) },
    CORTE_2409, { aviso: (m) => avisos.push(m), extracto })
  assert.deepEqual(ofi.map((m) => [m.estado, m.importe]), [['REAL', 3606800]], 'sin resto VENCIDO: el giro del 31/08 lo pagó')
  assert.match(ofi[0].concepto, /giro bancario del 2026-08-31 \(inferido\)/)
  const dir = deDireccion({ pago: doce(7, pagoDe(8)), pagado: doce(7, ''), proyectado: doce(7, 9000000), pactado: doce(7, 9000000) },
    CORTE_2409, { aviso: (m) => avisos.push(m), extracto })
  assert.deepEqual(dir.map((m) => [m.estado, m.importe]), [['REAL', 9000000]])
  assert.equal(avisos.length, 2, 'la red de seguridad avisa cada vez que la pestaña no lo vio')
})

test('LIBRO · septiembre con corte 02/10: con el giro del 30/09 no hay $12,6 M VENCIDO', () => {
  const debitos = [
    d(2026, 9, 30, 'Pago haberes - 260930507 260930507', 670000, S),
    d(2026, 9, 30, 'Pago haberes - 260930507 260930507', 670000, S),
    d(2026, 10, 1, 'Pago de honorarios - 261001507 261001507', 3000000, T),
  ]
  const extracto = { debitos, corte: CORTE_0210, usados: new Set() }
  const ofi = deOficina({ pago: doce(8, pagoDe(9)), pagado: doce(8, ''), proyectado: doce(8, 3606800), pactado: doce(8, 3606800) },
    CORTE_0210, { aviso: () => {}, extracto })
  const dir = deDireccion({ pago: doce(8, pagoDe(9)), pagado: doce(8, ''), proyectado: doce(8, 9000000), pactado: doce(8, 9000000) },
    CORTE_0210, { aviso: () => {}, extracto })
  assert.deepEqual([...ofi, ...dir].map((m) => m.estado), ['REAL', 'REAL'])
  assert.equal([...ofi, ...dir].reduce((a, m) => a + m.importe, 0), 12606800)
})

test('LIBRO · septiembre con corte 02/10 y SIN giro: la deuda no se esconde — VENCIDO', () => {
  const extracto = { debitos: AGOSTO, corte: CORTE_0210, usados: new Set() }
  const ofi = deOficina({ pago: doce(8, pagoDe(9)), pagado: doce(8, ''), proyectado: doce(8, 3606800), pactado: doce(8, 3606800) },
    CORTE_0210, { aviso: () => {}, extracto })
  assert.deepEqual(ofi.map((m) => [m.estado, m.importe]), [['VENCIDO', 3606800]])
})

test('LIBRO · un giro POSTERIOR al corte no paga nada todavía', () => {
  const extracto = { debitos: AGOSTO, corte: serialDe(2026, 8, 30), usados: new Set() }
  const ofi = deOficina({ pago: doce(7, pagoDe(8)), pagado: doce(7, ''), proyectado: doce(7, 3606800), pactado: doce(7, 3606800) },
    serialDe(2026, 8, 30), { aviso: () => {}, extracto })
  assert.deepEqual(ofi.map((m) => m.estado), ['PROYECTADO'])
})

test('FÓRMULA: la celda usa el MISMO umbral y la MISMA ventana que el libro', () => {
  const n = formulaGiroOficinaN(2026, 9)
  assert.match(n, /"<=-500000"/)
  assert.match(n, /EOMONTH\(DATE\(2026;9;1\);0\)-5/)
  assert.match(n, /JORNALES_VENTANA_BANCO/)
  assert.doesNotMatch(n, /,/, 'es-AR: separador «;»')
  const dn = formulaGiroDireccionN(2026, 9)
  assert.match(dn, /ana laura echegaray\|rodrigo alejandro j ech\|pago de honorarios/)
  assert.match(dn, /\+20\)/)
  assert.equal(finDeMesSerial(2026, 8), serialDe(2026, 8, 31))
})

test('FÓRMULA Pagado de Oficina: sin bloque queda vacía si no hay ni fuente ni giro; con giro vale lo pactado', () => {
  const f = formulaPagadoOficinaConGiro({ base: 'X', conBloque: false, ajustada: '$C$45*MAX(1;B47)', anio: 2026, mes: 9 })
  assert.match(f, /^=IF\(AND\(N\(X\)=0;COUNTIFS\(/)
  assert.match(f, /MAX\(X;IF\(COUNTIFS\([^]*\)>0;\$C\$45\*MAX\(1;B47\);0\)\)\)$/)
  const b = formulaPagadoOficinaConGiro({ base: "SUM('_J_OFICINA'!Z123:Z124)+Y", conBloque: true, ajustada: 'A', anio: 2026, mes: 8 })
  assert.match(b, /^=MAX\(SUM\('_J_OFICINA'!Z123:Z124\)\+Y;IF\(/)
})

test('FÓRMULA Pagado de Dirección: el giro sólo cuenta desde «Desde»', () => {
  const f = formulaPagadoDireccionConGiro({ pagado: '=P', pactado: '$B$58*1', celdaPago: 'E69', celdaDesde: '$E$58', anio: 2026, mes: 9 })
  assert.match(f, /^=MAX\(P;IF\(AND\(IFERROR\(SUMPRODUCT\(/)
  assert.match(f, /N\(E69\)>=N\(\$E\$58\);N\(\$E\$58\)>0\);\$B\$58\*1;0\)\)$/)
})

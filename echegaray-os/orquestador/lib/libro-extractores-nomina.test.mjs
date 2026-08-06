// LA NÓMINA EN FRÍO — los tres bloques de "Jornales por Quincena", con los casos que ya costaron plata.
import test from 'node:test'
import assert from 'node:assert/strict'
import { deJornalesQuincenas, deOficina, deDireccion } from './libro-extractores-nomina.mjs'
import { SALE } from './libro-movimientos.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'

const CIERRE_15 = serialDe(2026, 7, 15)
const PAGO_17 = serialDe(2026, 7, 17)
const CIERRE_31 = serialDe(2026, 7, 31)
const CORTE = serialDe(2026, 8, 5)

// El caso del extracto: la quincena que cerró el 15/07 se pagó el 17/07 (lote 260717507, $3.775.150).
const REALES = {
  pago: [PAGO_17, serialDe(2026, 8, 3)],
  hasta: [CIERRE_15, CIERRE_31],
  pagado: [PAGO_17, ''],
  total: [3775150, 7675588],
}

test('JORNALES: la fecha que decide es la de PAGO, no la de cierre de la quincena', () => {
  const ms = deJornalesQuincenas({ reales: REALES }, CORTE)
  assert.equal(ms.length, 2)
  // Si mandara el cierre, los $7.675.588 caerían en julio; se pagan el 03/08 y son caja de agosto.
  assert.equal(ms[1].fecha, serialDe(2026, 8, 3))
  assert.equal(ms[1].importe, 7675588)
  assert.ok(ms.every((m) => m.signo === SALE && m.rubro === 'Nómina · Jornales de obra'))
})

test('JORNALES: sin fecha de pago cae al cierre — una quincena no puede desaparecer del cuadro', () => {
  const ms = deJornalesQuincenas({ reales: { ...REALES, pago: [PAGO_17, ''], pagado: ['', ''] } }, CORTE)
  assert.equal(ms[1].fecha, CIERRE_31, 'el fallback a HASTA no es opcional: sin él la línea da cero callada')
})

test('JORNALES: cerrada NO es pagada — sin "Pagado el" es COMPROMETIDO, no REAL', () => {
  const ms = deJornalesQuincenas({ reales: REALES }, CORTE)
  assert.equal(ms[0].estado, 'REAL', 'el dueño marcó el pago: es un hecho')
  assert.equal(ms[1].estado, 'COMPROMETIDO', 'liquidada y con fecha, pero la plata sigue en la cuenta')
})

test('JORNALES: la proyectada vencida es VENCIDO, y no colisiona con la real del mismo renglón', () => {
  const ms = deJornalesQuincenas({
    reales: REALES,
    proyectadas: { pago: [serialDe(2026, 8, 1), serialDe(2026, 8, 18)], hasta: [CIERRE_31, serialDe(2026, 8, 15)], total: [100, 200] },
  }, CORTE)
  const proy = ms.filter((m) => /proyectada/.test(m.concepto))
  assert.equal(proy.length, 2)
  assert.equal(proy[0].estado, 'VENCIDO', 'proyectado con fecha anterior al corte')
  assert.equal(proy[1].estado, 'PROYECTADO')
  // Cuatro renglones en la MISMA pestaña: sin el bloque en la clave, dos se colapsarían en uno.
  assert.equal(new Set(ms.map((m) => m.clave)).size, 4)
})

test('OFICINA: el mes pagado es REAL con su importe; el que no, PROYECTADO', () => {
  const ms = deOficina({
    pago: [serialDe(2026, 7, 10), serialDe(2026, 8, 10)],
    pagado: [1700000, ''],
    proyectado: ['', 1800000],
  }, CORTE)
  assert.equal(ms.length, 2)
  assert.deepEqual(ms.map((m) => [m.estado, m.importe]), [['REAL', 1700000], ['PROYECTADO', 1800000]])
  assert.ok(ms.every((m) => m.rubro === 'Nómina · Sueldos administración'))
})

test('OFICINA: si un mes tiene las dos, gana el HECHO y se avisa — el Sheet las sumaría', () => {
  const avisos = []
  const ms = deOficina({ pago: [serialDe(2026, 7, 10)], pagado: [1700000], proyectado: [1800000] },
    CORTE, { aviso: (m) => avisos.push(m) })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].importe, 1700000, 'sumar las dos duplicaría el mes')
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /PAGADO .* PROYECTADO/)
})

test('DIRECCIÓN: mismo rubro que Oficina y clave propia — son las dos mitades de la misma línea', () => {
  const bloque = { pago: [serialDe(2026, 8, 10)], pagado: [''], proyectado: [9800000] }
  const ofi = deOficina(bloque, CORTE)
  const dir = deDireccion(bloque, CORTE)
  assert.equal(dir[0].rubro, ofi[0].rubro)
  assert.notEqual(dir[0].clave, ofi[0].clave, 'mismo renglón de la misma pestaña: sin el bloque uno desaparece')
  assert.equal(dir[0].importe, 9800000)
})

test('los rangos con nombre llegan como filas de la API y también como lista', () => {
  const porApi = deOficina({ pago: [[serialDe(2026, 7, 10)]], pagado: [[1700000]], proyectado: [['']] }, CORTE)
  assert.equal(porApi.length, 1)
  assert.equal(porApi[0].importe, 1700000)
})

// ── DIRECCIÓN "PAGADO" CON FECHA FUTURA: los $9.000.000 invisibles del 06/08/2026 ────────────────
//
// La planilla marca julio como pagado ($9.000.000, tres socios × $3.000.000) con fecha de caja
// 46244 = 10/08 — POSTERIOR al corte del extracto (46240 = 06/08). El extracto tiene sólo DOS débitos
// de $3.000.000, el 46237 = 03/08.
const HOY = 46240
const PREVISTA = 46244
const DEBITOS = [
  { fecha: 46174, concepto: 'Pago de honorarios - 260601507', importe: 3000000, naturaleza: '', fila: 28 },
  { fecha: 46223, concepto: 'A herrajes san juan', importe: 750000, naturaleza: '', fila: 250 },
  { fecha: 46237, concepto: 'A ana laura echegaray ovi', importe: 3000000, naturaleza: '', fila: 328 },
  { fecha: 46237, concepto: 'Pago de honorarios - 260803507', importe: 3000000, naturaleza: '', fila: 330 },
]
const JULIO_PAGADO = { pago: [PREVISTA], pagado: [9000000], proyectado: [''] }

test('DIRECCIÓN: un "Pagado" con fecha POSTERIOR al corte no es REAL — los $9M invisibles', () => {
  // Un REAL no lo mira ninguna de las tres vistas de proyección porque se asume que ya está en el
  // saldo del banco. El extracto termina en el corte y esa plata no había salido: no estaba en
  // COMPROMETIDA, no la restaba la línea de posteriores al corte, no estaba en ninguna parte.
  const ms = deDireccion(JULIO_PAGADO, HOY, { aviso: () => {} })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].estado, 'COMPROMETIDO', 'sin extracto el compromiso vuelve a estar visible, entero')
  assert.equal(ms[0].importe, 9000000)
  assert.equal(ms[0].fecha, PREVISTA)
})

test('DIRECCIÓN: con el extracto, los 2×$3M del 03/08 son REAL y el tercero queda COMPROMETIDO', () => {
  const usados = new Set()
  const ms = deDireccion(JULIO_PAGADO, HOY,
    { aviso: () => {}, extracto: { debitos: DEBITOS, corte: HOY, usados } })
  assert.equal(ms.length, 2, 'la fila se parte: lo que el banco prueba y lo que falta')
  const real = ms.find((m) => m.estado === 'REAL')
  const pendiente = ms.find((m) => m.estado === 'COMPROMETIDO')
  assert.equal(real.importe, 6000000)
  assert.equal(real.fecha, 46237, 'REAL a la fecha del DÉBITO, no a la fecha prevista')
  assert.equal(pendiente.importe, 3000000)
  assert.equal(pendiente.fecha, PREVISTA)
  assert.equal(real.signo, SALE)
  assert.notEqual(real.clave, pendiente.clave, 'dos mitades del mismo renglón: sin clave propia una desaparece')
  assert.deepEqual([...usados].sort(), [328, 330], 'los débitos quedan consumidos: no respaldan a otro')
  // Y el total no se mueve: partir no puede crear ni borrar plata.
  assert.equal(ms.reduce((a, m) => a + m.importe, 0), 9000000)
})

test('DIRECCIÓN: si el respaldo es ambiguo NO se parte, y el aviso dice por qué', () => {
  // Ante la duda el compromiso sigue vivo entero. Decir que se debe de menos planifica un pago que no
  // se puede hacer, que es el error que rompe una tesorería.
  const avisos = []
  const dosLotes = [...DEBITOS,
    { fecha: 46235, concepto: 'x', importe: 4500000, naturaleza: '', fila: 900 },
    { fecha: 46235, concepto: 'y', importe: 4500000, naturaleza: '', fila: 901 }]
  const ms = deDireccion(JULIO_PAGADO, HOY,
    { aviso: (m) => avisos.push(m), extracto: { debitos: dosLotes, corte: HOY, usados: new Set() } })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].importe, 9000000)
  assert.equal(ms[0].estado, 'COMPROMETIDO')
  assert.match(avisos[0], /posterior al corte del extracto/)
  assert.match(avisos[0], /2 lotes/)
})

test('DIRECCIÓN: un "Pagado" con fecha ANTERIOR al corte sigue siendo REAL y no se toca', () => {
  // El histórico no se vuelve a discutir: si la fecha ya pasó, la plata salió y el saldo lo contiene.
  const ms = deDireccion({ pago: [46213], pagado: [9000000], proyectado: [''] }, HOY,
    { aviso: () => {}, extracto: { debitos: DEBITOS, corte: HOY, usados: new Set() } })
  assert.equal(ms.length, 1)
  assert.equal(ms[0].estado, 'REAL')
  assert.equal(ms[0].fecha, 46213)
})

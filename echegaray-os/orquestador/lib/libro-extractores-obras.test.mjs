// Los egresos de obras futuras: proyectados de signo −1 con neteo vivo contra Compras.
//
// Lo que estos tests fijan: la FORMA EXACTA de la fórmula es-AR (separador `;`, decimal `,`), el
// neteo secuencial de cuotas (el real absorbe EN ORDEN y nunca se resta dos veces), y las tres
// exclusiones que evitan doble conteo o datos inventados (moCargasPesos, noCaja, obra sin fechas).
import test from 'node:test'
import assert from 'node:assert/strict'
import { deObras, formulaRealDeCompras, serialDeFecha, RUBRO_OBRAS, PESTANA_OBRAS } from './libro-extractores-obras.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { deduplicar } from './libro-movimientos.mjs'

// Las letras con que el script resuelve Compras por rótulo (columnasNeteoDeCompras).
const COLS = { proveedor: 'E', cliente: 'J', fecha: 'C', pagado: 'T', total: 'O' }
const HOY = serialDe(2026, 8, 7)

const obra = (extra = {}) => ({
  clave: 'EMICAR-NAVE',
  cliente: 'EMICAR',
  obra: 'Nave EMICAR',
  inicio: '2026-09-01',
  fin: '2026-12-15',
  pctEjecutado: 0,
  moCargasPesos: 12_000_000,
  egresos: [],
  noCaja: [{ concepto: 'Máquina propia', monto: 9_000_000 }],
  notas: '',
  ...extra,
})

const INICIO = serialDe(2026, 9, 1)
const REAL = 'SUMPRODUCT((Compras!$E$4:$E="Aceros Cuyo")*(Compras!$J$4:$J="EMICAR")'
  + `*(IFERROR(DATEVALUE(Compras!$C$4:$C&"");N(Compras!$C$4:$C))>=${INICIO})*N(Compras!$O$4:$O))`

test('PROYECTADO SIMPLE: un egreso con fecha futura sale como movimiento −1 PROYECTADO, con su fórmula viva', () => {
  const { movimientos, resumen } = deObras([obra({
    egresos: [{ concepto: 'Estructura metálica', proveedor: 'Aceros Cuyo', familia: 'materiales', monto: 2_500_000, fechaEstimada: '2026-09-10' }],
  })], COLS, HOY)
  assert.equal(movimientos.length, 1)
  const m = movimientos[0]
  assert.equal(m.fecha, serialDe(2026, 9, 10))
  assert.equal(m.signo, -1)
  assert.equal(m.estado, 'PROYECTADO')
  assert.equal(m.rubro, RUBRO_OBRAS)
  assert.equal(m.importe, 2_500_000, 'en memoria viaja el monto planificado')
  assert.equal(m.contraparte, 'Aceros Cuyo')
  assert.equal(m.obra, 'Nave EMICAR')
  assert.deepEqual({ ...m.origen }, { pestana: PESTANA_OBRAS, fila: 'EMICAR-NAVE·Aceros Cuyo' })
  assert.equal(m.importeVivo, `=MAX(0;2500000-${REAL})`)
  assert.deepEqual(resumen, { obras: 1, movimientos: 1, totalProyectado: 2_500_000 })
})

test('LA FÓRMULA ES es-AR: separador `;`, nunca la coma — y el decimal SÍ es coma', () => {
  const { movimientos } = deObras([obra({
    egresos: [{ concepto: 'Alquiler', proveedor: 'Aceros Cuyo', monto: 1234.5, fechaEstimada: '2026-09-10' }],
  })], COLS, HOY)
  const f = movimientos[0].importeVivo
  assert.ok(f.startsWith('=MAX(0;'), 'MAX con `;`')
  assert.ok(f.includes('1234,5-SUMPRODUCT'), 'el decimal va con coma es-AR')
  assert.ok(!f.replace('1234,5', '').includes(','), 'ninguna coma que no sea el decimal: el separador es `;`')
  assert.ok(!/\d\.\d/.test(f), 'ningún decimal con punto: el archivo no lo parsea')
})

test('CUOTAS SECUENCIALES: acumulados constantes, el MISMO SUMPRODUCT, y filas que no colapsan', () => {
  const { movimientos } = deObras([obra({
    egresos: [{
      concepto: 'Servicio de grúa',
      proveedor: 'Aceros Cuyo',
      cuotas: [
        { fecha: '2026-09-15', monto: 1_000_000 },
        { fecha: '2026-10-15', monto: 1_000_000 },
        { fecha: '2026-11-15', monto: 1_000_000 },
      ],
    }],
  })], COLS, HOY)
  assert.equal(movimientos.length, 3)
  assert.equal(movimientos[0].importeVivo, `=MAX(0;1000000-MAX(0;${REAL}))`)
  assert.equal(movimientos[1].importeVivo, `=MAX(0;2000000-MAX(1000000;${REAL}))`)
  assert.equal(movimientos[2].importeVivo, `=MAX(0;3000000-MAX(2000000;${REAL}))`)
  // Cada cuota lleva su fila: con la fila compartida, la clave sería la misma y deduplicar borraría dos.
  assert.equal(new Set(movimientos.map((m) => m.origen.fila)).size, 3)
  assert.equal(deduplicar(movimientos).libro.length, 3, 'las tres cuotas sobreviven a la deduplicación')
})

test('EL REAL ABSORBE LAS CUOTAS EN ORDEN: 1,5 cuotas reales dejan $0 · $500k · $1M — y NUNCA se resta dos veces', () => {
  // El espejo en JS de EXACTAMENTE la fórmula emitida: MAX(0; acum_k − MAX(acum_{k−1}; real)).
  const cuota = (acumPrev, acumK, real) => Math.max(0, acumK - Math.max(acumPrev, real))
  const acums = [[0, 1_000_000], [1_000_000, 2_000_000], [2_000_000, 3_000_000]]
  const con = (real) => acums.map(([p, k]) => cuota(p, k, real))

  assert.deepEqual(con(1_500_000), [0, 500_000, 1_000_000], 'la 1ª absorbida entera, media 2ª, la 3ª intacta')
  assert.deepEqual(con(0), [1_000_000, 1_000_000, 1_000_000], 'sin real, las cuotas planificadas enteras')
  assert.deepEqual(con(5_000_000), [0, 0, 0], 'el real cubre todo: nada queda proyectado')
  // La garantía anti doble descuento: para CUALQUIER real, la suma es MAX(0; planificado − real).
  for (const real of [0, 250_000, 1_000_000, 1_500_000, 2_999_999, 3_000_000, 9_000_000]) {
    const suma = con(real).reduce((a, v) => a + v, 0)
    assert.equal(suma, Math.max(0, 3_000_000 - real), `real=${real}: el real se resta UNA vez, nunca dos`)
  }
})

test('DOS EGRESOS SUELTOS DEL MISMO PROVEEDOR SE ENCADENAN: comparten SUMPRODUCT, así que fórmulas independientes doblarían el descuento', () => {
  const { movimientos } = deObras([obra({
    egresos: [
      { concepto: 'Hierro', proveedor: 'Aceros Cuyo', monto: 800_000, fechaEstimada: '2026-09-05' },
      { concepto: 'Chapa', proveedor: 'Aceros Cuyo', monto: 400_000, fechaEstimada: '2026-10-05' },
    ],
  })], COLS, HOY)
  assert.equal(movimientos[0].importeVivo, `=MAX(0;800000-MAX(0;${REAL}))`)
  assert.equal(movimientos[1].importeVivo, `=MAX(0;1200000-MAX(800000;${REAL}))`)
})

test('OBRA SIN INICIO O SIN FIN SE SALTEA ENTERA, y el aviso lo dice', () => {
  const avisos = []
  const { movimientos, resumen } = deObras([
    obra({ clave: 'SIN-FIN', fin: null, egresos: [{ concepto: 'x', proveedor: 'P', monto: 1_000_000, fechaEstimada: '2026-09-10' }] }),
    obra({ clave: 'SIN-INICIO', inicio: null, egresos: [{ concepto: 'x', proveedor: 'P', monto: 1_000_000, fechaEstimada: '2026-09-10' }] }),
  ], COLS, HOY, (m) => avisos.push(m))
  assert.equal(movimientos.length, 0)
  assert.deepEqual(resumen, { obras: 0, movimientos: 0, totalProyectado: 0 })
  assert.equal(avisos.length, 2)
})

test('moCargasPesos Y noCaja JAMÁS GENERAN MOVIMIENTO: van por Jornales o no son caja', () => {
  const { movimientos, resumen } = deObras([obra({
    egresos: [{ concepto: 'Materiales', proveedor: 'Aceros Cuyo', monto: 2_000_000, fechaEstimada: '2026-09-10' }],
  })], COLS, HOY)
  assert.equal(movimientos.length, 1, 'sólo el egreso de caja real')
  assert.ok(!movimientos.some((m) => m.importe === 12_000_000), 'la MO+cargas (12M) no aparece: iría doble contra Jornales')
  assert.ok(!movimientos.some((m) => m.importe === 9_000_000), 'el noCaja (9M) no aparece: máquina propia no mueve caja')
  assert.equal(resumen.totalProyectado, 2_000_000)
})

test('FECHA VENCIDA → corte+1: una compra proyectada vencida no es historia, es plata que sale ya', () => {
  const { movimientos } = deObras([obra({
    inicio: '2026-07-01',
    egresos: [{ concepto: 'Materiales', proveedor: 'Aceros Cuyo', monto: 500_000, fechaEstimada: '2026-08-01' }],
  })], COLS, HOY)
  assert.equal(movimientos[0].fecha, HOY + 1)
  assert.equal(movimientos[0].estado, 'PROYECTADO', 'nunca nace VENCIDO: la fecha corrida lo garantiza')
})

test('ESTADO Y SIGNO SIEMPRE: todo movimiento es PROYECTADO, −1 y del único rubro nuevo', () => {
  const { movimientos } = deObras([obra({
    egresos: [
      { concepto: 'a', proveedor: 'P1', monto: 100, fechaEstimada: '2026-09-01' },
      { concepto: 'b', proveedor: 'P2', cuotas: [{ fecha: '2026-09-01', monto: 200 }, { fecha: '2026-10-01', monto: 300 }] },
      { concepto: 'c', proveedor: 'P3', monto: 400 }, // sin fechaEstimada: cae al inicio de la obra
    ],
  })], COLS, HOY)
  assert.equal(movimientos.length, 4)
  for (const m of movimientos) {
    assert.equal(m.estado, 'PROYECTADO')
    assert.equal(m.signo, -1)
    assert.equal(m.rubro, RUBRO_OBRAS)
    assert.equal(m.origen.pestana, PESTANA_OBRAS)
  }
})

test('SIN LAS LETRAS DE COMPRAS FALLA CERRADO: importe pegado, sin fórmula adivinada', () => {
  const armar = (cols) => deObras([obra({
    egresos: [{ concepto: 'x', proveedor: 'Aceros Cuyo', monto: 1_000_000, fechaEstimada: '2026-09-10' }],
  })], cols, HOY).movimientos[0]
  for (const cols of [null, {}, { proveedor: 'E', cliente: 'J', fecha: 'C' }]) {
    const m = armar(cols)
    assert.equal(m.importeVivo, undefined, `cols=${JSON.stringify(cols)}: nada de fórmula sin letras resueltas`)
    assert.equal(m.importe, 1_000_000)
  }
})

test('EL PROVEEDOR CON COMILLAS NO ROMPE LA FÓRMULA: se duplican, como manda el archivo', () => {
  const f = formulaRealDeCompras(COLS, 'Grúas "San Blas"', 'EMICAR', INICIO)
  assert.ok(f.includes('="Grúas ""San Blas"""'), 'comillas internas duplicadas')
})

test('serialDeFecha: ISO al serial, un serial pasa igual, la basura es null', () => {
  assert.equal(serialDeFecha('2026-09-01'), serialDe(2026, 9, 1))
  assert.equal(serialDeFecha(46000), 46000)
  assert.equal(serialDeFecha(null), null)
  assert.equal(serialDeFecha('septiembre'), null)
})

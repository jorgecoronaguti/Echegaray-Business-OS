// Tests del cargador de boletas gremiales. Herméticos: el núcleo puro no toca red, base ni Sheet.
//
// ESTE CÓDIGO ESCRIBE EN "Compras", que es la planilla de plata de la empresa y está candada porque el
// dueño la edita. Los tests son el seguro: que ubique por CONTENIDO y no por fila, que NO agregue una
// fila nueva sobre una obligación ya proyectada (contarla dos veces), que no pise un pago ya cargado,
// y que no toque ni una de las columnas calculadas.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ubicarFila, planBoleta, aFechaAR, aNumeroAR, mismaFecha, PROHIBIDAS, VOCABULARIO, COL } from './cargar-boletas-gremiales.mjs'

/** La forma REAL de Compras al 30/07, recortada a las filas de gremiales. */
const COMPRAS = () => {
  const f = Array.from({ length: 500 }, () => Array(36).fill(''))
  const fila = (i, asign, mes, total, estado, comprobante = '') => {
    f[i - 1][COL.categoria] = 'B'
    f[i - 1][COL.proveedor] = 'SINDICATOS'
    f[i - 1][COL.unidad] = 'Impuestos'
    f[i - 1][COL.asignacion] = asign
    f[i - 1][COL.detalles] = mes
    f[i - 1][COL.total] = total
    f[i - 1][COL.estado] = estado
    f[i - 1][COL.comprobante] = comprobante
  }
  fila(437, 'IERIC', 'MAYO', 14097.19, 'Pagado', '5666708')
  fila(438, 'FODECO', 'MAYO', 14097.19, 'Pagado', '5666710')
  fila(460, 'IERIC', 'JUNIO', 7300, 'Proyectado')
  fila(461, 'FODECO', 'JUNIO', 7300, 'Proyectado')
  fila(475, 'IERIC', 'JULIO', 7300, 'Proyectado')
  fila(476, 'FODECO', 'JULIO', 7300, 'Proyectado')
  return f
}

const IERIC = {
  entidad: 'IERIC', boleta: '5715127', periodo: '2026/06', mes: 'JUNIO', importe: 15092.62,
  contribucion: 14826.92, actualizacion: 265.70, baseImponible: 1482692.40, trabajadores: 22,
  generada: '2026-07-29', vencimiento: '2026-07-31', pagada: '2026-07-30',
  tipoPago: 'Débito', operacionMP: '171255712158',
}

test('UBICA POR CONTENIDO: entidad + mes del período, nunca por número de fila', () => {
  const c = ubicarFila(COMPRAS(), IERIC)
  assert.equal(c.length, 1)
  assert.equal(c[0].fila, 460)
  assert.equal(c[0].estado, 'Proyectado')
  assert.equal(c[0].total, 7300)
  // Si el dueño agrega 20 filas arriba, la tiene que seguir encontrando.
  const corrida = [...Array.from({ length: 20 }, () => Array(36).fill('')), ...COMPRAS()]
  assert.equal(ubicarFila(corrida, IERIC)[0].fila, 480)
})

test('NO CONFUNDE IERIC CON FODECO, NI JUNIO CON MAYO', () => {
  assert.equal(ubicarFila(COMPRAS(), { entidad: 'FODECO', mes: 'JUNIO' })[0].fila, 461)
  assert.equal(ubicarFila(COMPRAS(), { entidad: 'IERIC', mes: 'MAYO' })[0].fila, 437)
  assert.equal(ubicarFila(COMPRAS(), { entidad: 'IERIC', mes: 'AGOSTO' }).length, 0, 'agosto no existe todavía')
  // El archivo tiene "AbriL" con mayúscula rara: el match no puede depender de eso.
  const f = COMPRAS(); f[425][COL.asignacion] = 'IERIC'; f[425][COL.detalles] = 'AbriL'
  assert.equal(ubicarFila(f, { entidad: 'ieric', mes: 'abril' })[0].fila, 426)
})

test('CONFIRMA LA PROYECCIÓN, NO AGREGA UNA FILA: y avisa cuánto se había proyectado de menos', () => {
  // Agregar una fila nueva dejaría la proyección de $7.300 abajo y el cash flow contaría el mes dos veces.
  const p = planBoleta(ubicarFila(COMPRAS(), IERIC)[0], IERIC)
  assert.ok(p.celdas.every((c) => /460$/.test(c.a1)), 'todo cae en la fila que ya existía')
  assert.ok(p.avisos.some((a) => /7\.300,00.*15\.092,62/.test(a)), `tiene que decir la diferencia: ${p.avisos.join(' | ')}`)
})

test('EL TOTAL PROYECTADO LLEGA FORMATEADO: "$7.300,00" tiene que compararse igual', () => {
  // La API devuelve el valor formateado en es-AR y Number("$7.300,00") es NaN: el aviso de la
  // diferencia contra lo proyectado se perdía EN SILENCIO (no salió en el ensayo en seco).
  const f = COMPRAS(); f[459][COL.total] = '$7.300,00'
  const p = planBoleta(ubicarFila(f, IERIC)[0], IERIC)
  assert.ok(p.avisos.some((a) => /7\.300,00.*15\.092,62/.test(a)), `el aviso tiene que salir igual: ${p.avisos.join(' | ')}`)
  assert.equal(aNumeroAR('$7.300,00'), 7300)
  assert.equal(aNumeroAR('$1.482.692,40'), 1482692.4)
  assert.equal(aNumeroAR(14097.19), 14097.19)
  assert.ok(Number.isNaN(aNumeroAR('')), 'una celda vacía no es cero: no hay proyección con la que comparar')
})

test('ESCRIBE LA GRAMÁTICA DE LAS FILAS DE MAYO, y la fecha de caja sale de Q', () => {
  const p = planBoleta(ubicarFila(COMPRAS(), IERIC)[0], IERIC)
  const de = (a1) => p.celdas.find((c) => c.a1 === a1)
  assert.equal(de('C460').valor, '29/07/2026', 'fecha de la boleta, en el formato del archivo')
  assert.equal(de('G460').valor, 'Boleta')
  assert.equal(de('H460').valor, '5715127')
  assert.equal(de('O460').valor, 15092.62)
  assert.equal(typeof de('O460').valor, 'number', 'el importe es NÚMERO: como texto no lo suma nadie')
  assert.equal(de('P460').valor, 'Débito')
  assert.equal(de('Q460').valor, '30/07/2026', 'la fecha REAL de pago — de acá sale la fecha de caja')
  assert.equal(de('T460').formula, '=O460')
  assert.equal(de('X460').valor, 'Pagado')
  // El concepto lleva el cálculo, para que el número se pueda auditar sin abrir el PDF.
  assert.match(de('L460').valor, /Boleta 5715127/)
  assert.match(de('L460').valor, /22 trabajadores/)
  assert.match(de('L460').valor, /1% \$14\.826,92/)
  assert.match(de('L460').valor, /171255712158/)
})

test('NO TOCA NI UNA COLUMNA CALCULADA (AD es una ARRAYFORMULA: escribirla mata la fecha de caja)', () => {
  const p = planBoleta(ubicarFila(COMPRAS(), IERIC)[0], IERIC)
  for (const c of p.celdas) {
    const col = /^[A-Z]+/.exec(c.a1)[0]
    assert.ok(!PROHIBIDAS.includes(col), `${c.a1} es calculada: no se escribe`)
  }
  // Tampoco el ID (columna A, autonumerada) ni el importe/IVA (estas boletas no tienen IVA).
  for (const no of ['A460', 'M460', 'N460', 'D460', 'R460', 'U460', 'Z460']) {
    assert.ok(!p.celdas.some((c) => c.a1 === no), `${no} no es de este cargador`)
  }
})

test('IDEMPOTENTE: si la boleta ya está cargada, no escribe nada', () => {
  const f = COMPRAS()
  f[459][COL.estado] = 'Pagado'; f[459][COL.comprobante] = '5715127'
  const p = planBoleta(ubicarFila(f, IERIC)[0], IERIC)
  assert.deepEqual(p.celdas, [])
  assert.ok(p.yaEstaba)
  assert.match(p.avisos[0], /ya está cargada/)
})

test('NO PISA UN PAGO YA CARGADO CON OTRO COMPROBANTE — avisa y se detiene', () => {
  const f = COMPRAS()
  f[459][COL.estado] = 'Pagado'; f[459][COL.comprobante] = '5666708'
  const p = planBoleta(ubicarFila(f, IERIC)[0], IERIC)
  assert.deepEqual(p.celdas, [], 'ese mes ya se pagó con otra boleta: lo mira una persona')
  assert.match(p.avisos[0], /ya está Pagada con OTRO comprobante/)
})

test('una forma de pago que no está en el desplegable se avisa', () => {
  const p = planBoleta(ubicarFila(COMPRAS(), IERIC)[0], { ...IERIC, tipoPago: 'Mercado Pago' })
  assert.ok(p.avisos.some((a) => /no está en el desplegable/.test(a)))
  assert.ok(VOCABULARIO.tipoPago.includes('Débito'))
  assert.ok(VOCABULARIO.estado.includes('Pagado'))
})

test('aFechaAR escribe DD/MM/YYYY (el archivo es es-AR) y no inventa fechas', () => {
  assert.equal(aFechaAR('2026-07-30'), '30/07/2026')
  assert.equal(aFechaAR('2026-01-05'), '05/01/2026')
  assert.equal(aFechaAR(''), '')
  assert.equal(aFechaAR('30/07/2026'), '', 'lo que no es ISO no se transforma a ciegas')
  assert.equal(aFechaAR(null), '')
})

test('LA VERIFICACIÓN COMPARA FECHAS, NO CADENAS: Sheets devuelve "30/7/2026" sin el cero', () => {
  // Falso negativo real (30/07): la carga estaba perfecta y la verificación decía "revisá el respaldo"
  // porque comparaba "30/7/2026" contra "30/07/2026". Una verificación que grita con todo bien no sirve.
  assert.ok(mismaFecha('30/7/2026', '30/07/2026'))
  assert.ok(mismaFecha('5/1/2026', '05/01/2026'))
  assert.ok(!mismaFecha('30/7/2026', '31/07/2026'), 'un día distinto SÍ tiene que fallar')
  assert.ok(!mismaFecha('7/30/2026', '30/07/2026'), 'mes y día no se intercambian: el archivo es es-AR')
  assert.ok(!mismaFecha('', '30/07/2026'), 'una fecha de caja vacía es un hallazgo, no una coincidencia')
  assert.ok(!mismaFecha(null, null))
})

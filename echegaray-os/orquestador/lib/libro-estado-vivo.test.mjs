// EL ESTADO VIVO DE LA COLUMNA H — lo que estos tests atrapan si alguien revierte el arreglo.
//
// El defecto original: la columna H de `_MOVIMIENTOS` era un texto pegado, así que un pago que el
// dueño marcaba en Compras seguía contado como COMPROMETIDO hasta la regeneración siguiente ($3,55M
// medidos el 07/08). Si `celdaEstado` vuelve a devolver `m.estado` para una fila de Compras impaga,
// el primer test se pone rojo.
//
// El defecto SIMÉTRICO —el que un arreglo apurado introduce— es promover de más: un COMPROMETIDO de
// Compras ya viene de una fila marcada "Pagado" (es el cheque entregado que todavía no debitó), y
// darle la fórmula lo convertiría en REAL en el acto, reabriendo el agujero de $2.569.676 del 06/08.
// Hay un test para cada dirección.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  celdaEstado, celdaImporte, columnaEstadoDeCompras, columnasVivasDeCompras, columnasNeteoDeCompras,
  estadosDecorados, ESTADOS_VIVOS, MARCA_PAGADO,
} from './libro-estado-vivo.mjs'
import { estaPagada, NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'
import { terminoLibro, LIBRO } from './libro-sumas.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

/** Un movimiento con lo mínimo que `celdaEstado` mira. No usa `movimiento()`: acá se prueba el render. */
const mov = (estado, pestana = 'Compras', fila = 457) => ({ estado, origen: { pestana, fila } })

// ── UN ENCABEZADO DE COMPRAS DE MENTIRA, CON LOS RÓTULOS REALES ────────────────────────────────────
// La fila 3 (índice 2) es el encabezado; las dos de arriba son título y agrupador.
function comprasFixture({ estados = [], desplazar = 0 } = {}) {
  const enc = []
  const poner = (nombre, i) => { enc[i + desplazar] = nombre }
  Object.values(NOMBRES_COMPRAS).forEach((n, i) => poner(n, i))
  const filas = [[], [], enc]
  for (const v of estados) {
    const f = []
    f[enc.indexOf(NOMBRES_COMPRAS.estado)] = v
    filas.push(f)
  }
  return filas
}

// ═══ LA FÓRMULA, EVALUADA ══════════════════════════════════════════════════════════════════════════
//
// Un evaluador mínimo de EXACTAMENTE la forma que emitimos — no un intérprete del archivo. Si la
// fórmula cambia de forma (otra función, otro orden de argumentos, la coma en vez del `;`), el
// parser no matchea y el test se pone rojo, que es lo que se quiere: la simulación sólo vale si
// prueba la fórmula que se escribe de verdad.
const FORMA = /^=IF\(INDEX\(Compras!\$([A-Z]+):\$\1;(\d+)\)="([^"]*)";"([^"]*)";"([^"]*)"\)$/

/**
 * Rinde la fórmula contra una columna de Compras dada como array (índice 0 = fila 1).
 * La comparación `=` del archivo ignora mayúsculas y NO recorta espacios: se reproduce así.
 */
function renderizar(formula, columna, colEsperada = 'X') {
  const m = FORMA.exec(formula)
  assert.ok(m, `no reconozco la forma de la fórmula: ${formula}`)
  const [, col, fila, literal, siSi, siNo] = m
  assert.equal(col, colEsperada, 'la fórmula apunta a otra columna de Compras')
  const celda = String(columna[Number(fila) - 1] ?? '')
  return celda.toLowerCase() === literal.toLowerCase() ? siSi : siNo
}

test('una fila de Compras PROYECTADA escribe la fórmula viva, con INDEX a su fila y separador ";"', () => {
  const f = celdaEstado(mov('PROYECTADO'), 'X')
  assert.equal(f, '=IF(INDEX(Compras!$X:$X;457)="Pagado";"REAL";"PROYECTADO")')
  // La coma es el DECIMAL en un archivo es-AR: una fórmula con comas de separador es #ERROR!.
  assert.ok(!f.includes(','), `la fórmula lleva coma y el archivo es es-AR: ${f}`)
})

test('una fila VENCIDA se autopromueve igual, y su rama negativa sigue diciendo VENCIDO', () => {
  assert.equal(celdaEstado(mov('VENCIDO', 'Compras', 12), 'X'),
    '=IF(INDEX(Compras!$X:$X;12)="Pagado";"REAL";"VENCIDO")')
})

test('SIMULACIÓN: con la fila marcada "Pagado" la fórmula rinde REAL; sin marcar, el estado escrito', () => {
  const f = celdaEstado(mov('PROYECTADO', 'Compras', 5), 'X')
  const col = (v) => { const c = []; c[4] = v; return c } // fila 5 → índice 4
  assert.equal(renderizar(f, col('Pagado')), 'REAL')
  assert.equal(renderizar(f, col('PAGADO')), 'REAL', 'el archivo compara texto sin distinguir mayúsculas')
  assert.equal(renderizar(f, col('Pendiente')), 'PROYECTADO')
  assert.equal(renderizar(f, col('')), 'PROYECTADO')
  assert.equal(renderizar(f, []), 'PROYECTADO', 'una celda inexistente no promueve nada')
})

test('SIMULACIÓN: el INDEX apunta a SU fila — marcar la de al lado no promueve nada', () => {
  const f = celdaEstado(mov('PROYECTADO', 'Compras', 5), 'X')
  const col = []
  col[3] = 'Pagado' // fila 4, la de arriba
  col[5] = 'Pagado' // fila 6, la de abajo
  assert.equal(renderizar(f, col), 'PROYECTADO',
    'si el índice estuviera corrido en uno, esta fila se daría por pagada con el pago del vecino')
})

test('la fórmula NUNCA promueve donde `estaPagada` diría que no: falla del lado seguro', () => {
  const f = celdaEstado(mov('PROYECTADO', 'Compras', 1), 'X')
  const valores = ['Pagado', 'pagado', 'PAGADO', '✅ Pagado', 'Pagado ', 'Pendiente', 'No pagado',
    'Proyectado', '', 'Anulado']
  for (const v of valores) {
    const rinde = renderizar(f, [v]) === 'REAL'
    if (rinde) {
      assert.ok(estaPagada(v), `"${v}": la fórmula promueve a REAL y el generador no la da por pagada — `
        + 'la columna H diría una cosa y la memoria del generador otra')
    }
  }
  // Y la dirección que SÍ se acepta, declarada: la decoración no promueve (espera a la regeneración).
  assert.ok(estaPagada('✅ Pagado'))
  assert.equal(renderizar(f, ['✅ Pagado']), 'PROYECTADO')
})

test('un COMPROMETIDO de Compras queda como VALOR: su fila YA dice "Pagado" y la fórmula lo volvería REAL en el acto', () => {
  // Es el cheque entregado con fecha posterior al corte del extracto (arreglo del 06/08, $2.569.676).
  // Si alguien agrega 'COMPROMETIDO' a ESTADOS_VIVOS, esa plata desaparece de las tres proyecciones.
  assert.equal(celdaEstado(mov('COMPROMETIDO'), 'X'), 'COMPROMETIDO')
  assert.ok(!ESTADOS_VIVOS.includes('COMPROMETIDO'))
  assert.deepEqual([...ESTADOS_VIVOS], ['PROYECTADO', 'VENCIDO'])
})

test('un REAL de Compras queda como valor: no hay nada que promover', () => {
  assert.equal(celdaEstado(mov('REAL'), 'X'), 'REAL')
})

test('una cuota en cheque (origen.fila "457 · cheque 12") queda como valor: la promueve el extracto', () => {
  assert.equal(celdaEstado(mov('COMPROMETIDO', 'Compras', '457 · cheque 12'), 'X'), 'COMPROMETIDO')
  assert.equal(celdaEstado(mov('PROYECTADO', 'Compras', '457 · cheque 12'), 'X'), 'PROYECTADO')
})

test('las otras fuentes no cambian: cheques, jornales, banco y cobranzas siguen como valor', () => {
  for (const p of ['Cheques Emitidos', 'Jornales', '_BANCO_RAW', 'Cobranzas', 'Cargas Sociales',
    '_CHEQUES_RAW', 'Impuestos y Financieros', 'Tarjeta de Credito', 'Oficina', 'Dirección']) {
    assert.equal(celdaEstado(mov('PROYECTADO', p, 7), 'X'), 'PROYECTADO', `${p} no tiene estado vivo`)
    assert.equal(celdaEstado(mov('COMPROMETIDO', p, 7), 'X'), 'COMPROMETIDO')
  }
})

test('sin la letra de la columna, falla CERRADO: valor pegado, nunca una referencia adivinada', () => {
  assert.equal(celdaEstado(mov('PROYECTADO'), null), 'PROYECTADO')
  assert.equal(celdaEstado(mov('PROYECTADO'), ''), 'PROYECTADO')
})

test('la columna sale del RÓTULO: si Compras se corre dos columnas, la fórmula se corre con ella', () => {
  const base = comprasFixture()
  const corrida = comprasFixture({ desplazar: 2 })
  const l0 = columnaEstadoDeCompras(base)
  const l2 = columnaEstadoDeCompras(corrida)
  assert.notEqual(l0, l2, 'la letra tiene que seguir al encabezado, no quedarse en una posición fija')
  assert.ok(celdaEstado(mov('PROYECTADO'), l2).includes(`Compras!$${l2}:$${l2}`))
})

test('estadosDecorados mide el hueco: "✅ Pagado" se declara, "Pagado" y "Pendiente" no', () => {
  const filas = comprasFixture({ estados: ['Pagado', '✅ Pagado', 'Pendiente', 'pagado', '  Pagado  '] })
  assert.deepEqual(estadosDecorados(filas), [{ fila: 5, valor: '✅ Pagado' }])
  assert.equal(MARCA_PAGADO, 'Pagado')
})

// ═══ LO QUE LOS CONSUMIDORES NO PUEDEN NOTAR ═══════════════════════════════════════════════════════

test('REGRESIÓN: el término de la tarjeta COMPROMETIDA no cambia de forma', () => {
  // Compara la columna H con `=` contra literales exactos. Una fórmula que RINDE "REAL" le da lo
  // mismo que un valor pegado — no hay TRIM, ni ISTEXT, ni EXACT que pudieran distinguirlos. Si
  // alguien reescribe esto con una función que mire el CONTENIDO de la celda en vez de su resultado,
  // este test se pone rojo antes de que las cinco tarjetas empiecen a mentir.
  const t = terminoLibro({ signo: -1, estados: ['COMPROMETIDO', 'PROYECTADO', 'VENCIDO'],
    hasta: 'EOMONTH(TODAY();0)+1', medida: 'magnitud' })
  assert.equal(t,
    'SUMPRODUCT(ISNUMBER(_MOVIMIENTOS!$A$2:$A)'
    + '*(_MOVIMIENTOS!$A$2:$A<EOMONTH(TODAY();0)+1)'
    + '*(_MOVIMIENTOS!$B$2:$B=-1)'
    + '*((_MOVIMIENTOS!$H$2:$H="COMPROMETIDO")+(_MOVIMIENTOS!$H$2:$H="PROYECTADO")+(_MOVIMIENTOS!$H$2:$H="VENCIDO"))'
    + '*N(_MOVIMIENTOS!$C$2:$C))')
  assert.equal(LIBRO.col.estado, 'H')
})

test('el generador escribe la columna H por `celdaEstado`, no por `m.estado`', () => {
  // El script no se puede importar (ejecuta main() al cargarse), así que el contrato se lee del
  // fuente. Sin esto, revertir el arreglo en el script dejaría todos los tests de arriba en verde.
  const fuente = fs.readFileSync(path.join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  assert.ok(/celdaEstado\(m,\s*colEstadoCompras\)/.test(fuente),
    'la fila que se escribe tiene que pasar el estado por celdaEstado(m, colEstadoCompras)')
  assert.ok(!/m\.actividad,\s*m\.estado,/.test(fuente),
    'la columna H volvió a ser `m.estado` pegado: el pago del dueño deja de verse hasta la regeneración')
  // La letra viaja desde la lectura de Compras, resuelta por rótulo — no escrita a mano en el script.
  assert.ok(/columnaEstadoDeCompras\(compras\)/.test(fuente))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL IMPORTE VIVO — el pago PARCIAL descuenta la COMPROMETIDA en el acto (07/08)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const movImporte = (estado, extra = {}) => ({
  importe: 1300000, signo: -1, estado, saldoVivo: true,
  origen: { pestana: 'Compras', fila: 832 }, ...extra,
})
const COLS_VIVAS = { estado: 'X', total: 'O', montoPagado: 'T' }

test('EL SALDO DE UNA FILA IMPAGA ES FÓRMULA VIVA: Total − Monto Pagado, nunca negativo', () => {
  // $2M parciales sobre $3,3M dejaban la fila "Pendiente": el estado vivo no la promovía, el libro
  // mostraba el saldo de la última corrida, DISPONIBLE bajaba en vivo y la diferencia la comía LIBRE.
  const f = celdaImporte(movImporte('PROYECTADO'), COLS_VIVAS)
  assert.equal(f, '=MAX(0;N(Compras!$O$832)-N(Compras!$T$832))')
  assert.ok(!String(f).includes(','), 'locale es-AR: sin comas')
})

test('SÓLO EL SALDO PURO VA VIVO: los demás casos conservan el valor pegado', () => {
  // Una fila partida por cheques en vuelo lleva debe−enVuelo de importe: pisarla con O−T contaría
  // dos veces lo que ya viaja en las cuotas del cheque.
  assert.equal(celdaImporte(movImporte('PROYECTADO', { saldoVivo: false }), COLS_VIVAS), 1300000)
  assert.equal(celdaImporte(movImporte('REAL'), COLS_VIVAS), 1300000, 'lo REAL ya salió: valor pegado')
  assert.equal(celdaImporte(movImporte('PROYECTADO', { signo: 1 }), COLS_VIVAS), 1300000, 'una nota de crédito no es un saldo a pagar')
  assert.equal(celdaImporte(movImporte('PROYECTADO', { origen: { pestana: 'Cobranzas', fila: 5 } }), COLS_VIVAS), 1300000)
  assert.equal(celdaImporte(movImporte('PROYECTADO', { origen: { pestana: 'Compras', fila: '457 · cheque 12' } }), COLS_VIVAS), 1300000)
  assert.equal(celdaImporte(movImporte('PROYECTADO'), null), 1300000, 'sin columnas resueltas, falla cerrado al valor')
})

test('LAS TRES LETRAS SE RESUELVEN POR RÓTULO, o nada va vivo', () => {
  const CAB = ['id', 'x', 'x', 'x', 'Proveedor', 'CUIT (OS)', 'x', 'N° Comprobante', 'x', 'Cliente / Asignación',
    'Detalles / Obra', 'x', 'x', 'x', 'Total', 'Tipo pago', 'x', 'x', 'x', 'Monto Pagado', 'x', 'x', 'x', 'Estado',
    'x', 'x', 'x', 'x', 'Rubro de caja', 'Fecha de caja']
  const cols = columnasVivasDeCompras([[], [], CAB])
  assert.deepEqual(cols, { estado: 'X', total: 'O', montoPagado: 'T' })
  assert.equal(columnasVivasDeCompras([[], [], ['nada']]), null, 'encabezado irreconocible → null → valores pegados')
})

test('EL NETEO DE OBRAS RESUELVE SUS LETRAS POR RÓTULO — con la "Fecha" aparte, o nada va vivo', () => {
  const CAB = ['id', 'x', 'Fecha', 'x', 'Proveedor', 'CUIT (OS)', 'x', 'N° Comprobante', 'x', 'Cliente / Asignación',
    'Detalles / Obra', 'x', 'x', 'x', 'Total', 'Tipo pago', 'x', 'x', 'x', 'Monto Pagado', 'x', 'x', 'x', 'Estado',
    'x', 'x', 'x', 'x', 'Rubro de caja', 'Fecha de caja']
  const cols = columnasNeteoDeCompras([[], [], CAB])
  assert.deepEqual(cols, { proveedor: 'E', cliente: 'J', fecha: 'C', total: 'O', pagado: 'T' })
  // Sin la col "Fecha" ("Fecha de caja" NO es "Fecha": el match es exacto) → null → importes pegados.
  const sinFecha = CAB.map((n) => (n === 'Fecha' ? 'x' : n))
  assert.equal(columnasNeteoDeCompras([[], [], sinFecha]), null)
  assert.equal(columnasNeteoDeCompras([[], [], ['nada']]), null, 'encabezado irreconocible → falla cerrado')
})

test('EL ESCRITOR USA LA CELDA VIVA DEL IMPORTE, no `m.importe` pegado', () => {
  const fuente = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  assert.ok(/celdaImporte\(m, colsVivas\)/.test(fuente),
    'la columna C volvió a ser `m.importe`: el parcial del dueño deja de descontar hasta la regeneración')
})

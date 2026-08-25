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
  exigirColumnasNeteo, estadosDecorados, ESTADOS_VIVOS, MARCA_PAGADO, ROTULO_FECHA_COMPRAS,
} from './libro-estado-vivo.mjs'
import { estaPagada, NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'
import { deObras } from './libro-extractores-obras.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
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
    // «Monto Parcial 2» es la W (índice 22), el segundo tramo de pago: está en su posición real.
    'Detalles / Obra', 'x', 'x', 'x', 'Total', 'Tipo pago', 'x', 'x', 'x', 'Monto Pagado', 'x', 'x', 'Monto Parcial 2', 'Estado',
    'x', 'x', 'x', 'x', 'Rubro de caja', 'Fecha de caja']
  const cols = columnasVivasDeCompras([[], [], CAB])
  assert.deepEqual(cols, { estado: 'X', total: 'O', montoPagado: 'T' })
  assert.equal(columnasVivasDeCompras([[], [], ['nada']]), null, 'encabezado irreconocible → null → valores pegados')
})

// ═══ EL NETEO, CONTRA EL ENCABEZADO REAL DE COMPRAS — NO CONTRA UNO INVENTADO ═════════════════════
//
// Este test existía y PASABA mientras el neteo estaba roto en producción, porque su encabezado de
// mentira tenía una columna llamada "Fecha" que el archivo real nunca tuvo. Probaba que el código
// hacía lo que el código decía, no que resolviera la planilla del dueño. Ahora usa el encabezado
// REAL —el mismo de `compras-columnas.test.mjs`, verificado contra el archivo— y por eso el rótulo
// equivocado se pone rojo acá en vez de aparecer como un `⚠` en el log de la corrida nocturna.
const CAB_COMPRAS_REAL = []
;[['A', 'ID'], ['B', 'Categoría'], ['C', 'Fecha factura'], ['D', 'Fecha factura (mes)'], ['E', 'Proveedor'],
  ['F', 'Modalidad'], ['G', 'Tipo'], ['H', 'N° Comprobante'], ['I', 'Unidad de Negocio'],
  ['J', 'Cliente / Asignación'], ['K', 'Detalles / Obra'], ['L', 'Concepto'], ['M', 'Importe'], ['N', 'IVA'],
  ['O', 'Total'], ['P', 'Tipo pago'], ['Q', 'Fecha prevista de pago (día)'], ['R', 'Fecha prevista de pago (mes)'],
  ['S', 'Total o Parcial'], ['T', 'Monto Pagado'], ['U', 'Monto Parcial 1'], ['V', 'Fecha prevista de pago 2'],
  ['W', 'Monto Parcial 2'], ['X', 'Estado'], ['Y', 'Tipo de Costo'], ['Z', 'Estado pago'], ['AA', 'Estado Carga'],
  ['AB', 'Rubro de caja'], ['AC', 'Rubro de caja'], ['AD', 'Fecha de caja'], ['AE', 'Familia de material'],
  ['AF', 'Sub-rubro de estructura'], ['AM', 'CUIT (OS)'],
].forEach(([col, rotulo]) => {
  const i = [...col].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1
  CAB_COMPRAS_REAL[i] = rotulo
})

test('EL NETEO DE OBRAS RESUELVE SUS LETRAS SOBRE EL ENCABEZADO REAL DE COMPRAS', () => {
  const cols = columnasNeteoDeCompras([[], [], CAB_COMPRAS_REAL])
  assert.ok(cols, 'con el encabezado REAL de Compras el neteo TIENE que resolver: si da null, los '
    + 'egresos de obra se publican pegados y se cuentan dos veces cuando la factura entra')
  // C es "Fecha factura" —la fecha del comprobante—, la MISMA que usa obras-pestana.mjs para su real
  // acumulado. E proveedor, J cliente, O total, T monto pagado.
  assert.deepEqual(cols, { proveedor: 'E', cliente: 'J', fecha: 'C', total: 'O', pagado: 'T' })
})

test('el neteo NO se cuelga de "Fecha de caja": lo que descuenta es que la factura ENTRÓ', () => {
  // Sacando "Fecha factura" queda "Fecha de caja" y "Fecha prevista de pago": ninguna sirve, y el
  // match es exacto. Falla cerrado en vez de netear contra la fecha equivocada.
  const sinFactura = CAB_COMPRAS_REAL.map((n) => (n === 'Fecha factura' ? 'x' : n))
  assert.equal(columnasNeteoDeCompras([[], [], sinFactura]), null)
  assert.equal(columnasNeteoDeCompras([[], [], ['nada']]), null, 'encabezado irreconocible → falla cerrado')
})

test('CON EL ENCABEZADO REAL, EL EGRESO DE OBRA SALE COMO FÓRMULA VIVA — no como número pegado', () => {
  // LA CADENA ENTERA, DE PUNTA A PUNTA: encabezado real → letras por rótulo → movimiento del libro.
  // Los dos tests de arriba miran las letras; éste mira lo que se ESCRIBE en la celda, que es el
  // defecto de verdad. Si el rótulo del neteo vuelve a no resolver, `cols` es null, `importeVivo` no
  // existe y el escritor pega `m.importe`: el egreso se cuenta dos veces el día que entra la factura.
  const cols = columnasNeteoDeCompras([[], [], CAB_COMPRAS_REAL])
  const { movimientos } = deObras([{
    clave: 'EMICAR-NAVE', cliente: 'EMICAR', obra: 'Nave EMICAR', inicio: '2026-09-01', fin: '2026-12-15',
    egresos: [{ concepto: 'Estructura metálica', proveedor: 'Aceros Cuyo', monto: 2_500_000, fechaEstimada: '2026-09-10' }],
  }], cols, serialDe(2026, 8, 13))
  assert.equal(movimientos.length, 1)
  const f = movimientos[0].importeVivo
  assert.ok(typeof f === 'string' && f.startsWith('='), `el importe salió PEGADO (${JSON.stringify(f)})`)
  // Netea contra el TOTAL (O) filtrando por proveedor (E), cliente (J) y fecha del comprobante (C).
  assert.ok(f.includes('N(Compras!$O$4:$O)'), `no netea contra el Total de Compras: ${f}`)
  assert.ok(f.includes('Compras!$C$4:$C'), `no filtra por "${ROTULO_FECHA_COMPRAS}": ${f}`)
})

test('SIN NETEO, EL LIBRO NO SE PUBLICA: el aborto NOMBRA la columna que no encontró', () => {
  // Degradar a un número pegado en silencio es peor que caerse: el pegado se lee como bueno. Y un
  // aborto que dice "no pude resolver las columnas" obliga a comparar cinco rótulos a ojo contra la
  // planilla; con el nombre adentro, el arreglo es mirar ESA celda.
  const sinFactura = CAB_COMPRAS_REAL.map((n) => (n === 'Fecha factura' ? 'x' : n))
  assert.throws(() => exigirColumnasNeteo([[], [], sinFactura]), (e) => {
    assert.match(e.message, /"Fecha factura"/, 'el mensaje no nombra la columna que faltó')
    assert.doesNotMatch(e.message, /"Total"/, 'nombra columnas que SÍ estaban: el que lo lea busca donde no es')
    return true
  })
  // Con dos faltantes, los nombra a los dos: media lista manda a una segunda corrida fallida.
  const pelado = CAB_COMPRAS_REAL.map((n) => (n === 'Fecha factura' || n === 'Monto Pagado' ? 'x' : n))
  assert.throws(() => exigirColumnasNeteo([[], [], pelado]), /"Fecha factura".*"Monto Pagado"/s)
  // Y con el encabezado real devuelve las letras sin chistar.
  assert.deepEqual(exigirColumnasNeteo([[], [], CAB_COMPRAS_REAL]),
    { proveedor: 'E', cliente: 'J', fecha: 'C', total: 'O', pagado: 'T' })
})

test('EL SCRIPT EXIGE EL NETEO: no queda ningún camino que degrade a importes pegados', () => {
  const fuente = fs.readFileSync(path.join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  // 24/08: los egresos de obra dejaron de salir de las constantes y salen del cuadro 5 de la pestaña
  // OBRAS (el dueño editó ahí las fechas). La guarda es la misma y sigue siendo obligatoria — sólo
  // cambió QUÉ se cuenta para saber si hay algo que netear.
  assert.match(fuente, /cuadro5\.movimientos\.length \? exigirColumnasNeteo\(compras\)/,
    'la guarda del neteo dejó de exigir las columnas: revisá libro-movimientos-pestana.mjs')
  // Y la segunda puerta: el cuadro 5 no publica el cliente ni el inicio de la obra, así que un grupo
  // sin ficha tampoco puede netear. Ahí también se aborta, con la obra y el proveedor adentro.
  assert.match(fuente, /exigirNeteoDeMateriales\(obrasFuturas\)/,
    'el camino sin ficha de obra volvió a degradar a importes pegados')
  // El degradado silencioso vuelve como un aviso —`console.warn`/`console.log`— que anuncia importes
  // pegados o columnas sin resolver y una corrida que sigue igual. Ése es el patrón prohibido.
  const blando = fuente.split('\n').filter((l) => /console\.(warn|log)/.test(l)
    && /pegad|no pude resolver|columnas de Compras/i.test(l))
  assert.deepEqual(blando, [], 'volvió el aviso blando: la corrida publicaría egresos de obra PEGADOS')
})

test('EL ESCRITOR USA LA CELDA VIVA DEL IMPORTE, no `m.importe` pegado', () => {
  const fuente = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  assert.ok(/celdaImporte\(m, colsVivas\)/.test(fuente),
    'la columna C volvió a ser `m.importe`: el parcial del dueño deja de descontar hasta la regeneración')
})

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bloqueQueSaleCadaDia, COL_QUIENES, COL_TOTAL_DIA, diasQueSalen, diasSinNombre, expresionDias,
  formatosDelBloque, formulaControlPorDia, formulaDia, formulaMedio, formulaQuienes,
  formulaTotalColumna, formulaTotalDelDia, letraDeColumna, MEDIOS_DEL_DIA, mediosSinColumna,
  ROTULOS_POR_DIA, tramo2DeLaFila, tramosDeLaFila, tramosQueNoEntran, ubicarBloque,
  filasQueNecesita,
} from './proveedores-por-dia.mjs'
import { COL, geometriaDeLaSeccion } from './proveedores-pivot-seccion1.mjs'
import { COLCHON_FINAL } from './proveedores-colchon.mjs'
import { COL as COL_TRAMOS } from './deuda-por-tramos.mjs'

/** El número de serie de una fecha en Sheets. La época es el 30/12/1899. */
const D = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse('1899-12-30T00:00:00Z')) / 86400000)

/** Una fila de Compras como la lee el generador (UNFORMATTED_VALUE), con sólo lo que este cuadro usa. */
function fila({ proveedor = 'ALUMETAL', medio = 'Transferencia', q, v = '', w = 0, estado = 'Pendiente', comercial = 1, saldo = 0 } = {}) {
  const f = Array.from({ length: 38 }, () => '')
  f[COL.proveedor] = proveedor
  f[COL.tipoPago] = medio
  f[COL.proximoPago] = q
  f[COL_TRAMOS.fechaPago2] = v
  f[COL_TRAMOS.parcial2] = w
  f[COL.estado] = estado
  f[COL.comercial] = comercial
  f[COL.saldo] = saldo
  return f
}

const bloque = (filas) => bloqueQueSaleCadaDia({ filas, filaTitulo: 40, numeroDeSeccion: 2 })
/** Sin los literales de texto: adentro de comillas la coma es del patrón, no un separador. */
const sinTextos = (f) => String(f).replace(/"[^"]*"/g, '""')
const formulasDe = (b) => b.filas.flat().filter((c) => typeof c === 'string' && c.startsWith('='))

// ═══ EL DEFECTO CENTRAL: EL CUADRO TIENE QUE SUMAR LA DEUDA ENTERA ═══

test('la suma de los TOTAL DEL DÍA iguala el total de la deuda comercial pendiente', () => {
  const filas = [
    fila({ proveedor: 'ALUMETAL', q: D('2026-09-15'), saldo: 1_000_000, medio: 'Cheque' }),
    fila({ proveedor: 'PEDRO TELLO', q: D('2026-09-15'), saldo: 2_950_000, medio: 'Efectivo' }),
    fila({ proveedor: 'TRIELEC', q: D('2026-09-30'), saldo: 500_000, medio: 'Echeq' }),
    // Ruido que NO tiene que entrar: pagada, y no comercial.
    fila({ proveedor: 'YA PAGA', q: D('2026-09-15'), saldo: 9_999_999, estado: 'Pagado' }),
    fila({ proveedor: 'ARCA', q: D('2026-09-15'), saldo: 8_888_888, comercial: 0 }),
  ]
  const { dias, sinDia, total } = diasQueSalen(filas)
  const deuda = 1_000_000 + 2_950_000 + 500_000
  assert.equal(total, deuda)
  assert.equal(sinDia.monto, 0)
  assert.equal(dias.reduce((a, d) => a + d.total, 0) + sinDia.monto, deuda)
  assert.deepEqual(dias.map((d) => d.total), [3_950_000, 500_000])
})

test('la plata SIN fecha de pago no se reparte ni se esconde: sale aparte para que el control la grite', () => {
  const filas = [
    fila({ q: D('2026-09-15'), saldo: 1_000_000 }),
    fila({ proveedor: 'SIN FECHA SRL', q: '', saldo: 400_000 }),
  ]
  const { dias, sinDia, total } = diasQueSalen(filas)
  assert.equal(total, 1_400_000)
  assert.equal(dias.reduce((a, d) => a + d.total, 0), 1_000_000)
  assert.deepEqual(sinDia, { n: 1, monto: 400_000, proveedores: ['SIN FECHA SRL'] })
})

// ═══ LOS DOS TRAMOS: UNA FACTURA PUEDE SALIR EN DOS DÍAS ═══
//
// `Compras!V · Fecha prevista de pago 2` no la leía NADIE del repositorio. Con la lógica que sólo
// mira Q, esta factura aporta $150.000 a un solo día y el 30/09 no existe: el día que alguien cargue
// un pago en dos tramos que todavía no venció, el cuadro manda a pagar de más el 15 y de menos el 30.

test('una factura con SEGUNDO TRAMO (V y W) aporta a DOS días, y la suma sigue cerrando', () => {
  const filas = [fila({
    proveedor: 'HORMISERV', medio: 'Transferencia', saldo: 150_000,
    q: D('2026-09-15'), v: D('2026-09-30'), w: -50_000,
  })]
  const { dias, total } = diasQueSalen(filas)
  assert.equal(dias.length, 2, 'el segundo tramo tiene fecha propia: son dos días, no uno')
  assert.deepEqual(dias.map((d) => d.dia), [D('2026-09-15'), D('2026-09-30')])
  assert.deepEqual(dias.map((d) => d.total), [100_000, 50_000])
  assert.equal(dias.reduce((a, d) => a + d.total, 0), total)
  assert.equal(total, 150_000, 'la aritmética del saldo no se toca: los dos tramos suman el saldo')
})

test('un Monto Parcial POSITIVO ya salió: no crea un segundo día (sería contar la misma plata dos veces)', () => {
  // Positivo = pago hecho, y `deuda-por-tramos` ya lo restó del saldo (verificado contra las 19
  // facturas reales con error $0). Ponerlo como pago futuro lo cobraría de nuevo.
  const f = fila({ saldo: 150_000, q: D('2026-09-15'), v: D('2026-09-30'), w: 50_000 })
  assert.equal(tramo2DeLaFila(f), 0)
  assert.deepEqual(tramosDeLaFila(f), [{ dia: D('2026-09-15'), monto: 150_000 }])
})

test('un W entre paréntesis SIN fecha 2 se paga todo el día de Q: sin fecha propia no hay segundo día', () => {
  const f = fila({ saldo: 150_000, q: D('2026-09-15'), v: '', w: -150_000 })
  assert.deepEqual(tramosDeLaFila(f), [{ dia: D('2026-09-15'), monto: 150_000 }])
})

test('un segundo tramo MAYOR que el saldo se ve (tramo 1 negativo) y se reporta: es carga mal hecha', () => {
  const filas = [fila({ proveedor: 'DUPEC', saldo: 100_000, q: D('2026-09-15'), v: D('2026-09-30'), w: -180_000 })]
  const { dias, total } = diasQueSalen(filas)
  assert.equal(total, 100_000, 'el cuadro sigue cerrando contra el saldo')
  assert.deepEqual(dias.map((d) => d.total), [-80_000, 180_000])
  assert.deepEqual(tramosQueNoEntran(filas), [{ proveedor: 'DUPEC', saldo: 100_000, tramo2: 180_000 }])
})

// ═══ NINGÚN DÍA SIN NOMBRES ═══

test('todo día del cuadro trae sus nombres, sin repetir al proveedor que tiene dos facturas', () => {
  const filas = [
    fila({ proveedor: 'PEDRO TELLO', q: D('2026-09-15'), saldo: 1_000_000 }),
    fila({ proveedor: 'PEDRO TELLO', q: D('2026-09-15'), saldo: 1_950_000 }),
    fila({ proveedor: 'ALUMETAL', q: D('2026-09-15'), saldo: 500_000 }),
  ]
  const { dias } = diasQueSalen(filas)
  assert.deepEqual(dias[0].proveedores, ['PEDRO TELLO', 'ALUMETAL'])
  assert.deepEqual(diasSinNombre({ dias }), [])
  for (const d of dias) assert.ok(d.proveedores.length > 0, `el día ${d.dia} quedó sin nombres`)
})

test('un día cuyo proveedor está vacío en Compras se DENUNCIA: es el agujero que el pivot publicaba', () => {
  const { dias } = diasQueSalen([fila({ proveedor: '', q: D('2026-09-15'), saldo: 700_000 })])
  assert.equal(diasSinNombre({ dias }).length, 1)
})

test('cada fila de día del bloque emite su fórmula de nombres sobre el rango vivo de Compras', () => {
  const b = bloque([
    fila({ q: D('2026-09-15'), saldo: 1_000_000 }),
    fila({ q: D('2026-09-30'), saldo: 500_000 }),
  ])
  const cuerpo = b.filas.slice(2, 2 + b.modelo.dias.length)
  assert.equal(cuerpo.length, 2)
  for (const f of cuerpo) {
    assert.match(String(f[COL_QUIENES]), /^=IF\(\$A\d+="";"";IFERROR\(TEXTJOIN\(" · ";TRUE;UNIQUE\(FILTER\(Compras!\$E\$4:\$E;/)
  }
})

// ═══ EL ALTO DECLARADO ═══

test('el alto declarado coincide con el emitido, y las anclas de abajo se derivan de él', () => {
  for (const n of [0, 1, 3, 12]) {
    const filas = Array.from({ length: n }, (_, i) => fila({ q: D('2026-09-01') + i, saldo: 1000 * (i + 1) }))
    const b = bloque(filas)
    assert.equal(b.alto, b.filas.length, `alto declarado ${b.alto} ≠ ${b.filas.length} filas emitidas`)
    assert.equal(b.filaControl - b.filaTitulo + 1, b.alto, 'la última fila del bloque no es su alto')
    assert.equal(b.ultimaFila - b.primeraFila + 1, Math.max(n, 1))
    assert.equal(b.filaTotal, b.ultimaFila + 1, 'el TOTAL va pegado al último día: sin filas de colchón')
  }
})

test('todas las filas del bloque tienen el ancho declarado: el generador es dueño de TODO su ancho', () => {
  const b = bloque([fila({ q: D('2026-09-15'), saldo: 1_000_000 })])
  for (const f of b.filas) assert.equal(f.length, ROTULOS_POR_DIA.length)
  assert.deepEqual(b.filas[1], [...ROTULOS_POR_DIA])
  assert.equal(ROTULOS_POR_DIA[COL_TOTAL_DIA], 'TOTAL DEL DÍA')
  assert.equal(ROTULOS_POR_DIA[COL_QUIENES], 'A quiénes')
})

// ═══ LOCALE es_AR ═══

test('NINGUNA fórmula usa la coma como separador de argumentos (es_AR: la coma es el decimal)', () => {
  const b = bloque([
    fila({ q: D('2026-09-15'), saldo: 1_000_000 }),
    fila({ q: D('2026-09-30'), saldo: 500_000, v: D('2026-10-15'), w: -100_000 }),
  ])
  const fs = formulasDe(b)
  assert.ok(fs.length >= 3 * 7, 'el bloque tiene que estar hecho de fórmulas, no de valores pegados')
  for (const f of fs) assert.ok(!sinTextos(f).includes(','), `separador con coma (rompe en es-AR): ${f}`)
  for (const f of [expresionDias(), formulaDia(10), formulaMedio('Efectivo', 10), formulaTotalDelDia(10),
    formulaQuienes(10), formulaTotalColumna('F', 10, 20),
    formulaControlPorDia({ filaTotal: 21, primeraFila: 10, ultimaFila: 20 })]) {
    assert.ok(!sinTextos(f).includes(','), `separador con coma: ${f}`)
  }
})

test('el patrón de TEXT va en convención US aunque el archivo sea es_AR', () => {
  const c = formulaControlPorDia({ filaTotal: 21, primeraFila: 10, ultimaFila: 20 })
  assert.ok(c.includes('TEXT(SUM(Compras!$AL$4:$AL)-$F$21;"$#,##0")'), c)
  // El patrón lleva `,` de miles y `.` decimal SIEMPRE, aunque el archivo dibuje al revés: adentro
  // de un patrón la coma no es un separador de argumentos. `0,00` no son dos decimales, son "003".
  assert.ok(!/TEXT\([^;]*;"[^"]*\."/.test(c), 'ningún patrón de esta fórmula pide decimales')
})

// ═══ LAS COLUMNAS SALEN DE UNA SOLA FUENTE ═══

test('los offsets de Compras son los mismos en las dos libs: dos listas es cómo se lee la columna de al lado', () => {
  assert.equal(COL.proveedor, COL_TRAMOS.proveedor)
  assert.equal(COL.proximoPago, COL_TRAMOS.fechaPago)
  assert.equal(COL.estado, COL_TRAMOS.estado)
  assert.equal(COL.comercial, COL_TRAMOS.comercial)
  assert.equal(COL.saldo, COL_TRAMOS.saldo)
})

test('las letras salen de los offsets, no tipeadas', () => {
  assert.equal(letraDeColumna(COL.proveedor), 'E')
  assert.equal(letraDeColumna(COL.tipoPago), 'P')
  assert.equal(letraDeColumna(COL.proximoPago), 'Q')
  assert.equal(letraDeColumna(COL_TRAMOS.fechaPago2), 'V')
  assert.equal(letraDeColumna(COL_TRAMOS.parcial2), 'W')
  assert.equal(letraDeColumna(COL.estado), 'X')
  assert.equal(letraDeColumna(COL.comercial), 'AJ')
  assert.equal(letraDeColumna(COL.saldo), 'AL')
})

test('el universo del cuadro es el de la sección 1: Pendiente y comercial', () => {
  const f = formulaTotalDelDia(18)
  assert.ok(f.includes('(Compras!$X$4:$X="Pendiente")*(Compras!$AJ$4:$AJ=1)'), f)
})

// ═══ EL CONTROL NO SE VALIDA CONTRA LO QUE ÉL MISMO PRODUCE ═══

test('el TOTAL DEL DÍA no es la suma de las cuatro columnas: se calcula sobre el universo entero', () => {
  const f = formulaTotalDelDia(18)
  assert.ok(!f.includes('$B18'), 'el total no puede depender de las columnas que el control compara contra él')
  assert.ok(!f.includes('Compras!$P$4:$P'), 'el total no filtra por medio de pago: entra la tarjeta también')
})

test('un medio de pago sin columna se reporta antes de escribir y el control lo dice en el archivo', () => {
  const filas = [
    fila({ q: D('2026-09-15'), saldo: 1_000_000, medio: 'Transferencia' }),
    fila({ proveedor: 'YPF', q: D('2026-09-15'), saldo: 300_000, medio: 'Tarjeta Crédito' }),
  ]
  const { dias } = diasQueSalen(filas)
  assert.equal(dias[0].total, 1_300_000, 'el total del día incluye lo que sale por tarjeta')
  assert.equal(dias[0].porMedio.Transferencia, 1_000_000)
  assert.equal(dias[0].otrosMedios, 300_000)
  assert.deepEqual(mediosSinColumna(filas), [{ medio: 'Tarjeta Crédito', monto: 300_000 }])
  const c = formulaControlPorDia({ filaTotal: 21, primeraFila: 10, ultimaFila: 20 })
  assert.ok(c.includes('SUM($B$21:$E$21)'), c)
  assert.ok(c.includes('un medio de pago que no tiene columna'), c)
})

test('el control compara contra un camino INDEPENDIENTE del cuadro: la columna de saldo de Compras', () => {
  const c = formulaControlPorDia({ filaTotal: 21, primeraFila: 10, ultimaFila: 20 })
  assert.ok(c.includes('SUM(Compras!$AL$4:$AL)'), c)
  assert.ok(c.startsWith('=IF(ROUND('), c)
})

// ═══ ORDEN Y FORMATO ═══

test('los días van en orden: las fechas ascendentes primero, los textos después (el SORT de Sheets)', () => {
  const filas = [
    fila({ q: 'Pendiente', saldo: 100 }),
    fila({ q: D('2026-09-30'), saldo: 200 }),
    fila({ q: D('2026-09-15'), saldo: 300 }),
  ]
  const { dias } = diasQueSalen(filas)
  assert.deepEqual(dias.map((d) => d.dia), [D('2026-09-15'), D('2026-09-30'), 'Pendiente'])
})

test('el "$" es del TOTAL y el cero del cuerpo se dibuja "—", nunca 0', () => {
  const b = bloque([fila({ q: D('2026-09-15'), saldo: 1_000_000 })])
  const reqs = formatosDelBloque({ sheetId: 7, bloque: b })
  const patrones = reqs.map((r) => r.repeatCell.cell.userEnteredFormat.numberFormat.pattern)
  assert.ok(patrones.includes('#,##0;(#,##0);"—"'), 'el cuerpo va sin "$" y con el cero en raya')
  assert.ok(patrones.includes('"$"#,##0;("$"#,##0);"—"'), 'la fila de TOTAL es la única que declara la unidad')
  assert.ok(patrones.includes('dd/mm/yyyy'), 'la columna del día lleva formato de FECHA, no el serial pelado')
  const dia = reqs[0].repeatCell.range
  assert.equal(dia.startRowIndex, b.primeraFila - 1)
  assert.equal(dia.endRowIndex, b.ultimaFila)
})

test('cada columna del cuerpo declara su formato en cada corrida: una celda hereda el que ya tenía', () => {
  const b = bloque([fila({ q: D('2026-09-15'), saldo: 1_000_000 })])
  const reqs = formatosDelBloque({ sheetId: 7, bloque: b })
  const columnas = new Set(reqs.map((r) => r.repeatCell.range.startColumnIndex))
  assert.deepEqual([...columnas].sort((a, x) => a - x), [0, 1, 2, 3, 4, 5, 6])
})

test('los cuatro medios son los de Compras y el orden lo fija el rótulo', () => {
  assert.deepEqual([...MEDIOS_DEL_DIA], ['Efectivo', 'Cheque', 'Echeq', 'Transferencia'])
  for (const m of MEDIOS_DEL_DIA) assert.ok(formulaMedio(m, 18).includes(`(Compras!$P$4:$P="${m}")`))
})

// ═══ DÓNDE VA EL BLOQUE: DOS ANCLAS DE TEXTO, NINGUNA SALIDA PROPIA ═══

/** Una pestaña de mentira: sólo la columna A, que es donde viven los títulos. */
const pestana = (colA) => colA.map((t) => [t])

test('la primera vez el bloque se ubica donde HOY empieza la sección de abajo, y todo se corre', () => {
  const v = pestana([
    'Proveedores', '', '1 · QUÉ SE DEBE Y CUÁNDO', '', 'ALUMETAL', '', '',
    '3 · CUENTA CORRIENTE POR PROVEEDOR', 'Proveedor',
  ])
  assert.deepEqual(ubicarBloque(v), { sec1: 3, filaTitulo: 8, siguiente: 8, existe: false, disponibles: 0 })
})

test('cuando ya está, el bloque va de su título al título de la sección que sigue', () => {
  const v = pestana([
    '1 · QUÉ SE DEBE Y CUÁNDO', 'ALUMETAL', '', '2 · QUÉ SALE CADA DÍA', 'Día', '15/09/2026', 'TOTAL',
    '', '', '3 · CUENTA CORRIENTE POR PROVEEDOR',
  ])
  const u = ubicarBloque(v)
  assert.equal(u.filaTitulo, 4)
  assert.equal(u.siguiente, 10)
  assert.equal(u.existe, true)
  assert.equal(u.disponibles, 6)
})

test('sin el ancla de arriba NO se escribe: una posición supuesta pisa otro bloque', () => {
  assert.throws(() => ubicarBloque(pestana(['Proveedores', '3 · CUENTA CORRIENTE POR PROVEEDOR'])),
    /QUÉ SE DEBE Y CUÁNDO/)
})

test('sin el título de la sección de abajo NO se escribe: sin límite, escribir es pisar', () => {
  assert.throws(() => ubicarBloque(pestana(['1 · QUÉ SE DEBE Y CUÁNDO', 'ALUMETAL'])),
    /sección que sigue/)
})

test('un bloque que aparece ARRIBA de la sección 1 frena la corrida en vez de escribir al revés', () => {
  const v = pestana(['2 · QUÉ SALE CADA DÍA', '1 · QUÉ SE DEBE Y CUÁNDO', '3 · CUENTA CORRIENTE POR PROVEEDOR'])
  assert.throws(() => ubicarBloque(v), /ARRIBA de la sección 1/)
})

test('el aire entre el bloque y la sección de abajo es el mismo de toda la pestaña', () => {
  const b = bloque([fila({ q: D('2026-09-15'), saldo: 1_000_000 })])
  assert.equal(filasQueNecesita(b), b.alto + COLCHON_FINAL)
})

// ═══ EL LÍMITE DE LA SECCIÓN 1 YA NO ES "LA SECCIÓN 2" ═══

test('la sección 1 se limita con la sección que SIGUE, sea cual sea su número', () => {
  const conNueva = pestana([
    'Proveedores', '', '', '', '', '', '', '', '', '', '', '', '',
    '1 · QUÉ SE DEBE Y CUÁNDO', '', 'control', 'Proveedor', 'ALUMETAL',
    '2 · QUÉ SALE CADA DÍA',
  ])
  assert.equal(geometriaDeLaSeccion(conNueva).filaLimite, 19)
  // Y el día que la de abajo sea otra —o que se renumere antes de que el bloque exista— sigue
  // encontrando el límite en vez de frenar la sección 1 entera por un número ajeno.
  const conTres = pestana([
    'Proveedores', '', '', '', '', '', '', '', '', '', '', '', '',
    '1 · QUÉ SE DEBE Y CUÁNDO', '', 'control', 'Proveedor', 'ALUMETAL',
    '3 · CUENTA CORRIENTE POR PROVEEDOR',
  ])
  assert.equal(geometriaDeLaSeccion(conTres).filaLimite, 19)
})

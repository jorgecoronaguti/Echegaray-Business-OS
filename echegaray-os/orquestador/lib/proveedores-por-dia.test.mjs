import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bloqueQueSaleCadaDia, COL_QUIENES, COL_TOTAL_DIA, diasQueSalen, diasSinNombre, expresionDias,
  filasDeControlPorDia, formatosDelBloque, formulaDia, formulaMedio, formulaQuienes,
  formulaTotalColumna, formulaTotalDelDia, letraDeColumna, MEDIOS_DEL_DIA, mediosSinColumna,
  ROTULOS_POR_DIA, tramo2DeLaFila, tramosDeLaFila, tramosQueNoEntran, ubicarBloque,
  filasQueNecesita, residuoDelBloque, ROTULOS_CONTROL, saldoDeCompras, universoPendiente,
} from './proveedores-por-dia.mjs'
import { COL, geometriaDeLaSeccion } from './proveedores-pivot-seccion1.mjs'
import { COLCHON_FINAL } from './proveedores-colchon.mjs'
import { COL as COL_TRAMOS } from './deuda-por-tramos.mjs'
import { esProsa } from './diseno-unificado.mjs'

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
    // La última fila del bloque es el SEGUNDO control: el pie son dos desde que dejó de ser una
    // oración. Contar sólo el primero es exactamente cómo un bloque declara menos de lo que escribe.
    assert.equal(b.filasControl.at(-1) - b.filaTitulo + 1, b.alto, 'la última fila del bloque no es su alto')
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
    ...filasDeControlPorDia({ filaTotal: 21 }).map(([, f]) => f)]) {
    assert.ok(!sinTextos(f).includes(','), `separador con coma: ${f}`)
  }
})

// ═══ EL PIE DEJÓ DE ARMAR TEXTO: EL FORMATO DIBUJA EL NÚMERO ═══
//
// Armaba el importe con `TEXT(…;"$#,##0")` adentro de una oración, y ese patrón tenía que ir en
// convención US aunque el archivo sea es_AR. Ahora la celda publica un NÚMERO pelado y quien lo
// dibuja es `MONEDA_CONTROL`: no hay patrón que pueda quedar en el locale equivocado, que es la
// forma más barata de no volver a tener ese defecto.
test('el pie publica números, no texto armado: ni un TEXT() ni una oración', () => {
  for (const [rotulo, f] of filasDeControlPorDia({ filaTotal: 21 })) {
    assert.ok(!f.includes('TEXT('), `el pie vuelve a armar texto: ${f}`)
    assert.ok(f.startsWith('=ROUND('), f)
    assert.ok(rotulo.startsWith('⇒ '), `un control abre con ⇒: ${rotulo}`)
    assert.ok(rotulo.length <= 60, `${rotulo.length} caracteres: es una oración, no un rótulo`)
  }
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
  const [, medios] = filasDeControlPorDia({ filaTotal: 21 })
  assert.ok(medios[1].includes('SUM($B$21:$E$21)'), medios[1])
  assert.ok(/medio de pago sin columna/.test(medios[0]), medios[0])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO · UN CONTROL QUE COMPARA CONTRA OTRA POBLACIÓN (09/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Comparaba el total del cuadro contra `SUM(Compras!$AL$4:$AL)`: TODOS los saldos de Compras, sin
// filtrar ni por estado ni por comercial. El titular del cuadro y sus siete columnas miran
// `universoPendiente()`. Con dos poblaciones distintas la resta nunca puede dar cero, así que la
// alerta quedaba encendida siempre y dejaba de significar algo.
test('EL DEFECTO · el control mide el MISMO universo que el cuadro, y por un camino independiente', () => {
  const [deuda] = filasDeControlPorDia({ filaTotal: 21 })
  assert.ok(deuda[1].includes(universoPendiente()), `no filtra el universo del cuadro: ${deuda[1]}`)
  assert.ok(!/SUM\(Compras!\$AL\$4:\$AL\)/.test(deuda[1]), `vuelve al total sin filtrar: ${deuda[1]}`)
  // Independiente: no suma las celdas del cuadro, va a Compras. Un control validado contra la
  // información que él mismo produce no puede dar rojo nunca.
  assert.ok(deuda[1].includes(saldoDeCompras()), deuda[1])
  assert.ok(!deuda[1].includes('SUM($B$21'), deuda[1])
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// MINIMALISMO EXTREMO — LO QUE LA CELDA PUBLICA NO EXPLICA (06/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// EL DEFECTO, medido con `auditar-diseno-unificado.mjs` sobre «Proveedores» en el archivo vivo:
// A88 publicaba 72 caracteres de prosa que ningún auditor de VALORES podía ver, porque el
// texto vive adentro de un `IF` y el valor de una fórmula, en frío, es la fórmula.
//
// Se mide con `esProsa`, el mismo núcleo puro que audita el Sheet: cualquier párrafo nuevo que
// alguien meta adentro de esta fórmula da rojo acá y no dos horas después en la pantalla del dueño.
test('EL DEFECTO · el control del cuadro por día dice cuánto falta, no por qué puede faltar', () => {
  for (const fila of filasDeControlPorDia({ filaTotal: 87 })) {
    for (const celda of fila) {
      const p = esProsa(celda)
      assert.equal(p, null, `el pie publica prosa: ${JSON.stringify(p)}`)
    }
  }
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL DEFECTO · EL PIE DE UN CUADRO DE SEIS DÍAS SOBREVIVIENDO A UN CUADRO DE TRES (09/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Medido en el archivo vivo: A88 publicaba «▲ el cuadro no muestra $16.730.193 de deuda» con la
// fórmula apuntando a `$F$87`. Ese `$F$87` era el TOTAL de cuando el cuadro tenía seis días; hoy
// tiene tres y su TOTAL está seis filas más arriba. Las dos filas del pie viejo quedaron abajo,
// mostrando el control de un total que ya no existe.
//
// El mecanismo de aire sólo entraba con `delta < 0` y borraba las filas de ABAJO —las pegadas al
// título siguiente, que están en blanco—, nunca el residuo propio. A la segunda corrida
// `necesita == disponibles`, `delta == 0`, y el residuo quedaba fuera de alcance para siempre.
test('EL DEFECTO · el bloque limpia lo que escribió abajo cuando se achica, incluso con delta = 0', () => {
  // La geometría real del día del defecto: el bloque arranca en la 78, hoy mide 10 filas (título +
  // rótulos + 3 días + TOTAL + 2 controles = 8) y el pie viejo quedó en la 87-88.
  const alto = 8
  const filaTitulo = 78
  const siguiente = 104   // el título de la sección 3
  const r = residuoDelBloque({ filaTitulo, alto, siguiente })
  assert.equal(r.desde, 86, 'el residuo arranca en la primera fila DEBAJO del bloque de hoy')
  assert.equal(r.hasta, siguiente, 'y llega hasta el título de abajo: todo eso es del bloque')
  assert.ok(r.desde <= 87 && 88 < r.hasta, 'las filas 87 y 88 —el pie viejo— quedan dentro de lo que se limpia')
})

test('sin ancla de abajo el bloque NO limpia: sin límite, borrar es borrar de otro dueño', () => {
  assert.deepEqual(residuoDelBloque({ filaTitulo: 78, alto: 8, siguiente: 0 }), { desde: 0, hasta: 0 })
  assert.deepEqual(residuoDelBloque({ filaTitulo: 0, alto: 8, siguiente: 104 }), { desde: 0, hasta: 0 })
  // Y cuando el bloque termina PEGADO al título siguiente no hay nada abajo que sea suyo.
  assert.deepEqual(residuoDelBloque({ filaTitulo: 78, alto: 8, siguiente: 86 }), { desde: 0, hasta: 0 })
})

test('el pie son DOS filas del bloque, con sus rótulos y su número al lado', () => {
  const b = bloque([
    fila({ q: D('2026-09-15'), saldo: 1_000_000 }),
    fila({ q: D('2026-09-30'), saldo: 500_000 }),
  ])
  assert.deepEqual(b.filasControl, [b.filaTotal + 1, b.filaTotal + 2])
  assert.equal(b.alto, b.filasControl[1] - b.filaTitulo + 1, 'el alto declarado tiene que contar las dos')
  const pie = b.filas.slice(-2)
  assert.deepEqual(pie.map((f) => f[0]), [...ROTULOS_CONTROL])
  for (const f of pie) {
    assert.equal(f.length, ROTULOS_POR_DIA.length, 'el pie ocupa TODO el ancho del bloque')
    assert.ok(String(f[1]).startsWith('=ROUND('), 'el número va en la B, al lado del rótulo')
    assert.deepEqual(f.slice(2), Array.from({ length: ROTULOS_POR_DIA.length - 2 }, () => null))
  }
})

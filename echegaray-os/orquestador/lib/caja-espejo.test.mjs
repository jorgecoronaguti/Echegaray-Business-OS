// El espejo de CAJA se prueba contra la GRILLA REAL leída de la pestaña el 18/09/2026 (sólo lectura),
// recortada a lo que `readSheetGrid` devuelve. Los números que se afirman acá son los que el dueño veía
// en CAJA ese día: el test clava lo que la pestaña MOSTRABA, no lo que el código calcula.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  a1, armarGraficos, celda, decidirEscritura, esError, leerCaja, leerPortada, leerSecciones, planDeGraficos, rangosDeGraficos, serialAIso,
} from './caja-espejo.mjs'

/** La grilla con UNA celda cambiada (fila y columna 0-based). `null` la vacía. */
const con = (fila, col, cambio) => ({ filas: grid.filas.map((f, i) => (i === fila ? f.map((c, j) => (j === col ? (cambio === null ? null : { ...c, ...cambio }) : c)) : f)) })
const filaDe = (rotulo) => grid.filas.findIndex((f) => f.some((c) => c?.valor === rotulo))

const grid = JSON.parse(readFileSync(new URL('./caja-espejo.fixture.json', import.meta.url), 'utf8'))

test('la portada son las cinco tarjetas de la pestaña, con el texto que se ve', () => {
  const p = leerPortada(grid.filas)
  assert.equal(p.titulo, 'POSICIÓN DE CAJA')
  assert.deepEqual(p.tarjetas.map((t) => t.rotulo), [
    'CAJA DISPONIBLE', 'DEUDA ATRASADA Y DEL MES', 'SI NO COBRÁS MÁS ESTE MES', 'CAJA INVERTIDA', 'SALDO AL CIERRE',
  ])
  assert.deepEqual(p.tarjetas.map((t) => t.valor.texto), ['$80.072.343', '$27.448.290', '$52.624.052', '$45.191.415', '$116.603.171'])
  assert.equal(p.tarjetas[0].contexto, 'al 18/09 · ▲ $0,8M de este total son del 03/09')
  assert.equal(p.tarjetas[3].contexto, 'Balanz · a mano al 05/08 ▲ 44d')
  // El número detrás es el effectiveValue, sin redondear: sirve para medir, no se dibuja.
  assert.equal(p.tarjetas[0].valor.numero, 80072342.72033)
})

test('las secciones se ubican por su rótulo: dos tablas y dos listas', () => {
  const s = leerSecciones(grid.filas, 2)
  assert.deepEqual(s.map((x) => [x.numero, x.forma]), [[1, 'tabla'], [2, 'tabla'], [3, 'lista'], [4, 'lista']])
  const [cuentas, venc, alertas, acciones] = s
  assert.deepEqual(cuentas.encabezados, ['Cuenta', 'Importe en origen', 'Saldo en pesos', 'Fecha del saldo'])
  assert.deepEqual(cuentas.filas.map((f) => f.celdas[0].texto), [
    'Efectivo en pesos', 'Efectivo en dólares', 'Santander · cta cte ARS', 'Santander · cta cte USD',
    'Balanz · inversiones ARS ‖ invertido', 'Balanz · inversiones USD ‖ invertido',
    'Valores a depositar ‖ no suma al total', 'Movimientos posteriores al corte', 'Total disponibilidades ‖ percibido',
  ])
  // DOS MONEDAS: el importe en origen dice U$S y el saldo en pesos es otra celda. Nunca se mezclan.
  const usd = cuentas.filas.find((f) => f.clave === 'santander-cta-cte-usd')
  assert.equal(usd.celdas[1].texto, 'U$S 507,53')
  assert.equal(usd.celdas[2].texto, '766.757')
  assert.equal(usd.celdas[3].fecha, '2026-09-03')
  assert.equal(cuentas.filas.at(-1).celdas[2].texto, '$80.072.343')
  // La escalera: su última fila (el piso) cae dentro de la sección aunque las de arriba tengan huecos.
  assert.deepEqual(venc.encabezados, ['Tramo', 'Hasta', 'Neto', 'Saldo después'])
  assert.equal(venc.filas.length, 7)
  assert.deepEqual(venc.filas.at(-1).celdas.map((c) => c.texto), ['⇒ Peor caso · piso', '', '$23.548.280', '$62.776.991'])
  assert.equal(venc.filas[0].celdas[2].texto, '(12.293.790)')
  assert.deepEqual(alertas.items.map((i) => i.texto), [
    '▲ No cierra $123.198.145 · manda efectivo sin depositar $123.198.145',
    '▲ Falta cargar $763.365 · manda cheques sin marca $763.365',
  ])
  assert.deepEqual(acciones.items.map((i) => i.texto), [
    'Hay $52.776.991 colocables, con vencimiento', 'Preparar $18.054.315 de pagos que vencen antes del 25/09',
  ])
})

test('el texto del titular de la tarjeta es el mismo que el total de la tabla (misma celda de origen)', () => {
  const f = leerCaja({ grid })
  const total = f.secciones[0].filas.find((x) => x.clave.startsWith('total-disponibilidades'))
  assert.equal(f.portada.tarjetas[0].valor.texto, total.celdas[2].texto)
})

test('si falta el ancla, no se publica: tira con el rótulo que falta', () => {
  const sinPortada = { filas: grid.filas.map((f) => f.map((c) => (c?.valor === 'CAJA DISPONIBLE' ? { ...c, valor: 'OTRA COSA' } : c))) }
  assert.throws(() => leerCaja({ grid: sinPortada }), /CAJA DISPONIBLE/)
  assert.throws(() => leerCaja({ grid: { filas: [] } }), /vacía/)
  const sinSecciones = { filas: grid.filas.map((f) => f.map((c) => (/^\d+ · /.test(c?.valor ?? '') ? null : c))) }
  assert.throws(() => leerCaja({ grid: sinSecciones }), /sección/)
})

test('una tarjeta sin valor no se publica en blanco', () => {
  const g = { filas: grid.filas.map((f, i) => (i === 2 ? f.map((c, j) => (j === 4 ? null : c)) : f)) }
  assert.throws(() => leerPortada(g.filas), /SI NO COBRÁS/)
})

test('una fila nueva en el medio corre todo y el espejo la sigue (no hay letras fijas)', () => {
  const vacia = Array(10).fill(null)
  const g = { filas: [vacia, ...grid.filas.slice(0, 6), [{ valor: 'Banco Galicia · cta cte ARS' }, { valor: '1.000', numero: 1000 }, { valor: '1.000', numero: 1000 }], ...grid.filas.slice(6)] }
  const f = leerCaja({ grid: g })
  assert.equal(f.portada.tarjetas[0].valor.texto, '$80.072.343')
  assert.equal(f.secciones[0].filas[0].celdas[0].texto, 'Banco Galicia · cta cte ARS')
  assert.equal(f.secciones[0].filas.length, 10)
})

test('la huella cambia con cualquier texto visible y no con la hora', () => {
  const a = leerCaja({ grid })
  const b = leerCaja({ grid })
  assert.equal(a.huella, b.huella)
  const g = { filas: grid.filas.map((f, i) => (i === 2 ? f.map((c, j) => (j === 0 ? { ...c, valor: '$80.072.344' } : c)) : f)) }
  assert.notEqual(leerCaja({ grid: g }).huella, a.huella)
  assert.equal(decidirEscritura({ huella: a.huella }, b), 'confirmar')
  assert.equal(decidirEscritura(null, b), 'insertar')
  assert.equal(decidirEscritura({ huella: 'otra' }, b), 'insertar')
})

test('celdas y fechas', () => {
  assert.equal(serialAIso(46283), '2026-09-18')
  assert.deepEqual(celda({ valor: '17/09/2026', numero: 46282, formato: 'DATE' }), { texto: '17/09/2026', numero: 46282, fecha: '2026-09-17' })
  assert.deepEqual(celda(null), { texto: '', numero: null, fecha: null })
  assert.equal(a1("_CAJA_ANEXO", { startRowIndex: 259, endRowIndex: 290, startColumnIndex: 7, endColumnIndex: 8 }), "'_CAJA_ANEXO'!H260:H290")
  assert.equal(a1("O'Brien", { startRowIndex: 0, endRowIndex: 1, startColumnIndex: 26, endColumnIndex: 28 }), "'O''Brien'!AA1:AB1")
})

test('los gráficos leen LOS MISMOS rangos que el gráfico de la pestaña, con el nombre de la serie en el encabezado', () => {
  const spec = {
    sheets: [
      { properties: { sheetId: 1, title: 'CAJA' }, charts: [{ chartId: 9, position: { overlayPosition: { anchorCell: { rowIndex: 22 } } }, spec: { title: 'Proyección', subtitle: 's', basicChart: {
        chartType: 'COMBO', headerCount: 1, stackedType: 'STACKED',
        domains: [{ domain: { sourceRange: { sources: [{ sheetId: 2, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 1 }] } } }],
        series: [{ type: 'COLUMN', targetAxis: 'LEFT_AXIS', series: { sourceRange: { sources: [{ sheetId: 2, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 }] } } },
          { type: 'LINE', targetAxis: 'RIGHT_AXIS', lineStyle: { type: 'MEDIUM_DASHED' }, series: { sourceRange: { sources: [{ sheetId: 2, startRowIndex: 0, endRowIndex: 3, startColumnIndex: 2, endColumnIndex: 3 }] } } }],
      } } }] },
      { properties: { sheetId: 2, title: '_CAJA_ANEXO' } },
      { properties: { sheetId: 3, title: 'Otra' }, charts: [{ chartId: 1, spec: { title: 'no es de CAJA', basicChart: {} } }] },
    ],
  }
  const plan = planDeGraficos(spec)
  assert.equal(plan.length, 1)
  assert.deepEqual(rangosDeGraficos(plan), ["'_CAJA_ANEXO'!A1:A3", "'_CAJA_ANEXO'!B1:B3", "'_CAJA_ANEXO'!C1:C3"])
  const leidos = new Map([
    ["'_CAJA_ANEXO'!A1:A3", { texto: [['Día'], ['18/09'], ['19/09']], crudo: [['Día'], [46283], [46284]] }],
    ["'_CAJA_ANEXO'!B1:B3", { texto: [['Sale'], ['1.000'], ['']], crudo: [['Sale'], [1000], ['']] }],
    ["'_CAJA_ANEXO'!C1:C3", { texto: [['Saldo'], ['5'], ['4']], crudo: [['Saldo'], [5], [4]] }],
  ])
  const [g] = armarGraficos(plan, leidos)
  assert.deepEqual(g.dominio, ['18/09', '19/09'])
  assert.deepEqual(g.series.map((s) => [s.nombre, s.tipo, s.eje, s.punteada, s.valores]), [
    ['Sale', 'COLUMN', 'LEFT_AXIS', false, [1000, null]],
    ['Saldo', 'LINE', 'RIGHT_AXIS', true, [5, 4]],
  ])
  assert.equal(g.fila, 23)
  assert.throws(() => armarGraficos(plan, new Map()), /no volvió/)
})

// ═══ LO QUE AHORA TIRA (auditoría 18/09/2026: «leerCaja publica a medias») ═══

test('R1 · «1 - DISTRIBUCIÓN» con guión ya no hace desaparecer la sección 1: tira', () => {
  const f = filaDe('1 · DISTRIBUCIÓN POR CUENTAS   Extracto · al 18/09/2026')
  assert.throws(() => leerCaja({ grid: con(f, 0, { valor: '1 - DISTRIBUCIÓN POR CUENTAS' }) }), /DISTRIBUCION POR CUENTAS/)
})

test('R2 · una sección esperada borrada (acciones) o una numeración salteada: tira', () => {
  const f = filaDe('3 · ALERTAS CRÍTICAS')
  assert.throws(() => leerCaja({ grid: con(f, 5, null) }), /ACCIONES/)
  assert.throws(() => leerCaja({ grid: con(f, 5, { valor: '5 · ACCIONES RECOMENDADAS' }) }), /1\.\.N seguidas/)
})

test('R3 · una tabla que pierde su fila de encabezados: tira', () => {
  const f = filaDe('Cuenta')
  const sinEncabezados = { filas: grid.filas.map((fl, i) => (i === f ? fl.map((c, j) => (j < 4 ? null : c)) : fl)) }
  assert.throws(() => leerCaja({ grid: sinEncabezados }), /DISTRIBUCIÓN POR CUENTAS.*encabezados/)
})

test('R4 · la fila de contexto de las tarjetas borrada: tira', () => {
  const f = filaDe('CAJA DISPONIBLE') + 2
  const sinContexto = { filas: grid.filas.map((fl, i) => (i === f ? fl.map(() => null) : fl)) }
  assert.throws(() => leerCaja({ grid: sinContexto }), /sin su renglón de contexto/)
  assert.throws(() => leerCaja({ grid: con(f, 6, null) }), /contexto \(CAJA INVERTIDA\)/)
})

test('R5 · un error de cálculo en cualquier celda publicada: tira, por errorValue y por texto', () => {
  const tarjeta = filaDe('CAJA DISPONIBLE') + 1
  assert.throws(() => leerCaja({ grid: con(tarjeta, 2, { error: 'REF', valor: '#REF!', numero: null }) }), /la portada.*REF/)
  const cuenta = filaDe('Santander · cta cte USD')
  assert.throws(() => leerCaja({ grid: con(cuenta, 2, { valor: '#VALUE!', numero: null }) }), /tabla «1 · DISTRIBUCIÓN.*#VALUE!/)
  const alerta = filaDe('▲ Falta cargar $763.365 · manda cheques sin marca $763.365')
  assert.throws(() => leerCaja({ grid: con(alerta, 0, { valor: '#N/A' }) }), /lista «3 · ALERTAS.*#N\/A/)
  assert.equal(esError({ valor: '#DIV/0!' }), true)
  assert.equal(esError({ valor: 'Efectivo en pesos' }), false)
  assert.equal(esError({ valor: '', error: 'NAME' }), true)
})

test('R6 · una lista cuya primera fila trae dos celdas sigue siendo lista', () => {
  const f = filaDe('▲ No cierra $123.198.145 · manda efectivo sin depositar $123.198.145')
  const dos = { filas: grid.filas.map((fl, i) => (i === f ? fl.map((c, j) => (j === 1 ? { valor: 'segunda celda' } : c)) : fl)) }
  const foto = leerCaja({ grid: dos })
  assert.equal(foto.secciones[2].forma, 'lista')
  assert.ok(foto.secciones[2].items.some((x) => x.texto === 'segunda celda'))
})

test('R7 · la huella es del contenido: una fila en blanco no la cambia; una celda de una sección o un valor de un gráfico, sí (M5)', () => {
  const g = { id: '1', titulo: 't', subtitulo: '', tipo: 'LINE', apilado: null, fila: 53, dominio: ['a', 'b'], series: [{ nombre: 's', tipo: 'LINE', eje: null, punteada: false, valores: [1, 2] }] }
  const base = leerCaja({ grid, graficos: [g], tipoCambioUsd: 1500 })
  // Una fila en blanco arriba y otra entre los encabezados y la primera cuenta (entre el título y sus encabezados NO: eso es otra forma).
  const conBlanco = { filas: [Array(10).fill(null), ...grid.filas.slice(0, 6), Array(10).fill(null), ...grid.filas.slice(6)] }
  assert.equal(leerCaja({ grid: conBlanco, graficos: [g], tipoCambioUsd: 1500 }).huella, base.huella)
  assert.equal(leerCaja({ grid, graficos: [{ ...g, fila: 99 }], tipoCambioUsd: 1500 }).huella, base.huella, 'la fila-ancla del gráfico no es contenido')
  const cuenta = filaDe('Santander · cta cte ARS')
  assert.notEqual(leerCaja({ grid: con(cuenta, 2, { valor: '44.278.170', numero: 44278170 }), graficos: [g], tipoCambioUsd: 1500 }).huella, base.huella)
  const venc = filaDe('Esta semana')
  assert.notEqual(leerCaja({ grid: con(venc, 7, { valor: '43.076.717', numero: 43076717 }), graficos: [g], tipoCambioUsd: 1500 }).huella, base.huella)
  assert.notEqual(leerCaja({ grid, graficos: [{ ...g, series: [{ ...g.series[0], valores: [1, 3] }] }], tipoCambioUsd: 1500 }).huella, base.huella)
  assert.notEqual(leerCaja({ grid, graficos: [g], tipoCambioUsd: 1501 }).huella, base.huella)
  const alerta = filaDe('▲ Falta cargar $763.365 · manda cheques sin marca $763.365')
  assert.notEqual(leerCaja({ grid: con(alerta, 0, { valor: '▲ Falta cargar $1' }), graficos: [g], tipoCambioUsd: 1500 }).huella, base.huella)
})

// LA BANDA DE "Tarjeta de Credito": lo que NO se puede ver mirando la pestaña.
//
// Los defectos que esta pestaña YA tuvo, medidos sobre el archivo real:
//   1. El bloque del OS vivía DEBAJO del registro, con su texto en la columna E — la misma columna
//      que CAJA suma como consumo de tarjeta. Bastaba un importe ahí para inflar la caja en silencio.
//   2. Seis bloques con dos numeraciones que se pisaban.
//   3. La columna del banco con formato de FECHA: "$965.863,53" se leía "9/6/4544".
//   4. Rangos del registro cerrados en una fila fija, con los datos llegando justo al tope.
// Y el que agregó este rediseño: el alto de la banda pasó de 31 a 52 filas, y de ese número cuelga
// `filaCab` del cash flow. Un rango corrido no da error: da cero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { bandaFilas, datosDeLaBanda, frescura, veredicto, COLS, TITULAR, TOPES } from './tarjeta-banda.mjs'
import { BANDA, FILA_HDR, FILA_DATO0 } from './tarjeta-geometria.mjs'
import { TOLERANCIA, BANDA_TC, VENTANA } from './tarjeta-estado.mjs'
import { auditarPatron, ES_TOTAL } from './patron-pestana.mjs'

const RESUMEN = {
  tarjeta: 'Visa 3319', titular: 'ECHEGARAY OVIEDO RO', numero: '202120',
  cierre: '2026-08-20', vencimiento: '2026-09-01',
  cierreAnterior: '2026-07-23', vencimientoAnterior: '2026-08-03',
  proximoCierre: '2026-09-24', proximoVencimiento: '2026-10-05',
  saldoAnteriorPesos: 1090924.47, saldoAnteriorDolares: 193.25, pagoAnteriorTc: 1520,
  consumosPesos: 1949747.67, consumosDolares: 544.99, cargosPesos: 259210.75,
  aDebitarPesos: 2208958.42, aDebitarDolares: 544.99, cuentaDebito: '00000000913836',
  pagoMinimo: 1138130, pagoMinimoVerificado: true, tcCierre: 1497,
  cargos: [
    { concepto: 'sellos', importe: 10533.61 },
    { concepto: 'sellos_provinciales', importe: 3922.14 },
    { concepto: 'rg5617', importe: 244755, base: 815850.03 },
  ],
  consumos: [{ comercio: 'ANTHROPIC', pesos: 0, dolares: 544.99 }],
  cuotasAVencer: [{ mes: '2026-09-01', importe: 1546611.33 }, { mes: '2026-10-01', importe: 1282797.42 }],
}
const MOVS = [{ fecha: '2026-08-03', concepto: 'Pago tarjeta de credito visa', importe: -1384664.47 }]

const datos = datosDeLaBanda([RESUMEN], MOVS, { hoy: '2026-08-28' })
const g = bandaFilas(FILA_HDR, datos)
const banda = g.filas
const colA = banda.map((f) => String(f[0] ?? ''))
const formulas = banda.flat().filter((c) => String(c).startsWith('='))

test('la banda tiene el alto declarado y un solo ancho de grilla', () => {
  assert.equal(banda.length, BANDA)
  assert.ok(banda.every((f) => f.length === COLS), 'alguna fila no tiene 12 columnas')
})

// ═══ EL ALTO ES FIJO AUNQUE LOS DATOS CREZCAN ═══
//
// De `BANDA` cuelga `filaCab` en cash-flow-lineas.mjs. Si la banda creciera con los datos, el rango
// que el cash flow suma como cuotas de tarjeta apuntaría a otra fila cada mes — sin dar error.

test('con las secciones variables LLENAS la banda sigue midiendo lo mismo', () => {
  const seis = Array.from({ length: 6 }, (_, i) => ({
    ...RESUMEN, numero: `2021${20 - i}`,
    cierre: `2026-0${8 - i}-20`, vencimiento: `2026-0${9 - i}-01`,
    consumos: [{ comercio: `COMERCIO ${i}`, pesos: 1000, dolares: 0 }, { comercio: 'ANTHROPIC', pesos: 0, dolares: 500 }],
  }))
  const lleno = bandaFilas(FILA_HDR, datosDeLaBanda(seis, MOVS, { hoy: '2026-08-28' }))
  assert.equal(lleno.filas.length, BANDA)
  assert.ok(lleno.filas.filter((f) => /^\d{2}\/\d{2}\/\d{4}/.test(String(f[0]))).length <= TOPES.historial)
})

// ═══ EL DEFECTO 1: LA COLUMNA QUE CAJA SUMA ═══
//
// CAJA calcula el consumo de tarjeta como
//    SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
// sobre el rango de columna ENTERO, y la banda cae adentro.

test('la banda NUNCA escribe fuera de A, B y C: E y J son el contrato con CAJA', () => {
  banda.forEach((f, i) => {
    assert.deepEqual(f.slice(3), Array(COLS - 3).fill(''), `la fila ${i + 1} de la banda escribe más allá de la columna C`)
  })
})

// ═══ EL DEFECTO 2: DOS NUMERACIONES QUE SE PISAN ═══

test('la gramática del archivo se cumple: cero defectos de patrón', () => {
  // auditarPatron mide VALORES, no fórmulas: se simula el resultado calculado.
  const valores = banda.map((f) => f.map((c) => (String(c).startsWith('=') ? 1 : c)))
  const registro = [
    ['Fecha de Compra', 'fecha gral', 'Proveedor', 'Cuota', 'Monto', 'Tipo comp', 'Nro comp', 'fecha de pago', 'fecha pago', 'DEBITADO', 'Unidad de Negocio', 'Estado en el OS'],
    ['16/1/2026', '16/1/2026', 'Modica SA', 6, 355413.39, 'FA', '00045-9', '2/7/2026', '2/7/2026', 'SI', 'Financiero', '✓'],
  ]
  assert.deepEqual(auditarPatron([...valores, ...registro]), [])
})

test('las secciones son 1..6 corridas y ninguna se repite', () => {
  const nums = colA.filter((a) => /^\d+ · /.test(a)).map((a) => Number(a.split(' ')[0]))
  assert.deepEqual(nums, [1, 2, 3, 4, 5, 6])
})

// ═══ LAS CINCO PREGUNTAS DEL DUEÑO, EN SU ORDEN ═══

test('el titular es LO QUE HAY QUE PAGAR, no el disponible', () => {
  assert.equal(g.fArs, TITULAR)
  assert.match(colA[TITULAR - 1], /^⇒ A pagar en pesos/)
  assert.equal(banda[TITULAR - 1][1], RESUMEN.aDebitarPesos)
})

test('los dólares se muestran aparte y NO se convierten a pesos', () => {
  // Un consumo en dólares se paga contra el mismo resumen pero es OTRA obligación: convertirla acá
  // al tipo de cambio de hoy sería fingir que ya se sabe a cuánto se va a debitar.
  const fUsd = colA.findIndex((a) => /^⇒ A pagar en dólares/.test(a)) + 1
  assert.ok(fUsd, 'falta la línea de dólares')
  assert.equal(banda[fUsd - 1][1], RESUMEN.aDebitarDolares)
  assert.ok(g.usd.includes(fUsd), 'el formateador tiene que saber cuáles filas son dólares, o se leen como pesos')
})

test('las cinco preguntas están, en el orden en que las hizo el dueño', () => {
  const titulos = colA.filter((a) => /^(\d+ · |CUÁNTO HAY QUE PAGAR)/.test(a)).map((a) => a.toUpperCase())
  assert.match(titulos[0], /CUÁNTO HAY QUE PAGAR/)
  assert.match(titulos[1], /¿YA SE PAGÓ\?/)
  assert.match(titulos[2], /QUÉ ME ESTÁN COBRANDO/)
  assert.match(titulos[3], /CUÁNTO PUEDE VENIR LA PRÓXIMA/)
  assert.match(titulos[5], /HISTORIAL/)
})

// ═══ "¿YA SE PAGÓ?" SALE DEL BANCO, NO DEL RESUMEN ═══

test('el débito se busca en _BANCO_RAW por naturaleza y por ventana, no se pega', () => {
  const f = String(banda[g.fDeb - 1][1])
  assert.match(f, /_BANCO_RAW/)
  assert.match(f, /"Pago de la tarjeta"/)
  // La ventana es la de `estadoDePago`, no una escrita a mano: 2 días antes y 10 después.
  assert.match(f, /DATE\(2026;8;30\)/)
  assert.match(f, /DATE\(2026;9;11\)/)
})

test('el veredicto vive en el Sheet: si se pegara, diría "A VENCER" para siempre', () => {
  const v = String(banda[g.fDif - 1][2])
  assert.ok(v.startsWith('='), 'el veredicto tiene que recalcularse solo cuando entre el extracto')
  assert.match(v, /IMPAGO/)
  assert.match(v, /A VENCER/)
  assert.match(v, /PAGADO/)
  assert.match(v, /TODAY\(\)/)
})

test('la fórmula del veredicto usa LAS MISMAS constantes que la función que decide', () => {
  // Es la costura de este diseño: el criterio se escribe dos veces —una en JS y otra como fórmula—
  // y lo único que las mantiene juntas son estas constantes. Si alguien cambia la tolerancia o la
  // banda de tipo de cambio en un lado y no en el otro, este test se cae.
  const v = veredicto({ r: RESUMEN, fDeb: 12, hasta: '2026-09-11' })
  assert.match(v, new RegExp(`ABS\\(dif_\\)<=${TOLERANCIA}`))
  assert.ok(v.includes(`>=${(RESUMEN.tcCierre * BANDA_TC.piso).toFixed(2)}`), v)
  assert.ok(v.includes(`<=${(RESUMEN.tcCierre * BANDA_TC.techo).toFixed(2)}`), v)
  assert.equal(VENTANA.antes, 2)
})

test('sin dólares, el veredicto no ofrece la explicación del tipo de cambio', () => {
  // Con `aDebitarDolares` en cero, cualquier diferencia es un hallazgo y punto: dejar la rama del TC
  // permitiría "explicar" una diferencia que no tiene con qué explicarse.
  const v = veredicto({ r: { ...RESUMEN, aDebitarDolares: 0 }, fDeb: 12, hasta: '2026-09-11' })
  assert.doesNotMatch(v, /por dólar/)
  assert.match(v, /PAGADO POR OTRO IMPORTE/)
})

// ═══ "QUÉ ME ESTÁN COBRANDO" ═══

test('los cargos se abren uno por uno y cada uno dice cuánto pesa sobre el consumo', () => {
  const iSellos = colA.findIndex((a) => a === 'Impuesto de sellos')
  assert.ok(iSellos > 0)
  assert.equal(banda[iSellos][1], 10533.61)
  assert.match(String(banda[iSellos][2]), /^=IF\(\$B\$\d+=0;"—";TEXT\(B\d+\/\$B\$\d+;"0\.0%"\)/)
})

test('la percepción RG 5617 se rotula como PAGO A CUENTA y no como gasto', () => {
  // Tratarla como costo pierde el crédito fiscal: es recuperable en la DDJJ de Ganancias.
  const fila = banda.find((f) => /RG 5617/.test(String(f[0])))
  assert.ok(fila, 'falta la línea de la percepción')
  assert.match(String(fila[2]), /PAGO A CUENTA de Ganancias/)
})

test('el patrón de formato va en US aunque la fórmula vaya en es-AR', () => {
  // "0.0%" con punto y "$#,##0" con coma: es lo que espera el motor de formato de Sheets, y es
  // independiente del locale del archivo. Con "0,0%" la celda muestra un error.
  for (const f of formulas.filter((x) => /TEXT\(/.test(x))) {
    assert.doesNotMatch(f, /TEXT\([^;]+;"[^"]*\d,\d/, `patrón de formato en es-AR: ${f.slice(0, 60)}`)
  }
})

// ═══ EL HALLAZGO QUE LA PESTAÑA TIENE QUE DEJAR VISIBLE ═══

test('la brecha compara el débito del resumen contra lo cargado en el registro, y es fórmula', () => {
  // Fórmula y no número pegado: el control se pone en verde SOLO a medida que el dueño carga las
  // cuotas que faltan. Pegado, seguiría en rojo hasta que alguien vuelva a correr el generador.
  assert.match(String(banda[g.fCargado - 1][1]), /SUMIFS/)
  assert.match(String(banda[g.fCargado - 1][1]), /DATE\(2026;9;1\)/)
  assert.match(String(banda[g.fCargado - 1][1]), /DATE\(2026;10;1\)/)
  assert.equal(String(banda[g.fBrecha - 1][1]), `=B${g.fSale}-B${g.fCargado}`)
  assert.ok(ES_TOTAL.test(colA[g.fBrecha - 1]))
})

test('los dólares que ninguna línea del Cash Flow proyecta también se declaran', () => {
  const f = banda.find((x) => /ninguna línea del Cash Flow/.test(String(x[0])))
  assert.ok(f, 'el hallazgo de los dólares sin proyectar no puede quedar sólo en el informe')
  assert.equal(f[1], RESUMEN.aDebitarDolares)
})

// ═══ LA PROYECCIÓN ═══

test('la próxima se rotula PROYECCIÓN y cada componente lleva su procedencia', () => {
  const iSec = colA.findIndex((a) => /^3 · /.test(a))
  assert.match(colA[iSec], /PROYECCIÓN, NO UN DATO/)
  const comp = banda[iSec + 2]
  assert.match(String(comp[2]), /^HECHO — tabla "Cuotas a vencer"/)
  assert.match(colA[g.fPiso - 1], /^⇒ Piso de la próxima/)
})

test('lo que no se sabe se escribe: los huecos van en la pestaña, no en el informe', () => {
  const huecos = colA.filter((a) => /^\s+· /.test(a) && /observación aislada|período en curso|se consuma/.test(a))
  assert.ok(huecos.length >= 3, 'el piso sin sus huecos se lee como un pronóstico')
})

// ═══ LOS RANGOS Y EL LOCALE ═══

test('los rangos del registro son ABIERTOS y arrancan donde arranca el registro', () => {
  const f = String(banda[g.fCargado - 1][1])
  assert.match(f, new RegExp(`\\$E\\$${FILA_DATO0}:\\$E`))
  assert.match(f, new RegExp(`\\$H\\$${FILA_DATO0}:\\$H`))
  assert.doesNotMatch(f, /\$E\$\d+:\$E\$\d+/, 'un rango cerrado deja afuera la cuota que se carga mañana')
})

test('separador es-AR: ni una coma separando argumentos', () => {
  // El archivo está en es-AR: una fórmula con comas entra como texto y la celda queda muda.
  for (const f of formulas) {
    const sinTextos = String(f).replace(/"[^"]*"/g, '""')
    assert.doesNotMatch(sinTextos, /,/, `fórmula con coma: ${String(f).slice(0, 70)}`)
  }
})

test('los nombres de LET no pueden parecer una referencia A1', () => {
  for (const f of formulas.filter((x) => /LET\(/.test(x))) {
    const nombres = [...String(f).matchAll(/LET\(([^;]+);/g)].map((m) => m[1].trim())
    for (const n of nombres) assert.match(n, /_$/, `el nombre "${n}" tiene que terminar en _`)
  }
})

test('la banda es determinística: no estampa la fecha de la corrida', () => {
  const otra = bandaFilas(FILA_HDR, datosDeLaBanda([RESUMEN], MOVS, { hoy: '2026-08-28' }))
  assert.deepEqual(otra.filas, banda)
  const hoy = new Date().toISOString().slice(0, 10)
  assert.ok(!JSON.stringify(banda).includes(hoy.split('-').reverse().join('/')), 'hay una fecha de corrida pegada')
})

test('la antigüedad del resumen no puede envejecer en silencio', () => {
  const f = frescura('2026-08-20', 40)
  assert.match(f, /TODAY\(\)/)
  assert.match(f, /dd_>40/)
  assert.match(f, /el último resumen es de hace/)
})

test('sin resumen no se dibuja una pestaña de ceros: se rompe y se dice por qué', () => {
  // Un cero en "a pagar" se lee como "no hay que pagar nada". Antes esto no podía pasar porque los
  // números vivían en una constante del código; ahora vienen de la base y puede no haber ninguno.
  assert.throws(() => bandaFilas(FILA_HDR, { resumen: null }), /importar-tarjeta/)
})

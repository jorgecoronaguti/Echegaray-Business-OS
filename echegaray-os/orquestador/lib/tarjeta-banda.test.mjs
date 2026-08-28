// LA BANDA DE "Tarjeta de Credito": lo que NO se puede ver mirando la pestaña.
//
// El 28/08 la FORMA se rehizo entera. El dueño, sobre la primera versión: «inentendible el diseño…
// less is more; como se vería en JP Morgan». Eran seis secciones numeradas apiladas, con el mismo
// encabezado repetido cinco veces y 52 filas de alto. Ahora son tres tarjetas arriba y cuatro
// bloques en dos pistas, en 31 filas. Los tests de forma de abajo son los que impiden que vuelva.
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
import { bandaFilas, datosDeLaBanda, frescura, veredicto, apilar, num, COLS, TITULAR, TOPES, PISTA } from './tarjeta-banda.mjs'
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

test('las canaletas E y J quedan SIEMPRE vacías: son el contrato con CAJA', () => {
  // El contrato no es "no escribir más allá de la C" —eso era antes, con una sola pista— sino que la
  // columna E no lleve NÚMEROS y la J no lleve "SI". Con dos pistas, E y J son justamente las
  // canaletas que las separan, así que la regla se cumple por construcción y se mide igual.
  banda.forEach((f, i) => {
    assert.equal(f[4], '', `la fila ${i + 1} escribe en la columna E, que CAJA suma como consumo`)
    assert.equal(f[9], '', `la fila ${i + 1} escribe en la columna J, que CAJA lee como DEBITADO`)
  })
})

test('la banda escribe en dos pistas y en ninguna otra columna: A-B-C y F-G-H', () => {
  banda.forEach((f, i) => {
    for (const j of [3, 4, 8, 9, 10, 11]) {
      assert.equal(f[j], '', `la fila ${i + 1} escribe en la columna ${String.fromCharCode(65 + j)}, que no es de ninguna pista`)
    }
  })
  assert.equal(PISTA.izq, 0)
  assert.equal(PISTA.der, 5)
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

test('las secciones son 1..3 corridas, y sólo numera la pista izquierda', () => {
  // Seis bloques numerados con el mismo peso no dicen qué mirar primero. Numerar además los de la
  // derecha obligaría a leer en zigzag: la numeración baja por la columna A, que es como se lee.
  const nums = colA.filter((a) => /^\d+ · /.test(a)).map((a) => Number(a.split(' ')[0]))
  assert.deepEqual(nums, [1, 2, 3])
  const enF = banda.map((f) => String(f[5] ?? '')).filter((a) => /^\d+ · /.test(a))
  assert.deepEqual(enF, [], 'la pista derecha no lleva número')
})

// ═══ LAS CINCO PREGUNTAS DEL DUEÑO, EN SU ORDEN ═══

test('UNA SOLA cifra manda, y es lo que hay que pagar', () => {
  // `dataviz/references/marks-and-anatomy.md`: «Hero figure… EXACTLY ONE per view». La cifra vive en
  // la columna A de la fila del titular, con su rótulo arriba y su contexto abajo — no es una fila
  // de tabla, y por eso no tiene encabezado.
  assert.equal(g.fCif, TITULAR)
  assert.equal(banda[TITULAR - 1][0], RESUMEN.aDebitarPesos)
  assert.equal(String(banda[TITULAR - 2][0]), 'A PAGAR — PESOS')
  assert.match(String(banda[TITULAR][0]), /^=LET\(dd_;TODAY\(\)/, 'debajo va el contexto, con su semáforo')
})

test('las tres tarjetas contestan las dos preguntas con las que se decide: cuánto y si ya se pagó', () => {
  const rot = banda[g.fRot - 1]
  assert.deepEqual([rot[0], rot[2], rot[5]], ['A PAGAR — PESOS', 'A PAGAR — DÓLARES', '¿YA SE PAGÓ?'])
  assert.equal(banda[g.fCif - 1][2], RESUMEN.aDebitarDolares)
  assert.ok(String(banda[g.fCif - 1][5]).startsWith('='), 'el estado se recalcula solo')
})

test('arriba no hay encabezado de tabla: tres cifras sueltas no son una tabla', () => {
  // NN/g "Data Tables": una tabla existe para encontrar registros, compararlos y editarlos. Ninguna
  // de esas cosas pasa con tres números, y el encabezado repetido era la mitad del ruido anterior.
  for (const f of [g.fRot, g.fCif, g.fCif + 1]) {
    assert.ok(!/^(concepto|monto|cuándo)$/i.test(String(banda[f - 1][1] ?? '')), `la fila ${f} tiene encabezado de tabla`)
  }
  const encabezados = colA.filter((a) => a === 'Concepto').length
  assert.equal(encabezados, 2, 'un encabezado por bloque de la pista izquierda, y nada más')
})

test('los dólares se muestran aparte y NO se convierten a pesos', () => {
  // Un consumo en dólares se paga contra el mismo resumen pero es OTRA obligación: convertirla acá
  // al tipo de cambio de hoy sería fingir que ya se sabe a cuánto se va a debitar.
  assert.equal(banda[g.fCif - 1][2], RESUMEN.aDebitarDolares)
  const enDolares = [...g.usd, ...g.usdDer]
  assert.ok(enDolares.length >= 2, 'el formateador tiene que saber cuáles filas son dólares, o se leen como pesos')
  for (const f of g.usd) assert.equal(typeof banda[f - 1][1], 'number')
})

test('las cinco preguntas siguen estando: menos no es sacar información, es jerarquía', () => {
  const texto = banda.flat().map((c) => String(c ?? '')).join(' | ').toUpperCase()
  assert.match(texto, /A PAGAR — PESOS/)          // cuánto hay que pagar
  assert.match(texto, /A PAGAR — DÓLARES/)        // en las dos monedas
  assert.match(texto, /¿YA SE PAGÓ\?/)            // si ya se pagó
  assert.match(texto, /QUÉ ME ESTÁN COBRANDO/)    // qué me están cobrando
  assert.match(texto, /CUÁNTO PUEDE VENIR LA PRÓXIMA/)
  assert.match(texto, /HISTORIAL/)
  assert.match(texto, /CASH FLOW NO ESPERA/)      // el hallazgo, que es lo que más plata mueve
})

// ═══ "¿YA SE PAGÓ?" SALE DEL BANCO, NO DEL RESUMEN ═══

test('el débito se busca en _BANCO_RAW por naturaleza y por ventana, no se pega', () => {
  const f = String(banda[g.fCif][5])
  assert.match(f, /_BANCO_RAW/)
  assert.match(f, /"Pago de la tarjeta"/)
  // La ventana es la de `estadoDePago`, no una escrita a mano: 2 días antes y 10 después.
  assert.match(f, /DATE\(2026;8;30\)/)
  assert.match(f, /DATE\(2026;9;11\)/)
})

test('el veredicto vive en el Sheet: si se pegara, diría "A VENCER" para siempre', () => {
  const v = String(banda[g.fCif - 1][5])
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
  const v = veredicto({ r: RESUMEN, debito: '-SUMIFS(x)', hasta: '2026-09-11' })
  assert.match(v, new RegExp(`ABS\\(dif_\\)<=${TOLERANCIA}`))
  // Y el número embebido va EN LOCALE, como el separador: Sheets guarda 2208958.42 como
  // 2208958,42 en un archivo es-AR, y la fórmula sellada nunca coincidía con la releída.
  assert.match(v, /pag_-2208958,42/)
  assert.equal(num(1497.9), '1497,9')
  assert.ok(v.includes(`>=${num((RESUMEN.tcCierre * BANDA_TC.piso).toFixed(2))}`), v)
  assert.ok(v.includes(`<=${num((RESUMEN.tcCierre * BANDA_TC.techo).toFixed(2))}`), v)
  assert.equal(VENTANA.antes, 2)
})

test('sin dólares, el veredicto no ofrece la explicación del tipo de cambio', () => {
  // Con `aDebitarDolares` en cero, cualquier diferencia es un hallazgo y punto: dejar la rama del TC
  // permitiría "explicar" una diferencia que no tiene con qué explicarse.
  const v = veredicto({ r: { ...RESUMEN, aDebitarDolares: 0 }, debito: '-SUMIFS(x)', hasta: '2026-09-11' })
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
  assert.match(String(fila[2]), /pago a cuenta, no gasto/)
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
  const f = banda.find((x) => /ninguna línea proyecta/.test(String(x[0])))
  assert.ok(f, 'el hallazgo de los dólares sin proyectar no puede quedar sólo en el informe')
  assert.equal(f[1], RESUMEN.aDebitarDolares)
})

// ═══ LA PROYECCIÓN ═══

test('la próxima se rotula PROYECCIÓN y cada componente lleva su procedencia', () => {
  const iSec = banda.findIndex((f) => /CUÁNTO PUEDE VENIR LA PRÓXIMA/.test(String(f[5])))
  assert.match(String(banda[iSec][5]), /PROYECCIÓN/, 'una estimación presentada como hecho es la regla que más caro sale romper')
  assert.match(String(banda[iSec + 2][7]), /^HECHO/)
  assert.match(String(banda[g.fPiso - 1][5]), /^⇒ Piso de la próxima/)
})

test('lo que no se sabe se escribe: los huecos van en la pestaña, no en el informe', () => {
  const huecos = banda.map((f) => String(f[5] ?? '')).filter((a) => /^\s+· /.test(a))
  assert.ok(huecos.length >= 2, 'el piso sin sus huecos se lee como un pronóstico')
  assert.ok(huecos.some((h) => /recurrencia/.test(h)))
  assert.ok(huecos.some((h) => /período en curso/.test(h)))
  // Y CORTOS: un texto largo en una columna del medio desparrama la fila, que es media mitad de lo
  // que hacía inentendible la versión anterior. `auditarPatron` lo mide en el test de la gramática.
  for (const h of huecos) assert.ok(h.length <= 60, `hueco de ${h.length} caracteres: "${h}"`)
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
    // Una coma ENTRE DÍGITOS es el separador decimal en es-AR y tiene que estar (ver `num`). La que
    // no puede aparecer es la que separa argumentos: cualquier otra.
    assert.doesNotMatch(sinTextos, /(?<!\d),|,(?!\d)/, `fórmula con coma de argumentos: ${String(f).slice(0, 70)}`)
  }
})

test('los nombres de LET no pueden parecer una referencia A1', () => {
  for (const f of formulas.filter((x) => /LET\(/.test(x))) {
    const nombres = [...String(f).matchAll(/LET\(([^;]+);/g)].map((m) => m[1].trim())
    for (const n of nombres) assert.match(n, /_$/, `el nombre "${n}" tiene que terminar en _`)
  }
})

test('las dos pistas van en paralelo: el bloque más corto no corre al otro', () => {
  // Es lo que hace que se lean como dos columnas y no como una lista larga. Si el bloque corto se
  // completara con menos filas, el de al lado arrancaría más arriba y los encabezados no alinearían.
  const { filas, alto } = apilar([['a1', 1, 'c1'], ['a2', 2, 'c2'], ['a3', 3, 'c3']], [['d1', 4, 'f1']], 0)
  assert.equal(alto, 3)
  assert.equal(filas.length, 3)
  assert.deepEqual(filas[0].slice(0, 8), ['a1', 1, 'c1', '', '', 'd1', 4, 'f1'])
  assert.deepEqual(filas[2].slice(0, 8), ['a3', 3, 'c3', '', '', '', '', ''])
  // La canaleta E (índice 4) queda vacía SIEMPRE: es el contrato con CAJA.
  for (const f of filas) assert.equal(f[4], '')
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

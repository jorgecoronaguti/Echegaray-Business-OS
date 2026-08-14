// La banda de "Tarjeta de Credito" se construye sola: acá se prueba lo que NO se puede ver mirando.
//
// Los defectos que esta pestaña YA tenía el 04/08, medidos sobre el archivo real:
//   1. El bloque del OS vivía DEBAJO del registro, con su texto en la columna E — la misma columna
//      que CAJA suma como consumo de tarjeta. Bastaba un importe ahí para inflar la caja en silencio.
//   2. Seis bloques con dos numeraciones que se pisaban (1, 2, 5, 6 arriba; otro 1 y otro 2 abajo).
//   3. La columna del banco con formato de FECHA: "$965.863,53" se leía "9/6/4544".
//   4. Rangos del registro cerrados en una fila fija ($E$3:$E$60) con los datos llegando justo a 60:
//      la cuota siguiente quedaba afuera del control sin que nada avisara.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bandaFilas, ubicarRegistro, ubicarBloqueViejo, frescura, BANDA, TITULAR } from './tarjeta-pestana.mjs'
import { auditarPatron, ES_TOTAL } from '../lib/patron-pestana.mjs'
import { TARJETA, CORTE } from '../lib/banco-santander.mjs'

const HDR = BANDA + 1
const { filas: banda, fComp, fRatio, fDif } = bandaFilas(HDR)
const colA = banda.map((f) => String(f[0] ?? ''))
const filaDe = (re) => colA.findIndex((a) => re.test(a)) + 1
const formulas = banda.flat().filter((c) => String(c).startsWith('='))

test('la banda tiene el alto declarado y un solo ancho de grilla', () => {
  assert.equal(banda.length, BANDA)
  assert.ok(banda.every((f) => f.length === 12), 'alguna fila no tiene 12 columnas')
})

// ═══ EL DEFECTO 1: LA COLUMNA QUE CAJA SUMA ═══
//
// CAJA calcula el consumo de tarjeta como
//    SUMPRODUCT((UPPER('Tarjeta de Credito'!$J$3:$J$400)<>"SI")*IF(ISNUMBER($E$3:$E$400);…))
// sobre el rango de columna ENTERO. El generador anterior escribía su bloque en las filas 63–86 con
// texto en la columna E: zafaba sólo porque ISNUMBER lo descartaba. El día que alguien pusiera un
// importe ahí —o moviera una columna— CAJA sumaba una compra que no existe.

test('la banda NUNCA escribe fuera de A, B y C: E y J son el contrato con CAJA', () => {
  banda.forEach((f, i) => {
    assert.deepEqual(f.slice(3), Array(9).fill(''), `la fila ${i + 1} de la banda escribe más allá de la columna C`)
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

test('las secciones son 1..4 corridas y ninguna se repite', () => {
  const nums = colA.filter((a) => /^\d+ · /.test(a)).map((a) => Number(a.split(' ')[0]))
  assert.deepEqual(nums, [1, 2, 3, 4])
})

test('el titular es el DISPONIBLE, que es la única cifra con la que se decide una compra', () => {
  assert.match(colA[TITULAR - 1], /^⇒ Disponible para comprar/)
  // Y el cupo de cuotas —que es otro y es menor— va pegado abajo, no en un bloque aparte.
  assert.match(colA[TITULAR], /en cuotas el cupo es otro/)
  assert.ok(banda[TITULAR][1] < banda[TITULAR - 1][1], 'el cupo de cuotas tiene que ser el menor de los dos')
})

// ═══ EL DEFECTO 4: EL RANGO QUE SE QUEDA CORTO ═══

test('los rangos del registro son ABIERTOS y siguen al encabezado real, no a una fila fija', () => {
  for (const col of ['E', 'I', 'J']) {
    // El `\$?` del cierre es el que importa: sin él, `$E$32:$E$400` pasaba por abierto y la mutación
    // que vuelve a fosilizar el rango no se detectaba.
    const abierto = new RegExp(`\\$${col}\\$${HDR + 1}:\\$${col}(?![$0-9])`)
    assert.ok(formulas.some((f) => abierto.test(f)), `ninguna fórmula usa el rango abierto de la columna ${col}`)
    assert.ok(!formulas.some((f) => new RegExp(`\\$${col}\\$\\d+:\\$?${col}\\$?\\d`).test(f)),
      `hay un rango CERRADO en la columna ${col}: la cuota que se cargue debajo queda afuera del control`)
  }
  // Y si la banda cambia de alto, los rangos se mueven con ella.
  assert.ok(bandaFilas(99).filas.flat().some((c) => String(c).includes('$E$100:$E')))
})

test('el mes de pago se compara contra la FECHA, nunca contra el rótulo del mes', () => {
  // La columna I se LEE "agosto 26" pero adentro es una fecha con formato "mmmm aa":
  // SUMIFS(...;"agosto 26";...) devuelve CERO, sin error y sin aviso. Ya se cayó en esta trampa.
  const conMes = formulas.filter((f) => f.includes('$I$'))
  assert.ok(conMes.length >= 3)
  for (const f of conMes) {
    assert.ok(/EOMONTH|TODAY|MAXIFS|MINIFS/.test(f), `una ventana de mes sin función de fecha: ${f.slice(0, 60)}`)
    assert.doesNotMatch(f, /"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i)
  }
})

test('los tres tramos del calendario suman EXACTAMENTE el comprometido', () => {
  const fProx = filaDe(/^Próximo débito/)
  const fTres = filaDe(/^Los tres meses siguientes/)
  const fResto = filaDe(/^Más adelante/)
  // El último tramo se calcula por diferencia contra el total: así no puede quedar hueco entre las
  // ventanas de fechas ni superposición, que es como se pierde o se cuenta dos veces una cuota.
  assert.equal(banda[fResto - 1][1], `=B${fComp}-B${fProx}-B${fTres}`)
  assert.equal(fResto - fProx, 2, 'los tres tramos tienen que ir pegados')
})

test('el pago real sale del extracto del banco, no de un número escrito a mano', () => {
  const pago = banda[filaDe(/^Pagado al banco/) - 1][1]
  assert.match(pago, /'_BANCO_RAW'!\$C\$4:\$C\$1000/)
  assert.match(pago, /"Pago de la tarjeta"/, 'la naturaleza tiene que ser la que escribe el importador')
  assert.match(pago, /^=-SUMIFS/, 'los importes del extracto son negativos: sin el signo el pagado da negativo')
  assert.match(pago, /DATE\(YEAR\(TODAY\(\)\);1;1\)/, 'el año arranca solo, no con un 2026 estampado')
})

test('el ratio de financiamiento es un cociente, no una plata: sale de las dos filas de arriba', () => {
  // Es la fila que contesta "¿medio de pago o financiamiento?". Si dejara de ser un cociente, el
  // formateo la mostraría como "$1" y nadie lo notaría: el número seguiría siendo plausible.
  const f = String(banda[fRatio - 1][1])
  assert.match(f, new RegExp(`B${fRatio - 2}/\\(B${fRatio - 2}\\+B${fRatio - 1}\\)`))
  assert.match(f, /^=IF\(B\d+\+B\d+<=0;""/, 'sin denominador tiene que quedar vacía, no dar #DIV/0')
})

test('lo que se pagó y lo que se cargó salen de DOS fuentes distintas: por eso es un control', () => {
  // Si las cuotas del último pago se leyeran del mismo extracto que el pago, la comparación sería una
  // tautología. Un control nunca se valida contra la información que él mismo produce.
  const cuotas = banda[filaDe(/cuotas ya cargadas acá/) - 1][1]
  assert.ok(!cuotas.includes('_BANCO_RAW!$C'), 'las cuotas tienen que salir del registro, no del extracto')
  assert.match(cuotas, /SUMIFS\(\$E\$/, 'las cuotas salen de la columna de importes del registro')
})

test('los únicos números pegados son los tres del resumen del banco, y llevan su corte al lado', () => {
  const pegados = []
  banda.forEach((f, i) => { if (typeof f[1] === 'number') pegados.push([i + 1, f[1]]) })
  assert.deepEqual(pegados.map(([, v]) => v), [
    TARJETA.limite,
    TARJETA.disponible,
    TARJETA.cuotas.disponible,
    TARJETA.cuotasPendientes.proximoPeriodo + TARJETA.cuotasPendientes.restante,
  ], 'apareció un número pegado que no viene del resumen del banco')
  // Y ninguno queda mudo: el disponible y el pendiente declaran de qué foto salen.
  for (const re of [/^⇒ Disponible para comprar/, /^Pendiente según el resumen/]) {
    assert.match(String(banda[filaDe(re) - 1][2]), /resumen al/)
  }
})

test('la foto del banco no puede envejecer en silencio', () => {
  const f = frescura({ a: 2026, m: 7, d: 22 }, '22/07/2026', 21)
  assert.match(f, /TODAY\(\)-DATE\(2026;7;22\)/)
  assert.match(f, /IF\(dd_>21;"▲ foto de hace "/)
  // La fecha que se muestra es la declarada en el núcleo, no una tipeada en el script — y es la de
  // la FOTO DE LA TARJETA (`TARJETA.al`), no la del corte del extracto de la cuenta: son dos
  // documentos distintos que cierran días distintos.
  const suFecha = (TARJETA.al || CORTE).split('-').reverse().join('/')
  assert.ok(String(banda[1][0]).includes(suFecha), `el subtítulo tiene que declarar ${suFecha}`)
})

test('el control cierra contra el banco y dice su veredicto, sin una línea de prosa', () => {
  assert.match(String(banda[fDif - 1][2]), /✓ concilia/)
  assert.match(String(banda[fDif - 1][2]), /▲ revisar la carga/)
  assert.ok(ES_TOTAL.test(colA[fDif - 1]))
})

// ═══ CERO PROSA EN EL CUERPO ═══
// El dueño borra siempre las columnas de aclaraciones. La trazabilidad va una sola vez, en el
// subtítulo; la columna C lleva contexto corto (una fecha, una fuente, un veredicto), nunca una frase.

test('ninguna celda del cuerpo es una explicación: la trazabilidad vive en el subtítulo', () => {
  banda.forEach((f, i) => {
    if (i === 1) return // el subtítulo es el único lugar donde vive el texto largo
    const c = String(f[2] ?? '')
    if (c.startsWith('=')) return // las de fórmula se miden por sus literales, abajo
    assert.ok(c.length <= 34, `la fila ${i + 1} tiene una explicación en la columna C: "${c}"`)
  })
  assert.ok(String(banda[1][0]).length > 80, 'el subtítulo tiene que traer la trazabilidad completa')
})

test('la banda es determinística: no estampa la fecha de la corrida', () => {
  // Dos corridas tienen que producir exactamente lo mismo. Un rótulo con la fecha del día en que
  // corrió el generador se queda clavado en cuanto el dueño carga una cuota y no corre nadie.
  assert.deepEqual(bandaFilas(HDR).filas, banda)
  const hoy = new Date()
  const estampada = `${hoy.getDate()}/${hoy.getMonth() + 1}/${hoy.getFullYear()}`
  assert.ok(!banda.flat().some((c) => String(c).includes(estampada)))
})

test('separador es-AR: ni una coma separando argumentos', () => {
  // La coma es el separador DECIMAL en es-AR: una coma entre argumentos parte la fórmula. Se miran
  // sólo los operadores; adentro de un literal la coma es puntuación o un patrón de formato.
  for (const f of formulas) {
    const soloCalculo = f.replace(/"(?:[^"]|"")*"/g, '')
    assert.doesNotMatch(soloCalculo, /,/, `hay una coma separando argumentos: ${soloCalculo}`)
  }
})

test('los nombres de LET no pueden parecer una referencia A1', () => {
  // Un nombre como `nPa1` es una celda válida y Sheets devuelve #¿NOMBRE?. Ya pasó en este repo.
  for (const f of formulas) {
    for (const [, nombre] of f.matchAll(/LET\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) {
      assert.doesNotMatch(nombre, /^[A-Za-z]{1,3}\d+$/, `el nombre de LET "${nombre}" parece una celda`)
    }
  }
})

// ═══ LAS ANCLAS ═══

test('el registro se ubica por el DATO, no por un rótulo que alguien puede borrar', () => {
  const grid = [
    ['Tarjeta de crédito'], [''], [''], ['Fecha de Compra', 'x', 'y', 'z', 'Monto'],
    ['16/1/2026', '', 'Modica SA', 6, '$355.413,39'],
  ]
  assert.deepEqual(ubicarRegistro(grid), { primera: 5, hdr: 4 })
  // Sin el rótulo —el dueño lo borró— igual encuentra el registro.
  grid[3] = ['']
  assert.deepEqual(ubicarRegistro(grid), { primera: 5, hdr: 4 })
  // Y si no hay registro, no adivina: el script aborta en vez de escribir dos bandas superpuestas.
  assert.equal(ubicarRegistro([['Tarjeta de crédito'], ['Límite de compra', '$10.000.000']]), null)
})

test('el bloque viejo se reconoce por lo que dice, con o sin su número', () => {
  const grid = [
    ['16/1/2026', '', '', '', 355413.39], [''],
    ['1 · CONTROL — LA TARJETA CONTRA EL BANCO Y CONTRA LA CAJA'], ['Concepto'],
  ]
  assert.equal(ubicarBloqueViejo(grid, 1), 3)
  grid[2] = ['CONTROL — la tarjeta contra el banco y contra la caja']
  assert.equal(ubicarBloqueViejo(grid, 1), 3)
  grid[2] = ['2 · LA TARJETA COMO DISPONIBILIDAD — LO QUE VE CAJA']
  assert.equal(ubicarBloqueViejo(grid, 1), 3)
  // Y si no hay residuo, no borra nada: rehacer "de la fila X para abajo" ya destruyó trabajo real.
  assert.equal(ubicarBloqueViejo([['16/1/2026'], ['']], 1), null)
})

test('la banda nueva no se confunde con el bloque viejo que tiene que borrar', () => {
  assert.equal(ubicarBloqueViejo(banda, 0), null, 'el generador se tomaría a sí mismo por residuo')
})

// ═══ LA FOTO DE LA TARJETA TIENE SU PROPIA FECHA (04/08) ═══
//
// La banda usaba `CORTE` —el corte del EXTRACTO DE LA CUENTA— para fechar la foto de la TARJETA.
// Son dos documentos distintos que cierran días distintos: el de la cuenta era del 22/07 y el de la
// tarjeta del 29/07. Con la fecha ajena, el semáforo envejecía la foto una semana de más y el
// subtítulo declaraba un origen que no era el suyo.

test('la banda fecha la foto con TARJETA.al, no con el corte del extracto', () => {
  const banco = {
    TARJETA: { ...TARJETA, al: '2026-07-29' },
    CORTE: '2026-07-22',
  }
  const r = bandaFilas(31, banco)
  const filas = Array.isArray(r) ? r : r.filas
  const texto = JSON.stringify(filas)
  assert.match(texto, /29\/07\/2026/, 'tiene que fechar con la foto de la tarjeta')
  // La línea de dólares lleva SU propia fecha (el resumen del 29/07 no reportó dólares), así que
  // 22/07 puede aparecer — pero sólo ahí. El subtítulo y el disponible se fechan con la foto.
  const subtitulo = (filas || []).map((f) => String(f?.[0] ?? '')).find((x) => x.includes('Santander')) ?? ''
  assert.ok(subtitulo, 'tiene que existir el subtítulo')
  assert.ok(!subtitulo.includes('22/07/2026'), 'el subtítulo se fecha con la foto de la tarjeta')
  assert.match(texto, /DATE\(2026;7;29\)/, 'el semáforo de antigüedad cuenta desde la foto de la tarjeta')
})

// ═══ LA CELDA DE DÓLARES SE MUESTRA EN DÓLARES (04/08, traído de fix/tarjeta-dolares el 13/08) ═══
//
// La columna B entera se pinta como pesos, así que U$S 193,25 se leía "$193". El mismo símbolo para
// dos monedas es peor que no mostrar el dato: invita a sumar esa celda con el resto de la columna,
// que está en pesos, y la única línea con riesgo de tipo de cambio queda disfrazada de pesos.
//
// El formateador necesita saber CUÁL fila es. Si `bandaFilas` deja de devolverla, el formato de
// dólares desaparece sin que se rompa una sola fórmula — por eso el contrato se fija acá.

test('la banda declara la fila de dólares para que el formateador no la pinte como pesos', () => {
  const r = bandaFilas(31, { TARJETA, CORTE: '2026-07-22' })
  assert.ok(r.fUsd > 0, 'sin fUsd el formato de dólares no se puede aplicar: la celda vuelve a decir "$193"')
  // Y apunta a la fila del consumo en dólares, no a cualquiera: una fila corrida pintaría de dólares
  // un importe en pesos, que es el mismo defecto al revés.
  assert.match(String(r.filas[r.fUsd - 1][0]), /dólares/)
  assert.equal(String(r.filas[r.fUsd - 1][1]), `=${TARJETA.consumidoDolares}`)
})

test('sin consumo en dólares no hay fila, y el formateador no pinta una celda ajena', () => {
  // `fUsd` en 0 no es "la fila 0": es "no existe". Si devolviera un número igual, el formato de
  // dólares caería sobre la fila de arriba — un importe en pesos rotulado U$S.
  const sinUsd = { ...TARJETA, consumidoDolares: 0 }
  assert.equal(bandaFilas(31, { TARJETA: sinUsd, CORTE: '2026-07-22' }).fUsd, 0)
})

test('sin fecha propia, la tarjeta cae al corte del extracto — no se queda sin fechar', () => {
  const sinAl = { ...TARJETA }
  delete sinAl.al
  const r2 = bandaFilas(31, { TARJETA: sinAl, CORTE: '2026-07-22' })
  assert.match(JSON.stringify(Array.isArray(r2) ? r2 : r2.filas), /22\/07\/2026/)
})

// ═══ LA PUERTA DEL REDISEÑO NO PUEDE APAGAR LA FIRMA NI EL CANDADO (04/08) ═══
//
// `--rediseniar` existe porque `autoRespetarReescritura` bloquea, por diseño, cualquier cambio de
// layout: cuanto mejor es el rediseño, menos rótulos viejos sobreviven y más seguro lo frena. Pero
// la puerta tiene que apagar SÓLO esa comparación. La firma (¿editaste la pestaña desde mi última
// escritura?) y el candado (¿la tomaste vos?) corren ANTES y tienen que seguir mandando — si la
// bandera los apagara, sería el defecto que ya costó una pérdida del trabajo del dueño.

test('--rediseniar apaga la comparación de rótulos y NADA más', () => {
  const src = readFileSync(new URL('./tarjeta-pestana.mjs', import.meta.url), 'utf8')
  const firma = src.indexOf('firmaGuardia(google, ID, PESTANA')
  const puerta = src.indexOf("includes('--rediseniar')")
  const rotulos = src.indexOf('autoRespetarReescritura(ID, PESTANA')
  assert.ok(firma > 0 && puerta > 0 && rotulos > 0)
  assert.ok(firma < puerta, 'la firma se evalúa ANTES de la puerta: la bandera no puede saltearla')
  assert.ok(puerta < rotulos, 'la puerta gobierna la comparación de rótulos')
  // La firma corta con su propio return, independiente de la bandera.
  assert.match(src.slice(firma - 60, firma + 120), /if \(\(await firmaGuardia\([^)]*\)\)\.editada\) return/)
  // Y la bandera no aparece en la línea de la firma ni en la del candado.
  const lineaFirma = src.slice(src.lastIndexOf('\n', firma) + 1, src.indexOf('\n', firma))
  assert.ok(!lineaFirma.includes('REDISENAR'), 'la firma no se condiciona a la bandera')
})

test('sin la bandera, la comparación de rótulos sigue corriendo', () => {
  const src = readFileSync(new URL('./tarjeta-pestana.mjs', import.meta.url), 'utf8')
  assert.match(src, /\} else if \(\(await autoRespetarReescritura\(/, 'sin bandera se evalúa igual que antes')
  assert.match(src, /--rediseniar/, 'y el mensaje le dice al dueño cómo pedir el rediseño')
})

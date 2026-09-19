// EL VOCABULARIO DE LA MATRIZ — lo que este archivo impide que vuelva a pasar.
//
// Cada test nombra un defecto concreto: una ventana con un hueco (un movimiento que no cae en ninguna
// columna), un encabezado escrito como texto en vez de serial (CF_MESES prometiendo doce fechas y
// entregando once y una cadena), un "mayor movimiento" sin filtro de estado (la glosa contradiciendo
// al importe de al lado), o un footprint declarado que no es el que la grilla produce.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTOS, FILA, COL, GRAFICO,
  conceptosDe, filaDeConcepto, colTotal, columnasDeTiempo, filaGraficos, footprintDe,
  bloqueDeMedida, bloquesDeMedida, formulasDeMedida, medidasDeLaMatriz,
  ventanas, ventanasDiarias, particionExacta, expresionVentana, semanasDelAnio,
  formulaMayorImporte, formulaMayorContraparte, serialDeFecha, lunesDe, letra,
} from './cash-flow-matriz.mjs'
import { ESTADOS_PENDIENTES, MEDIDAS } from './cash-flow-medidas.mjs'
import {
  RUBROS_INGRESO, RUBROS_EGRESO, OTROS, claveSub, rotuloSub, rubrosDeApertura,
} from './cash-flow-rubros.mjs'

const HOY = new Date(Date.UTC(2026, 7, 5)) // miércoles 5 de agosto de 2026

test('EL AÑO ENTERO: 53 columnas semanales de 2026, y NINGUNA se sale del ejercicio', () => {
  const v = semanasDelAnio(2026)
  // El defecto que esto mata: un rodante desde hoy mete columnas de 2027 en un cuadro rotulado 2026 y
  // esconde las semanas ya cerradas, que son contra las que se compara lo que viene.
  assert.equal(v.length, 53)
  // ═══ Y EL SEGUNDO DEFECTO, EL DEL BORDE (13/08/2026) ═══
  //
  // Acá se exigía `v[0].desde === '2025-12-29'` y que la última contuviera al 3/1/2027: la ventana era
  // la semana ISO entera. El TOTAL del Semanal es `SUM` de las 53 columnas, así que se llevaba puestos
  // tres días de 2025 y tres de 2027 — $13.073.317 de nómina proyectada del 1/1/2027 medidos en vivo.
  // Ahora `lunes` es la IDENTIDAD de la columna (lo que va en el encabezado) y `desde`/`hasta` es lo
  // que la columna SUMA, recortado al ejercicio. Son dos preguntas distintas y confundirlas ERA el bug.
  assert.equal(v[0].lunes.toISOString().slice(0, 10), '2025-12-29', 'el encabezado sigue siendo el lunes')
  assert.equal(v[0].desde.toISOString().slice(0, 10), '2026-01-01', 'pero la primera columna NO suma diciembre de 2025')
  assert.equal(v[52].lunes.toISOString().slice(0, 10), '2026-12-28')
  assert.equal(v[52].hasta.toISOString().slice(0, 10), '2027-01-01', 'y la última NO suma enero de 2027')
  for (const s of v) assert.equal(s.lunes.getUTCDay(), 1, 'toda semana se rotula con su lunes')
  // Las 51 del medio no se tocan: el recorte muerde sólo en los dos bordes.
  for (const s of v.slice(1, 52)) assert.equal(s.desde.getTime(), s.lunes.getTime())
  // Y el ejercicio queda cubierto sin huecos ni solapes: cada día de 2026 cae en UNA columna.
  assert.deepEqual(particionExacta(v, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1))).huecos, [],
    'un hueco entre dos semanas es un movimiento que no cae en ninguna columna')
  assert.equal(ventanas('semana', { anio: 2026 }).length, 53)
})

test('LA VENTANA DE LA COLUMNA SE RECORTA AL EJERCICIO — el borde del año, en la fórmula', () => {
  // Éste es el test que se pone rojo si se revierte el arreglo: sin el recorte, la última columna
  // filtra hasta el 3/1/2027 y arrastra la nómina de enero al TOTAL del Semanal (y al MIN del piso).
  const conAnio = expresionVentana('$BB$7', 'semana', 2026)
  assert.equal(conAnio.desde, 'MAX($BB$7;DATE(2026;1;1))')
  assert.equal(conAnio.hasta, 'MIN($BB$7+7;DATE(2027;1;1))', 'la columna del 28/12 no puede sumar enero de 2027')
  // Uniforme en las 53, no sólo en las dos del borde: que el recorte dependa de acertar cuál es la
  // columna del borde es exactamente el error que se está cerrando — nadie estaba mirando esa columna.
  assert.equal(expresionVentana('$B$7', 'semana', 2026).hasta, 'MIN($B$7+7;DATE(2027;1;1))')
  // El mes no lo necesita: EOMONTH nunca se sale del año que se le pide.
  assert.ok(expresionVentana('$B$7', 'mes', 2026).hasta.includes('EOMONTH'))
  // Y sin año no hay ejercicio que recortar: el rodante de los controles mira hacia adelante.
  assert.equal(expresionVentana('$B$7', 'semana').hasta, '$B$7+7')
})

test('una vista semanal sin año ni largo de rodante NO se construye con un default silencioso', () => {
  // Ese default fue exactamente lo que puso columnas de 2027 en la pestaña de 2026.
  assert.throws(() => ventanas('semana', { hoy: HOY }), /año del ejercicio/)
  const rodante = ventanas('semana', { hoy: HOY, n: 13 })
  assert.equal(rodante.length, 13)
  assert.equal(rodante[0].desde.getTime(), lunesDe(HOY).getTime())
})

test('los doce meses del ejercicio parten el año exacto, con EOMONTH y no con +30', () => {
  const v = ventanas('mes', { anio: 2026 })
  assert.equal(v.length, 12)
  const r = particionExacta(v, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2027, 0, 1)))
  assert.deepEqual(r.huecos, [])
  assert.equal(v[1].hasta.getUTCDate(), 1, 'febrero termina el 1/3, no el 3/3')
  assert.ok(expresionVentana('$B$7', 'mes').hasta.includes('EOMONTH'))
  assert.equal(expresionVentana('$B$7', 'semana').hasta, '$B$7+7')
})

test('PARTICIÓN COHERENTE: una semana y un mes son uniones de las MISMAS ventanas diarias', () => {
  // Lo que hace imposible que las dos vistas se contradigan no es que las semanas sumen el mes —una
  // semana cruza el fin de mes y cae a los dos lados—, sino que las dos se construyen sobre la misma
  // unidad atómica con el mismo filtro. Eso es lo que se prueba.
  const sem = ventanas('semana', { anio: 2026 })
  for (const s of sem) {
    const dias = ventanasDiarias(s.desde, s.hasta)
    // 7 en las 51 del medio; en las dos del borde, los días que quedan DENTRO del ejercicio (4 y 3).
    // Un día de menos acá no es un redondeo: es plata que no cae en ninguna columna.
    assert.deepEqual(particionExacta(dias, s.desde, s.hasta).huecos, [])
  }
  const largos = sem.map((s) => ventanasDiarias(s.desde, s.hasta).length)
  assert.deepEqual(largos.filter((n) => n !== 7), [4, 4], 'sólo la primera y la última columna están recortadas')
  // Y LA CUENTA QUE CIERRA EL ASUNTO: 4 + 51×7 + 4 = 365. Las 53 columnas suman los días de 2026, ni
  // uno más ni uno menos. Con la ventana sin recortar daban 371 — seis días ajenos adentro del TOTAL.
  assert.equal(largos.reduce((a, b) => a + b, 0), 365)
  for (const m of ventanas('mes', { anio: 2026 })) {
    const dias = ventanasDiarias(m.desde, m.hasta)
    assert.deepEqual(particionExacta(dias, m.desde, m.hasta).huecos, [])
  }
})

test('la partición detecta un hueco: si un día se cae, el test se pone rojo', () => {
  const m = ventanas('mes', { anio: 2026 })[7]
  const dias = ventanasDiarias(m.desde, m.hasta).filter((d) => d.desde.getUTCDate() !== 15)
  const r = particionExacta(dias, m.desde, m.hasta)
  assert.equal(r.ok, false)
  assert.equal(r.huecos.length, 1)
})

/** El tronco: ni las sub-líneas de rubro, ni la sección por cliente que cuelga del final. */
const troncoDe = (tipo) => conceptosDe(tipo).filter((c) => !c.sub && !c.cli && !c.tituloSeccion)

test('el TRONCO está en el orden que pidió el dueño, y el saldo final en la misma fila en las dos vistas', () => {
  assert.deepEqual(troncoDe('semana').map((c) => c.rotulo), [
    'Saldo inicial', 'Ingresos reales', 'Ingresos proyectados', 'Egresos reales', 'Egresos proyectados',
    'Resultado', 'Saldo final',
  ])
  assert.deepEqual(troncoDe('mes').map((c) => c.rotulo).slice(7), [
    'Variación vs presupuesto', 'Variación vs mes anterior',
  ])
  assert.equal(FILA.cabecera, 7)
  assert.equal(filaDeConcepto('semana', 'saldoInicial'), 8)
  assert.equal(filaDeConcepto('semana', 'saldoFinal'), filaDeConcepto('mes', 'saldoFinal'),
    'las dos vistas tienen el saldo final en la misma fila')
})

test('LA APERTURA POR RUBRO: cada medida abre en sus rubros del libro más "Otros", y las dos vistas igual', () => {
  assert.equal(medidasDeLaMatriz().length, 4)
  for (const tipo of ['semana', 'mes']) {
    for (const b of bloquesDeMedida(tipo)) {
      // La apertura depende del signo Y del estado: "Ingresos reales" NO abre en "Valores en cartera",
      // que es cero por construcción (cuando el valor se acredita entra por el banco como "Cobranzas").
      const esperados = rubrosDeApertura(b.clave.startsWith('ingreso') ? 1 : -1, b.clave.endsWith('Real'))
      assert.deepEqual(b.rubros.map((r) => r.rubro), [...esperados], `${tipo}/${b.clave}`)
      // Las sub-líneas son contiguas y "Otros" va última: la piel las formatea como un rango.
      assert.equal(b.primeraSub, b.subtotal + 1)
      assert.equal(b.ultimaSub, b.otros)
      assert.equal(b.otros, b.subtotal + esperados.length + 1)
    }
  }
  // Las mismas filas relativas en las dos vistas: un rubro no puede estar en un lugar acá y otro allá.
  const rel = (tipo) => bloquesDeMedida(tipo).map((b) => [b.clave, b.subtotal - FILA.concepto, b.otros - FILA.concepto])
  assert.deepEqual(rel('semana'), rel('mes'))
  assert.equal(rotuloSub('Impuestos'), '    · Impuestos')
  assert.equal(claveSub('egresoReal', 'Impuestos'), 'egresoReal::Impuestos')
})

test('la taxonomía no tiene duplicados, y ningún rubro se llama "Otros"', () => {
  // Un rubro repetido se sumaría dos veces adentro de la apertura y "Otros" saldría negativo sin que
  // nada diera error: el subtotal seguiría siendo el del libro y la resta no cerraría.
  for (const lista of [RUBROS_INGRESO, RUBROS_EGRESO]) {
    assert.equal(new Set(lista).size, lista.length, JSON.stringify(lista))
    assert.ok(!lista.includes(OTROS), '"Otros" no es un rubro del libro: es lo que queda al restar')
  }
  assert.equal(new Set(CONCEPTOS.map((c) => c.clave)).size, CONCEPTOS.length, 'dos conceptos con la misma clave')
})

test('"Otros" SE DESPEJA del subtotal: un rubro nuevo del Libro aparece ahí en vez de desaparecer', () => {
  const lineas = formulasDeMedida('semana', 'egresoReal', { col: 1, desde: '$B$7', hasta: '$B$7+7' })
  const b = bloqueDeMedida('semana', 'egresoReal')
  const otros = lineas.find((l) => l.fila === b.otros).formula
  // Subtotal menos las sub-líneas LISTADAS, por aritmética de celdas de la propia columna. Si en vez
  // de esto el subtotal fuera la SUMA de las sub-líneas, un rubro que el Libro empiece a emitir mañana
  // se caería del cuadro y el total seguiría cerrando consigo mismo: coherente y falso.
  assert.equal(otros, `=N($B$${b.subtotal})-SUM($B$${b.primeraSub}:$B$${b.otros - 1})`)
  // Y el subtotal es el LIBRO, no la suma de abajo.
  const sub = lineas.find((l) => l.fila === b.subtotal).formula
  assert.ok(sub.startsWith('=SUMPRODUCT('), sub)
  assert.ok(!sub.includes('SUM($B$'), 'el subtotal no puede salir de sus propias sub-líneas')
  // Cada rubro filtra por su nombre EXACTO, el que emite el libro.
  for (const r of b.rubros) {
    const f = lineas.find((l) => l.fila === r.fila).formula
    assert.ok(f.includes(`="${r.rubro}"`), `${r.rubro}: ${f}`)
  }
})

test('el footprint declarado es el que la matriz ocupa de verdad: ni una columna de más', () => {
  for (const [tipo, n] of [['semana', 53], ['mes', 12]]) {
    const fp = footprintDe(tipo, 2026)
    assert.equal(columnasDeTiempo(tipo, 2026), n)
    assert.equal(fp.cols, 1 + n + 1, `${tipo}: concepto + tiempo + TOTAL`)
    assert.equal(colTotal(tipo, 2026), fp.cols - 1)
    // El alto tiene que alojar el cuadro Y LA ZONA DE GRÁFICOS entera: `anchorCell` es una celda real
    // (si la hoja no llega, addChart devuelve 400) y si el achique no la contemplara, deleteDimension
    // amputaría los gráficos recién dibujados.
    assert.equal(fp.filas, filaGraficos(tipo) + GRAFICO.filas + GRAFICO.margen)
    assert.ok(fp.filas > filaGraficos(tipo) + GRAFICO.filas, `${tipo}: el gráfico termina fuera de la hoja`)
    // El techo subió de 100 a 130 el 06/08 y hay que decir por qué: la sección POR CLIENTE agrega 36
    // filas (7 bloques × 5, más el título) y el semanal pasó de 43 a 79 filas de cuadro. Sigue siendo
    // un techo y no un cheque en blanco: lo que se vino a sacar eran 220 filas para un cuadro de 45.
    assert.ok(fp.filas <= 130, `${tipo}: ${fp.filas} filas — el cuadro está creciendo sin control`)
  }
  assert.equal(COL.tiempo0, 1)
  assert.equal(GRAFICO.col0, COL.tiempo0, 'los gráficos se anclan en B: contra la columna A no respiran')
})

test('el encabezado de tiempo es un SERIAL: el texto "1/12/2026" ya dejó CF_MESES con una cadena adentro', () => {
  assert.equal(serialDeFecha(new Date(Date.UTC(2026, 0, 1))), 46023)
  assert.equal(typeof serialDeFecha(new Date(Date.UTC(2026, 11, 1))), 'number')
})

test('un "mayor movimiento" SIN filtro de estado no se puede construir', () => {
  // El defecto que esto mata: la glosa decía "Mayor pago: ARCOR · $12.500.000" al lado de un "Pagado
  // —". Las dos celdas eran correctas por separado y juntas mentían.
  assert.throws(() => formulaMayorImporte('TODAY()', 'TODAY()+7', -1), /filtro de estado/)
  assert.throws(() => formulaMayorImporte('TODAY()', 'TODAY()+7', -1, []), /filtro de estado/)
})

test('el mayor pago y su contraparte llevan EXACTAMENTE el mismo filtro', () => {
  const est = [...ESTADOS_PENDIENTES]
  const imp = formulaMayorImporte('TODAY()', 'TODAY()+7', -1, est)
  const quien = formulaMayorContraparte('TODAY()', 'TODAY()+7', -1, est, '$H$5')
  for (const e of est) {
    assert.ok(imp.includes(`="${e}"`), `el importe no filtra ${e}`)
    assert.ok(quien.includes(`="${e}"`), `la contraparte no filtra ${e}`)
  }
  assert.ok(imp.includes('$B$2:$B=-1') && quien.includes('$B$2:$B=-1'), 'los dos miran el mismo signo')
  assert.ok(quien.includes('$H$5'), 'la contraparte se busca por el importe que ya calculó la celda de al lado')
})

test('las cuatro medidas son una partición del flujo: real y pendiente, sin superponerse', () => {
  assert.deepEqual(MEDIDAS.map((m) => m.estados.join('|')), [
    'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO', 'REAL', 'PROYECTADO|VENCIDO|COMPROMETIDO',
  ], 'un estado en dos medidas del mismo signo se contaría dos veces; uno en ninguna desaparece')
  assert.deepEqual(MEDIDAS.map((m) => m.signo), [1, 1, -1, -1])
  // Cada medida tiene su fila, y cada fila su medida: una medida sin fila no se muestra en ningún lado.
  const conMedida = CONCEPTOS.filter((c) => c.medida !== undefined).map((c) => c.medida)
  assert.deepEqual(conMedida, [0, 1, 2, 3])
})

test('letra() nombra las columnas igual que el resto del repo', () => {
  assert.equal(letra(0), 'A')
  assert.equal(letra(13), 'N')
  assert.equal(letra(14), 'O')
})

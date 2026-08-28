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

test('EL AÑO ENTERO: 53 semanas de 2026, la primera contiene el 1° de enero y la última el 31/12', () => {
  const v = semanasDelAnio(2026)
  // El defecto que esto mata: un rodante desde hoy mete columnas de 2027 en un cuadro rotulado 2026 y
  // esconde las semanas ya cerradas, que son contra las que se compara lo que viene.
  assert.equal(v.length, 53)
  assert.equal(v[0].desde.toISOString().slice(0, 10), '2025-12-29', 'la semana del 1° de enero arranca en diciembre')
  assert.ok(v[0].desde <= new Date(Date.UTC(2026, 0, 1)) && new Date(Date.UTC(2026, 0, 1)) < v[0].hasta)
  const fin = new Date(Date.UTC(2026, 11, 31))
  assert.ok(v[52].desde <= fin && fin < v[52].hasta, 'la última semana tiene que contener el 31/12')
  for (const s of v) assert.equal(s.desde.getUTCDay(), 1, 'toda semana arranca el lunes')
  assert.deepEqual(particionExacta(v, v[0].desde, v[52].hasta).huecos, [],
    'un hueco entre dos semanas es un movimiento que no cae en ninguna columna')
  assert.equal(ventanas('semana', { anio: 2026 }).length, 53)
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
  for (const s of ventanas('semana', { anio: 2026 })) {
    const dias = ventanasDiarias(s.desde, s.hasta)
    assert.equal(dias.length, 7)
    assert.deepEqual(particionExacta(dias, s.desde, s.hasta).huecos, [])
  }
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

test('ninguna fila del cuadro se llama «Resultado»: esto es caja percibida, no resultado devengado', () => {
  // ═══ EL DEFECTO QUE ESTE TEST MANTIENE MUERTO (28/08/2026) ═══
  //
  // El 28/08 se sacó del titular la tarjeta "VARIACIÓN DE CAJA DEL AÑO" porque el dueño leía su
  // $(23.136.331) como una pérdida —*"la empresa no termina perdiendo tampoco como marca el
  // resultado"*—. Esa tarjeta era literalmente `=N($N$resultado)`: la CELDA que la alimentaba siguió
  // publicando el mismo número una fila más abajo, bajo el rótulo "Resultado", en un cuadro percibido.
  // Reglas de oro 4, 5 y 7: el resultado es devengado y vive en el P&L. Sacar el titular y dejar el
  // número con la palabra que lo produjo no arregla el reclamo: lo esconde.
  for (const tipo of ['mes', 'semana']) {
    for (const c of conceptosDe(tipo)) {
      assert.ok(!/^\s*Resultado\b/i.test(c.rotulo ?? ''),
        `${tipo}: la fila "${c.rotulo}" volvió a llamarse resultado en un cuadro por criterio percibido`)
    }
    assert.equal(troncoDe(tipo).find((c) => c.clave === 'resultado').rotulo, 'Variación de caja del período')
  }
})

test('el TRONCO está en el orden que pidió el dueño, y el saldo final en la misma fila en las dos vistas', () => {
  assert.deepEqual(troncoDe('semana').map((c) => c.rotulo), [
    'Saldo inicial', 'Ingresos reales', 'Ingresos proyectados', 'Egresos reales', 'Egresos proyectados',
    'Variación de caja del período', 'Saldo final',
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

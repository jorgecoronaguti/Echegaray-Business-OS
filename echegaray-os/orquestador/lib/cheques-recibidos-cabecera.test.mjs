// La cabecera de "Cheques Recibidos" se construye sola: acá se prueba lo que NO se ve mirándola.
//
// LOS CUATRO DEFECTOS REALES QUE ESTOS TESTS DEJAN ATRAPADOS:
//
//   1. ESCRIBIR ARRIBA DEL REGISTRO. Las filas 27 y 28 son el encabezado y la QUERY que derrama todo
//      el registro: una sola celda escrita ahí adentro lo deja en #REF!. La grilla tiene 26 filas y
//      ninguna de sus fórmulas puede citar una fila de la 27 para abajo.
//   2. LA PARTICIÓN QUE NO CIERRA. Los cinco tramos tienen que sumar exactamente lo que está en
//      cartera. Un hueco entre bordes —o los cheques sin fecha de pago, que no caen en ningún
//      tramo— hace desaparecer plata real sin romper ninguna suma.
//   3. DOS DEFINICIONES DE "LOS PRÓXIMOS SIETE DÍAS" en la misma pantalla: la tarjeta y el resumen.
//   4. UNA COMA DE SEPARADOR en un archivo es-AR: la celda queda en #ERROR!.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  grilla, valorSelector, reglasCondicionales, reglasABorrar, celdaDia, exprFrescura,
  BANDA, ANCHO, TRAMOS, TERMINALES, INDICADORES, SELECTOR_DEFECTO,
  FILA_TITULO, FILA_FRESCURA, FILA_VALORES, FILA_CAL, FILA_DIAS, FILA_SEM0, SEMANAS,
  FILA_CARTERA, FILA_TRAMO0, FILA_ESTADO0, FILA_REGISTRO, FILA_HDR_REGISTRO, FILA_QUERY_REGISTRO,
  COL_CAL0, COL_CAL1,
} from './cheques-recibidos-cabecera.mjs'
import { formulaCartera, formulaCarteraTramo, EN_CARTERA } from './cartera-cheques.mjs'

const { filas } = grilla({ selector: SELECTOR_DEFECTO })
const celda = (f, c) => String(filas[f - 1][c] ?? '')
/** Todo lo que la grilla escribe, en una sola lista: para las reglas que valen para TODA la banda. */
const todas = filas.flat().map((c) => String(c ?? '')).filter(Boolean)
const formulas = todas.filter((c) => c.startsWith('='))

test('la banda tiene 26 filas exactas y termina en REGISTRO, justo arriba del encabezado real', () => {
  assert.equal(filas.length, BANDA)
  assert.ok(filas.every((f) => f.length === ANCHO), 'alguna fila no tiene el ancho de la pestaña')
  assert.equal(celda(FILA_REGISTRO, 0), 'REGISTRO')
  assert.equal(FILA_REGISTRO, BANDA)
  // El contrato con el registro: encabezado en la 27, QUERY en la 28. La banda termina ANTES.
  assert.equal(FILA_HDR_REGISTRO, BANDA + 1)
  assert.equal(FILA_QUERY_REGISTRO, BANDA + 2)
})

test('NINGUNA fórmula de la banda cita una fila del registro: ahí vive el derrame de la QUERY', () => {
  for (const f of formulas) {
    // Las referencias a la réplica son legítimas y tienen filas propias ($G$4:$G): se sacan primero.
    const propias = f.replace(/_CHEQUES_RAW!\$?[A-L]\$?\d*(:\$?[A-L]\$?\d*)?/g, '')
      .replace(/"(?:[^"]|"")*"/g, '')
    const m = propias.match(/\$?[A-J]\$?(\d+)/g) || []
    for (const ref of m) {
      const fila = Number(String(ref).replace(/[^\d]/g, ''))
      assert.ok(fila < FILA_HDR_REGISTRO, `la fórmula cita la fila ${fila}, que es del registro: ${f}`)
    }
  }
})

test('los siete indicadores, en orden y todos fórmula: ni un número pegado arriba', () => {
  assert.equal(INDICADORES.length, 7)
  assert.deepEqual(INDICADORES.map((i) => i.rotulo), [
    'EN CARTERA', 'DEPOSITADO', 'ENDOSADO', 'RECHAZADO', 'PRÓX. 7 DÍAS', 'PRÓX. 30 DÍAS', 'MAYOR INGRESO DIARIO',
  ])
  INDICADORES.forEach((ind, i) => {
    assert.equal(celda(FILA_VALORES, i), ind.formula())
    assert.ok(celda(FILA_VALORES, i).startsWith('='), `la tarjeta ${ind.rotulo} tiene un valor pegado`)
  })
})

test('la cartera se calcula UNA vez: el resumen cita la tarjeta en vez de recalcularla', () => {
  // Dos fórmulas equivalentes para el mismo número es cómo una pestaña se contradice a sí misma.
  assert.equal(celda(FILA_VALORES, 0), formulaCartera())
  assert.equal(celda(FILA_CARTERA, 1), `=$A$${FILA_VALORES}`)
  TERMINALES.forEach((t, i) => {
    assert.equal(celda(FILA_ESTADO0 + i, 1), `=$${String.fromCharCode(66 + i)}$${FILA_VALORES}`)
    assert.equal(INDICADORES[i + 1].formula().includes(`"${t.estado}"`), true, `la tarjeta ${i + 1} no es ${t.estado}`)
  })
})

test('LA PARTICIÓN: los cinco tramos son contiguos, sin hueco ni solape, y cubren toda la recta', () => {
  assert.equal(TRAMOS.length, 5)
  assert.equal(TRAMOS[0].desde, null, 'el primer tramo no puede tener piso: un vencido viejo se perdería')
  assert.equal(TRAMOS.at(-1).hasta, null, 'el último no puede tener techo: un diferido a 2027 se perdería')
  for (let i = 1; i < TRAMOS.length; i++) {
    assert.equal(TRAMOS[i].desde, TRAMOS[i - 1].hasta,
      `entre "${TRAMOS[i - 1].rotulo}" y "${TRAMOS[i].rotulo}" hay un hueco o un solape`)
  }
})

test('LA PARTICIÓN incluye los cheques SIN FECHA, que no caen en ningún tramo', () => {
  // Una celda vacía no compara contra un borde: sin esta línea, un valor real desaparece de la vista
  // sin romper ninguna suma. Va en el tramo más lejano, y el rótulo lo dice.
  const conSinFecha = TRAMOS.filter((t) => t.sinFecha)
  assert.equal(conSinFecha.length, 1)
  assert.equal(conSinFecha[0], TRAMOS.at(-1), 'lo que no se puede fechar no se puede contar como que entra pronto')
  assert.match(conSinFecha[0].rotulo, /sin fecha/i, 'el rótulo tiene que decirlo: nadie lee este archivo')
  const f = celda(FILA_TRAMO0 + TRAMOS.length - 1, 1)
  assert.match(f, /\+SUMIFS\(/, 'el último tramo tiene que sumar además los que no tienen fecha')
  assert.match(f, /_CHEQUES_RAW!\$F\$4:\$F;""/, 'el criterio de "sin fecha" es la celda vacía')
})

test('EL CONTROL DE LA PARTICIÓN ESTÁ EN LA PESTAÑA: si deja de cerrar, se pinta de rojo', () => {
  // No se escribe como texto —la pestaña no explica nada— pero tampoco se confía: una regla
  // condicional compara la suma de los tramos contra el total en cada apertura del archivo.
  const reglas = reglasCondicionales(7)
  const f = reglas.map((r) => r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue)
    .find((x) => x.includes(`$B$${FILA_CARTERA}`))
  assert.ok(f, 'no hay ninguna regla que compare la partición contra el total')
  assert.equal(f, `=ROUND(SUM($B$${FILA_TRAMO0}:$B$${FILA_TRAMO0 + 4}))<>ROUND($B$${FILA_CARTERA})`)
})

test('UNA sola definición de "los próximos 7 días": la tarjeta es la suma de dos tramos del resumen', () => {
  const [, hoy, siete] = TRAMOS
  assert.equal(INDICADORES[4].formula(), formulaCarteraTramo(hoy.desde, siete.hasta),
    'la tarjeta y el resumen se calcularían con bordes distintos: dos números para la misma frase')
  assert.equal(hoy.desde, 'TODAY()')
  assert.equal(siete.hasta, 'TODAY()+7')
})

test('EL CALENDARIO: 42 celdas de día, todas sobre la cartera de _CHEQUES_RAW', () => {
  assert.equal(celda(FILA_CAL, 0), 'CALENDARIO')
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => celda(FILA_DIAS, COL_CAL0 + i)), ['L', 'M', 'M', 'J', 'V', 'S', 'D'])
  let n = 0
  for (let s = 0; s < SEMANAS; s++) {
    for (let d = 0; d < 7; d++, n++) {
      const c = celda(FILA_SEM0 + s, COL_CAL0 + d)
      assert.equal(c, celdaDia(n), `la celda ${s},${d} no es el día ${n}`)
      assert.match(c, /_CHEQUES_RAW!\$A\$4:\$A;"recibido"/, 'el día no filtra por cheque recibido')
      assert.match(c, new RegExp(`_CHEQUES_RAW!\\$H\\$4:\\$H;"${EN_CARTERA}"`), 'el día suma cheques que ya no son cartera')
      assert.match(c, /CHAR\(10\)/, 'el día y el monto tienen que ir en dos renglones')
    }
  }
  assert.equal(n, 42)
  assert.equal(COL_CAL1 - COL_CAL0, 7)
})

test('el calendario cuelga del SELECTOR, no del reloj: dos corridas dan lo mismo', () => {
  // Si el mes se resolviera en JavaScript, el calendario quedaría clavado en el mes de la corrida y
  // habría que regenerar la pestaña cada 1° — que es exactamente cómo envejeció la cabecera anterior.
  assert.deepEqual(grilla({ selector: SELECTOR_DEFECTO }).filas, filas)
  for (const c of formulas) {
    assert.doesNotMatch(c.replace(/"(?:[^"]|"")*"/g, ''), /\d{1,2}\/\d{1,2}\/\d{2,4}/, `hay una fecha estampada: ${c}`)
  }
  assert.match(celdaDia(0), /EOMONTH\(\$B\$7;-1\)\+1/)
})

test('EL SELECTOR ES DEL DUEÑO: lo que él escriba vuelve tal cual, y en su especie', () => {
  // La cabecera se escribe como un rectángulo entero: sin esto, cada corrida le borraría el mes.
  assert.equal(valorSelector({}), SELECTOR_DEFECTO)
  assert.equal(valorSelector({ formula: '=EOMONTH(TODAY();-1)+1' }), '=EOMONTH(TODAY();-1)+1')
  assert.equal(valorSelector({ formula: '=DATE(2026;9;1)', crudo: 46266 }), '=DATE(2026;9;1)')
  // Una fecha tipeada vuelve como NÚMERO: re-escribirla como texto "01/09/2026" la convertiría en
  // TEXTO y el calendario entero pasaría a #VALUE! sin que nadie escribiera nada mal.
  assert.equal(valorSelector({ formula: '01/09/2026', crudo: 46266 }), 46266)
  assert.equal(typeof valorSelector({ formula: '01/09/2026', crudo: 46266 }), 'number')
  // El 0 de una celda vacía no es una fecha: sería el 30/12/1899.
  assert.equal(valorSelector({ formula: '', crudo: 0 }), SELECTOR_DEFECTO)
  assert.equal(valorSelector({ crudo: 'agosto' }), 'agosto')
})

test('LA FRESCURA SALE DE LA RÉPLICA, NO DEL RELOJ NI DE UN TEXTO PEGADO', () => {
  // El defecto que se está arreglando: A2 tenía un rótulo escrito a mano y vencido. Un corte que no
  // es fórmula miente al día siguiente y se lee como un hecho.
  const a2 = celda(FILA_FRESCURA, 0)
  assert.ok(a2.startsWith('='), 'la frescura tiene que ser fórmula')
  assert.match(a2, /_CHEQUES_RAW!\$A\$1/, 'la fecha sale del rótulo de la réplica, que es quien la sabe')
  assert.match(a2, /sin datos/, 'si la réplica no dice su corte, lo declara en vez de inventar una fecha')
  assert.doesNotMatch(exprFrescura(), /DATEVALUE/, 'DATEVALUE sobre un ISO en es-AR puede leer el mes por el día')
  assert.equal(celda(FILA_TITULO, 0), 'CHEQUES RECIBIDOS')
})

test('CERO texto explicativo: ninguna celda de la banda es una frase larga', () => {
  // El pedido del dueño para estas pestañas: valores y fechas protagonistas, nada de una columna
  // "Qué significa". El subtítulo de frescura es la única prosa, y es una línea.
  // 30 caracteres = el rótulo más largo que se acepta ("   · Posteriores o sin fecha", con su
  // indentación de sub-ítem). De ahí para arriba ya no es un rótulo, es una explicación.
  const textos = todas.filter((c) => !c.startsWith('='))
  for (const t of textos) assert.ok(t.length <= 30, `hay texto explicativo en la banda (${t.length}): ${t}`)
})

test('separador es-AR: ni una coma fuera de un literal de texto', () => {
  const reglas = reglasCondicionales(7).map((r) => r.addConditionalFormatRule.rule.booleanRule.condition.values[0].userEnteredValue)
  for (const f of [...formulas, ...reglas]) {
    const sinTexto = f.replace(/"(?:[^"]|"")*"/g, '""')
    assert.ok(!sinTexto.includes(','), `separador con coma (rompe en es-AR): ${f}`)
    // Un paréntesis sin cerrar es la diferencia entre una fórmula y un #ERROR! en la pestaña real.
    let n = 0
    let enTexto = false
    for (const c of f) {
      if (c === '"') enTexto = !enTexto
      else if (!enTexto && c === '(') n++
      else if (!enTexto && c === ')') n--
      assert.ok(n >= 0, `paréntesis de más: ${f}`)
    }
    assert.equal(n, 0, `paréntesis sin cerrar: ${f}`)
  }
})

test('las reglas condicionales que se borran son SÓLO las de adentro de la banda', () => {
  // Esta pestaña la comparten la cabecera y un registro que no es de este generador: borrarlas todas
  // —lo que hace CAJA, que sí es íntegramente suya— borraría reglas ajenas.
  const dentro = { ranges: [{ startRowIndex: 0, endRowIndex: BANDA }] }
  const ajena = { ranges: [{ startRowIndex: 27, endRowIndex: 400 }] }
  const cruzada = { ranges: [{ startRowIndex: 0, endRowIndex: 400 }] }
  const abierta = { ranges: [{ startRowIndex: 0 }] }
  assert.deepEqual(reglasABorrar([dentro, ajena, dentro, cruzada, abierta]), [2, 0])
  assert.deepEqual(reglasABorrar([]), [])
  // DESCENDENTE: borrar por índice reindexa lo que queda; de menor a mayor se borra la regla equivocada.
  const orden = reglasABorrar([dentro, dentro, dentro])
  assert.deepEqual(orden, [2, 1, 0])
})

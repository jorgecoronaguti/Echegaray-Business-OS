// ¿ENTRA EL TITULAR? — el control que reproduce el número cortado y prueba que puede volver a gritar.
//
// LA REGLA DEL REPO: todo control que puede dar verde necesita un test negativo que lo ponga en rojo
// con una mutación mínima. Acá la mutación es el layout viejo —la glosa en la celda de al lado, que le
// dejaba al importe una sola columna de 95 px— y tiene que reproducir exactamente el defecto que el
// dueño vio en el PDF.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  auditarHero, anchoDeSlot, anchoEnPx, spansDelHero, PADDING_CELDA, IMPORTE_MAS_LARGO,
} from './cash-flow-hero-cabe.mjs'
import { ANCHOS, pielMatriz } from './cash-flow-piel-matriz.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'
import { IMPORTE_MUESTRA } from './cash-flow-invertido.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { FILA } from './cash-flow-matriz.mjs'

/** Los anchos que la piel escribe: la columna del concepto, las de tiempo y la del TOTAL. */
const anchoCol = (cols) => (c) => {
  if (c === 0) return ANCHOS.concepto
  if (c === cols - 1) return ANCHOS.total
  return ANCHOS.tiempo
}

/** El cuerpo con el que la piel escribe cada línea del hero (`formatoHero`). */
const CUERPO = { rotulo: 9, valor: 12, nota: 9 }

/**
 * Las piezas del titular, con el importe más largo en lugar de la cifra.
 *
 * ═══ POR QUÉ SALEN DE `meta.hero.piezas` Y NO DE RASPAR LA GRILLA (28/08/2026) ═══
 *
 * Una fórmula no se puede medir: lo que se mide es lo que Sheets va a MOSTRAR. La versión anterior
 * raspaba las celdas y SALTEABA toda glosa que empezara con `=`, así que las tres glosas que llevan un
 * importe adentro —las que pueden crecer— eran justamente las que no se medían. Ahora el generador
 * DECLARA el peor caso ya renderizado de cada pieza y el auditor lo mide; el que no puede declarar una
 * muestra honesta (una glosa que termina en un nombre de proveedor, sin tope conocido) no la declara,
 * y así se ve qué queda sin medir en vez de creer que se midió todo.
 */
/**
 * LOS MERGES QUE LA PIEL EMITE SOBRE LA FILA DEL VALOR. Es lo que hace que la celda mida lo que el
 * auditor cree que mide: sin ellos, el número tiene UNA columna de 95 px y el resto era desborde —
 * que el PDF de Google no dibuja (ver la cabecera de `cash-flow-hero-cabe`).
 */
const mergesDelValor = (meta) => pielMatriz({ sheetId: 0, meta })
  .filter((r) => r.mergeCells?.range?.startRowIndex === meta.hero.valor - 1)
  .map((r) => ({ desde: r.mergeCells.range.startColumnIndex, hasta: r.mergeCells.range.endColumnIndex }))

function piezasDe(meta, filas, { importe = IMPORTE_MAS_LARGO } = {}) {
  // LA CELDA DEL VALOR TIENE QUE EXISTIR ANTES DE MEDIRLA. Medir el importe contra el slot entero
  // mientras la celda es una columna es exactamente el agujero que dejó `($31.332.233` en el PDF: el
  // auditor daba verde midiendo un ancho que el Sheet no le daba a nadie.
  const merges = mergesDelValor(meta)
  for (const { desde, hasta } of spansDelHero(meta.hero.slots, meta.footprint.cols)) {
    if (hasta - desde <= 1) continue
    // ═══ EL PRIMER SLOT NO SE PUEDE MERGEAR, Y NO ES UNA OMISIÓN (31/08/2026) ═══
    //
    // Arranca en la columna A, que va CONGELADA para que el concepto siga a la vista con doce meses
    // a la derecha. Sheets rechaza fusionar a través de esa frontera —«You can't merge frozen and
    // non-frozen columns»— con un 400 que tumba el lote ENTERO: el 31/08 el Cash Flow Mensual quedó
    // sin una sola regla de formato por culpa de esta tarjeta.
    //
    // El test deja de exigir ese merge y pasa a exigir lo contrario: que NINGUNO lo cruce. La
    // tarjeta vuelve a medirse por desborde, que es como estaba antes de que el merge existiera.
    if (desde < 1 && hasta > 1) {
      assert.ok(!merges.some((m) => m.desde < 1 && m.hasta > 1),
        `${meta.pestana}: hay un merge que cruza la columna congelada — la API devuelve 400 y la pestaña queda sin formato`)
      continue
    }
    assert.ok(merges.some((m) => m.desde === desde && m.hasta === hasta),
      `${meta.pestana}: la piel no mergea la celda del valor en ${desde}..${hasta}, así que el importe se corta en su columna`)
  }
  // SIN `?? []`. Ese operador convertía la AUSENCIA de declaración en un auditor que mide cero piezas
  // y dice que todo entra: borrar `meta.hero.piezas` del Semanal dejaba la suite en verde con los
  // cuatro rótulos y la glosa de CAJA HOY sin medir. Es el mismo defecto que este archivo corrigió
  // —antes se salteaba lo que era fórmula, después lo que no se declaraba— mudado de lugar.
  assert.ok(Array.isArray(meta.hero.piezas) && meta.hero.piezas.length,
    `${meta.pestana}: el generador no declaró ninguna pieza del titular, así que no hay nada que medir`)
  const out = meta.hero.slots.map((_, i) => ({ slot: i, pieza: 'valor', texto: importe, tamano: CUERPO.valor, negrita: true }))
  for (const p of meta.hero.piezas) {
    out.push({ ...p, tamano: p.pieza === 'rotulo' ? CUERPO.rotulo : CUERPO.nota, negrita: p.pieza === 'rotulo' })
  }
  return out
}

/** El texto de una celda de la grilla. */
const enGrilla = (filas, fila, col) => String((filas[fila - 1] || [])[col] ?? '')

/**
 * LO QUE EL GENERADOR TIENE QUE DECLARAR, CONTRASTADO CONTRA LO QUE ESCRIBIÓ.
 *
 * Un auditor que mide lo que le quieran declarar no audita: acredita. Acá se exige, por cada slot, el
 * rótulo; y por cada glosa que RENDERIZA UN IMPORTE (`"$ #,##0"` adentro de la fórmula) una muestra
 * que lleve el importe más largo. Las glosas que no rinden plata —una fecha, el nombre de un
 * proveedor— quedan fuera de la medición A PROPÓSITO y por eso se enumeran: la lista es el límite
 * declarado, y una glosa nueva sin medir la rompe.
 */
function exigirDeclaracion(meta, filas, { sinMedir = [] } = {}) {
  const faltan = []
  const noMedidas = []
  meta.hero.slots.forEach((col, i) => {
    const declaradas = (meta.hero.piezas ?? []).filter((p) => p.slot === i)
    if (!declaradas.some((p) => p.pieza === 'rotulo' && p.texto === enGrilla(filas, meta.hero.rotulo, col))) {
      faltan.push(`slot ${i + 1}: el rótulo no está declarado o no es el que se escribió`)
    }
    const glosa = enGrilla(filas, meta.hero.nota, col)
    if (!glosa) return
    const nota = declaradas.find((p) => p.pieza === 'nota')
    const rindePlata = glosa.includes('"$ #,##0"')
    if (!nota) { noMedidas.push(i + 1); if (rindePlata) faltan.push(`slot ${i + 1}: la glosa renderiza un importe y no declaró muestra`) ; return }
    // TANTOS IMPORTES EN LA MUESTRA COMO EN LA FÓRMULA. Exigir UNO alcanzaba para que una glosa que
    // crece a tres importes se siguiera midiendo contra la muestra vieja de dos: la pieza declarada
    // mide menos de lo que la celda va a mostrar, que es exactamente el agujero que este auditor
    // existe para tapar. Se cuentan los `"$ #,##0"` de la fórmula (los patrones de FECHA no cuentan).
    const importes = (glosa.match(/"\$ #,##0"/g) ?? []).length
    const declarados = nota.texto.split(IMPORTE_MUESTRA).length - 1
    if (rindePlata && declarados !== importes) {
      faltan.push(`slot ${i + 1}: la fórmula muestra ${importes} importe(s) y la muestra "${nota.texto}" declara ${declarados}`)
    }
    if (!glosa.startsWith('=') && nota.texto !== glosa) {
      faltan.push(`slot ${i + 1}: la glosa es texto fijo ("${glosa}") y se declaró otra cosa ("${nota.texto}")`)
    }
  })
  assert.deepEqual(faltan, [], `${meta.pestana}: el titular declaró de menos`)
  assert.deepEqual(noMedidas, sinMedir, `${meta.pestana}: cambió qué glosas quedan sin medir`)
}

test('LA MUTACIÓN QUE REPRODUCE EL DEFECTO: con la glosa en la celda de al lado, el número no entra', () => {
  // El layout viejo le daba al importe UNA columna de 95 px, porque la glosa ocupaba la de al lado.
  const unaColumna = ANCHOS.tiempo - PADDING_CELDA
  const medido = anchoEnPx('$839.552.440', { tamano: 12, negrita: true })
  assert.ok(medido > unaColumna,
    `"$839.552.440" mide ${Math.round(medido)} px y la columna daba ${unaColumna}: por eso el PDF mostraba "$839.552.44("`)
  // Y el control lo dice con la magnitud, no con un booleano.
  const r = auditarHero({
    slots: [0, 3, 7, 11],
    cols: 14,
    // El ancho de UN slot cuando la celda de al lado está ocupada: se corta en su propia columna.
    anchoCol: anchoCol(14),
    piezas: [{ slot: 1, pieza: 'valor', texto: '$839.552.440', tamano: 12, negrita: true }],
  })
  // Con el layout NUEVO el mismo importe entra: el slot 1 son cuatro columnas de 95.
  assert.equal(r.ok, true, 'con el bloque entero detrás, la cifra de nueve dígitos entra holgada')
  assert.ok(r.medidas[0].disponiblePx >= 374, JSON.stringify(r.medidas[0]))
})

test('EL CONTROL PUEDE DAR ROJO: un slot angosto lo pone en rojo con los píxeles que faltan', () => {
  const r = auditarHero({
    slots: [0, 1, 2, 3],
    cols: 4,
    anchoCol: () => ANCHOS.tiempo, // cada slot, una sola columna de 95 px: el layout viejo
    piezas: [{ slot: 1, pieza: 'valor', texto: IMPORTE_MAS_LARGO, tamano: 12, negrita: true }],
  })
  assert.equal(r.ok, false, 'un control que no puede decir que no es una constante disfrazada')
  assert.equal(r.desbordes.length, 1)
  assert.equal(r.desbordes[0].disponiblePx, 89)
  assert.ok(r.desbordes[0].sobraPx > 50, `faltaban ${r.desbordes[0].sobraPx} px y el control tiene que decirlo`)
})

test('EL MENSUAL: el titular entero entra, con un importe de diez dígitos y el paréntesis del negativo', () => {
  const { filas, meta } = grillaMeses({ anio: 2026, refs: { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', caja: 'CAJA' } })
  const cols = meta.footprint.cols
  const r = auditarHero({ slots: meta.hero.slots, cols, anchoCol: anchoCol(cols), piezas: piezasDe(meta, filas) })
  assert.equal(r.ok, true, JSON.stringify(r.desbordes, null, 2))
  // TODAS las piezas del Mensual se miden: cuatro rótulos y cuatro glosas, tres de ellas con importe.
  exigirDeclaracion(meta, filas, { sinMedir: [] })
  // Y la glosa vive una fila DEBAJO del número, no al lado: es lo que le devuelve el ancho al importe.
  assert.equal(meta.hero.nota, FILA.heroNota)
  assert.equal(meta.hero.nota, meta.hero.valor + 1)
  assert.equal(meta.hero.nota, meta.cab.fila - 1, 'la glosa ocupa la fila que antes era el aire')
  // Ninguna celda a la derecha del número está ocupada en su propia fila: sin eso, el desborde no sirve.
  for (const s of meta.hero.slots) {
    assert.equal((filas[meta.hero.valor - 1] || [])[s + 1] ?? '', '',
      `la celda a la derecha del importe del slot ${s + 1} volvió a ocuparse: el número se corta otra vez`)
  }
})

test('EL SEMANAL: el mismo titular, la misma medida — las dos vistas comparten la geometría', () => {
  const { filas, meta } = grillaSemanal({
    hoy: new Date('2026-08-13T00:00:00Z'), anio: 2026,
    refs: { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA', caja: 'CAJA' },
  })
  const cols = meta.footprint.cols
  const r = auditarHero({ slots: meta.hero.slots, cols, anchoCol: anchoCol(cols), piezas: piezasDe(meta, filas) })
  assert.equal(r.ok, true, JSON.stringify(r.desbordes, null, 2))
  // EL LÍMITE DECLARADO DEL SEMANAL: las glosas 2, 3 y 4 terminan en una fecha o en un nombre que sale
  // del libro y no tiene tope conocido; medirlas con una muestra inventada mediría una ficción. Están
  // enumeradas para que se vea qué NO se mide — y para que una cuarta sin medir ponga esto en rojo.
  exigirDeclaracion(meta, filas, { sinMedir: [2, 3, 4] })
  assert.equal(meta.hero.nota, FILA.heroNota)
  for (const s of meta.hero.slots) {
    assert.equal((filas[meta.hero.valor - 1] || [])[s + 1] ?? '', '', `slot ${s + 1}: la celda de al lado se ocupó`)
  }
})

test('EL SLOT MÁS ANGOSTO MANDA: la glosa de la liquidez total se mide contra sus 294 px', () => {
  const cols = 14
  // El último slot (L+M+N = 300 px menos el padding) es el más chico de la pestaña, y es el que le
  // tocó a LIQUIDEZ TOTAL AL 31/12, cuya glosa lleva un importe adentro ("incluye $ … en Balanz").
  assert.equal(anchoDeSlot([0, 3, 7, 11], 3, anchoCol(cols), cols), 294)
  const { meta } = grillaMeses({ anio: 2026, refs: { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', caja: 'CAJA' } })
  const nota = meta.hero.piezas.find((p) => p.slot === 3 && p.pieza === 'nota')
  assert.ok(nota, 'el generador dejó de declarar la glosa de la última tarjeta: sin muestra no se mide')
  const r = auditarHero({
    slots: [0, 3, 7, 11],
    cols,
    anchoCol: anchoCol(cols),
    piezas: [{ ...nota, tamano: CUERPO.nota }],
  })
  assert.equal(r.ok, true, JSON.stringify(r.desbordes))

  // Y EL CONTROL PUEDE DAR ROJO: la misma glosa con la palabra que NO entró. "todavía por pagar" mide
  // 377 px contra los 374 del slot de SALE EN EL AÑO — se probó y se descartó por eso, no por gusto.
  const largo = auditarHero({
    slots: [0, 3, 7, 11],
    cols,
    anchoCol: anchoCol(cols),
    piezas: [{ slot: 1, pieza: 'nota', texto: '$ 1.234.567.890 ya pagado · $ 1.234.567.890 todavía por pagar', tamano: CUERPO.nota }],
  })
  assert.equal(largo.ok, false, 'un control que no puede decir que no es una constante disfrazada')
  assert.ok(largo.desbordes[0].sobraPx > 0, JSON.stringify(largo.desbordes[0]))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL VALOR — la única pieza que nunca había entrado al medidor, y la que se cortó en el PDF real
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO DEL RENDER: el peor caso NO entra en una columna, y por eso la celda se mergea', () => {
  // Lo que el dueño vio en la pestaña aplicada: tres de los cuatro valores cortados un carácter.
  // `($31.332.233)` se dibujó `($31.332.233`. Con `OVERFLOW_CELL` y la celda de al lado vacía. En
  // pantalla desborda; en el PDF que exporta Google, no. El dato en la celda estaba entero.
  const unaColumna = ANCHOS.tiempo - PADDING_CELDA
  const peorCaso = anchoEnPx(IMPORTE_MAS_LARGO, { tamano: 12, negrita: true })
  assert.ok(peorCaso > unaColumna,
    `"${IMPORTE_MAS_LARGO}" mide ${Math.round(peorCaso)} px y una columna da ${unaColumna}: sin merge se corta`)
  // Y el corte medido en el render cae donde la columna termina, no donde el slot termina: si el
  // desborde se dibujara, `($31.332.233)` (119 px) habría entrado en los 374 del slot.
  assert.ok(anchoEnPx('($31.332.233)', { tamano: 12, negrita: true }) > unaColumna, 'el caso real ya no reproduce el corte')

  // LA CELDA MERGEADA SÍ LO BANCA, en las dos vistas y en los cuatro slots.
  for (const meta of [
    grillaMeses({ anio: 2026, refs: {} }).meta,
    grillaSemanal({ hoy: new Date('2026-08-13T00:00:00Z'), anio: 2026, refs: {} }).meta,
  ]) {
    const cols = meta.footprint.cols
    const merges = mergesDelValor(meta)
    // TODOS MENOS EL QUE CRUZA LA COLUMNA CONGELADA. Ése no se puede mergear —la API devuelve 400 y
    // se lleva puesto el formato entero de la pestaña— y desde el 31/08 la piel lo saltea a propósito.
    assert.deepEqual(merges, spansDelHero(meta.hero.slots, cols)
      .filter((x) => x.hasta - x.desde > 1 && !(x.desde < 1 && x.hasta > 1)),
      `${meta.pestana}: los merges del valor no cubren los slots`)
    const r = auditarHero({
      slots: meta.hero.slots,
      cols,
      anchoCol: anchoCol(cols),
      piezas: meta.hero.slots.map((_, i) => ({ slot: i, pieza: 'valor', texto: IMPORTE_MAS_LARGO, tamano: 12, negrita: true })),
    })
    assert.equal(r.ok, true, `${meta.pestana}: ${JSON.stringify(r.desbordes)}`)
    // El slot más angosto de la pestaña sigue sobrando: no entra por un pelo.
    const menor = Math.min(...r.medidas.map((m) => m.disponiblePx - m.anchoPx))
    assert.ok(menor > 100, `el peor caso entra por ${menor} px: demasiado justo para un render que ya mintió`)
  }
})

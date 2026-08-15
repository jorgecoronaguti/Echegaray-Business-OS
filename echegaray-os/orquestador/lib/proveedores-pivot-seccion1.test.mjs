// LAS DOS TRAMPAS DE UNA DINÁMICA POR API, Y EL HUECO.
//
// Las dos primeras ya costaron una dinámica vacía en el archivo real (04/08/2026): una tabla
// perfectamente formada, con encabezados y "Suma total", y CERO filas entre medio. Ni error, ni
// #REF!, ni aviso. Un test barato evita volver a descubrirlo mirando la pantalla.
import test from 'node:test'
import assert from 'node:assert/strict'
import { MONEDA_CUERPO } from './formato-statement.mjs'
import {
  anchoDelPivot, altoEmitido, bandasDeFormato, cabeEnElHueco, camposDeFila, COL, filtros,
  filtrosPorCondicion, fuenteCompras, clavesRepetidas, formatoDeLaFecha, formatoDeTodo,
  formatoDelImporte, geometriaDeLaSeccion, nivelesConSubtotal,
  celdasVacias, deudaSinNombre, diasDePago, letraDeLaDeuda,
  pivotSeccion1, proveedoresQueAgrupan,
  reapuntarControl, rotulosDelCuadro, VISTA,
} from './proveedores-pivot-seccion1.mjs'

const fuente = fuenteCompras({ sheetId: 7, filas: 900 })

test('TRAMPA 1 · ni un filtro por condición: vaciarían la dinámica en silencio', () => {
  assert.deepEqual(filtrosPorCondicion(pivotSeccion1(fuente)), [])
  for (const f of filtros()) {
    assert.ok(f.filterCriteria.visibleValues, `el filtro de la columna ${f.columnOffsetIndex} no usa visibleValues`)
  }
})

test('TRAMPA 1b · los valores visibles van como TEXTO aunque la columna sea numérica', () => {
  const comercial = filtros().find((f) => f.columnOffsetIndex === COL.comercial)
  assert.deepEqual(comercial.filterCriteria.visibleValues, ['1'])
  assert.equal(typeof comercial.filterCriteria.visibleValues[0], 'string')
})

test('TRAMPA 2 · ningún nivel pide un subtotal que la API no emite', () => {
  assert.deepEqual(nivelesConSubtotal(pivotSeccion1(fuente)), [])
})

test('el source arranca en la fila de rótulos, no en la primera factura', () => {
  // startRowIndex 2 = fila 3. Arrancar en la 4 haría que el pivot tome una factura como encabezado.
  assert.equal(fuente.startRowIndex, 2)
  assert.equal(fuente.endRowIndex, 900, 'un source sin techo recorre la hoja entera en cada recálculo')
})

test('el source se niega si no sabe cuántas filas tiene Compras', () => {
  assert.throws(() => fuenteCompras({ sheetId: 7, filas: 0 }), /no puede tener 0 filas/)
  assert.throws(() => fuenteCompras({ filas: 900 }), /falta el sheetId/)
})

test('por defecto: una línea por PROVEEDOR · se le debe, y nada más', () => {
  const p = pivotSeccion1(fuente)
  assert.deepEqual(p.rows.map((r) => r.sourceColumnOffset), [COL.proveedor])
  assert.equal(p.values[0].sourceColumnOffset, COL.saldo)
  // 1 campo de fila + 1 valor = 2 columnas: A y B. La C y la D quedan para "Vence" y "Qué hacer",
  // que son fórmulas ancladas al nombre. Un valor de más las empujaría sobre la H, que es del dueño.
  assert.equal(anchoDelPivot(p), 2)
})

test('la vista DETALLE sigue existiendo, con sus agujeros declarados', () => {
  const p = pivotSeccion1(fuente, { vista: VISTA.DETALLE })
  assert.deepEqual(p.rows.map((r) => r.sourceColumnOffset),
    // El comprobante sigue en el detalle: sin el número de factura el cuadro no sirve para pagar.
    // "Categoría" (B/N) se fue el 14/08: no contesta a quién, cuánto ni cómo se paga, y su columna
    // es la que deja lugar a "Qué hacer" — la nota del dueño, al lado del pago que decide.
    [COL.proveedor, COL.proximoPago, COL.comprobante, COL.obra, COL.tipoPago])
  assert.ok(!p.rows.some((r) => r.sourceColumnOffset === COL.categoria))
  assert.equal(anchoDelPivot(p), 6)
})

// ═══ EL DEFECTO QUE ESTOS TRES ATRAPAN (14/08, segunda vuelta) ═══
//
// El eje del cuadro que abre la sección se movió del proveedor a la fecha de pago y el dueño lo
// rechazó el mismo día: *"roto proveedores … LA BASE SIEMPRE ES EL NOMBRE DEL PROVEEDOR"*. Con la
// fecha al frente se perdieron el ranking "a quién le debo más" y las doce notas del dueño, que
// vivían ancladas a un NOMBRE en la columna A. Si alguien vuelve a poner la fecha al frente del
// cuadro que abre la sección, estos tests se ponen rojos antes de que la pestaña lo haga.
test('EL EJE ES EL PROVEEDOR: el cuadro que abre la sección abre por el NOMBRE, y ordena por la plata', () => {
  const p = pivotSeccion1(fuente)
  assert.equal(p.rows[0].sourceColumnOffset, COL.proveedor, 'el cuadro que abre la sección no abre por el proveedor')
  assert.equal(p.rows.length, 1, 'con un solo nivel no hay nivel que agrupe: cada fila lleva su nombre')
  assert.equal(p.rows[0].sortOrder, 'DESCENDING', 'a quién le debemos más, arriba')
  assert.deepEqual(p.rows[0].valueBucket, { valuesIndex: 0 },
    'sin valueBucket el orden es alfabético y "a quién le debo más" hay que buscarlo a ojo')
})

// EL DUEÑO, 15/08, mirando la pestaña: "roto, eso está al revés de como lo pido". Su regla no admite
// lectura: LA BASE SIEMPRE ES EL NOMBRE DEL PROVEEDOR. Con el día de eje, un mismo proveedor quedaba
// repartido en cinco grupos de fecha. El corte por día no se pierde: lo da entero "2 · QUÉ SALE CADA
// DÍA", que no existía cuando se puso la fecha de eje.
test('LA BASE ES EL PROVEEDOR: el detalle abre por proveedor y la fecha es su segundo nivel', () => {
  const p = pivotSeccion1(fuente, { vista: VISTA.DETALLE })
  assert.equal(p.rows[0].sourceColumnOffset, COL.proveedor, 'el detalle no abre por el nombre del proveedor')
  assert.equal(p.rows[1].sourceColumnOffset, COL.proximoPago, 'la fecha tiene que quedar DENTRO del proveedor')
  assert.equal(p.rows[1].sortOrder, 'ASCENDING',
    'los vencimientos de un proveedor se leen del más próximo al más lejano')
  assert.equal(p.rows[0].valueBucket, undefined,
    'el ranking por plata es del cuadro A; acá el detalle se lee alfabético para encontrar un nombre')
})

test('NO EXISTE UNA VISTA "POR DÍA": el total del día lo dan el aging y el agrupamiento del detalle', () => {
  assert.deepEqual(Object.values(VISTA).sort(), ['detalle', 'por-proveedor'],
    'un tercer cuadro para el mismo dato es lo que la regla de minimalismo de la pestaña prohíbe')
})

test('EL PROVEEDOR ABIERTO contesta las tres cosas: a qui\u00e9n, por qu\u00e9 comprobante y CON QU\u00c9 MEDIO', () => {
  const p = pivotSeccion1(fuente, { vista: VISTA.DETALLE })
  const campos = p.rows.map((r) => r.sourceColumnOffset)
  for (const [q, col] of [['a qui\u00e9n', COL.proveedor], ['por qu\u00e9 comprobante', COL.comprobante],
    ['con qu\u00e9 medio', COL.tipoPago], ['para qu\u00e9 obra', COL.obra]]) {
    assert.ok(campos.includes(col), `sin "${q}" hay que abrir Compras, que es lo que esto viene a evitar`)
  }
  // El orden de lectura es la pregunta: A QUI\u00c9N \u00b7 CU\u00c1NDO \u00b7 POR QU\u00c9 \u00b7 C\u00d3MO.
  assert.ok(campos.indexOf(COL.proveedor) < campos.indexOf(COL.proximoPago))
  assert.ok(campos.indexOf(COL.proveedor) < campos.indexOf(COL.comprobante))
  assert.ok(campos.indexOf(COL.comprobante) < campos.indexOf(COL.tipoPago))
})

test('NING\u00daN NIVEL PIDE SUBTOTAL: la API no los emite', () => {
  for (const vista of [VISTA.POR_PROVEEDOR, VISTA.DETALLE]) {
    assert.deepEqual(nivelesConSubtotal(pivotSeccion1(fuente, { vista })), [],
      'pedir showTotals no da error \u2014 no hace nada, y deja creyendo que el total del d\u00eda est\u00e1')
  }
})

test('LOS D\u00cdAS DE PAGO se cuentan por el valor CRUDO, y lo que no es una fecha se declara', () => {
  const fila = (fecha, saldo) => { const f = []; f[COL.proximoPago] = fecha; f[COL.saldo] = saldo; return f }
  // Dos facturas el mismo d\u00eda son UN grupo: reservar alto por factura deja filas de m\u00e1s.
  assert.equal(diasDePago([fila(46248, 100), fila(46248, 200), fila(46250, 50)]).dias, 3 - 1)
  // Una fila con "Pendiente" donde va la fecha entra igual y arma su propio grupo \u2014 se declara con
  // su plata, porque es un pago que nadie ve venir en el calendario.
  const r = diasDePago([fila(46248, 100), fila('Pendiente', 900), fila('Pendiente', 100)])
  assert.equal(r.dias, 2)
  assert.deepEqual(r.sinFecha, [{ valor: 'Pendiente', filas: 2, saldo: 1000 }])
  assert.deepEqual(diasDePago([fila('', 5)]).sinFecha, [{ valor: '(vac\u00edo)', filas: 1, saldo: 5 }])
})

test('se sabe ANTES de escribir cuántas filas quedan sin rótulo, y de quién', () => {
  const fila = (prov) => { const f = []; f[COL.proveedor] = prov; return f }
  assert.deepEqual(proveedoresQueAgrupan([fila('A'), fila('B')]), [])
  assert.deepEqual(
    proveedoresQueAgrupan([fila('Corralon'), fila('Corralon'), fila('Corralon'), fila('Alumetal'), fila('Alumetal'), fila('RSV')]),
    [{ proveedor: 'Corralon', filas: 3, sinRotulo: 2 }, { proveedor: 'Alumetal', filas: 2, sinRotulo: 1 }])
})

test('EL CUADRO DEL EJE no deja una sola celda sin rótulo, y no tiene columna de fecha', () => {
  const p = pivotSeccion1(fuente, { vista: VISTA.POR_PROVEEDOR })
  assert.equal(p.rows.length, 1, 'con un solo nivel no hay nivel que agrupe: cada fila lleva su nombre')
  // El vencimiento NO es una columna del pivot: es una fórmula a su derecha. Pedir el formato de una
  // columna que no existe devolvería índice -1 y formatearía la de al lado.
  assert.equal(formatoDeLaFecha({ sheetId: 3, filaAncla: 17, alto: 15, vista: VISTA.POR_PROVEEDOR }), null)
})

test('avisa cuando dos facturas comparten comprobante: ahí vuelven los blancos', () => {
  const fila = (comprobante) => { const f = []; f[COL.comprobante] = comprobante; return f }
  assert.deepEqual(clavesRepetidas([fila('A-1'), fila('A-2'), fila('A-3')]), [])
  assert.deepEqual(clavesRepetidas([fila('A-1'), fila('A-1'), fila('A-2')]), [{ clave: 'A-1', veces: 2 }])
  // Hoy hay UNA factura sin número (La Isla Metal): con una no se agrupa nada, con dos sí.
  assert.deepEqual(clavesRepetidas([fila(''), fila('A-2')]), [])
  assert.deepEqual(clavesRepetidas([fila(''), fila('')]), [{ clave: '(sin número)', veces: 2 }])
})

test('EL HUECO · si no entra hasta la sección 2, se dice ANTES de escribir', () => {
  // Encabezado en la 17, sección 2 en la 38 → 21 filas. 13 facturas piden 15 (rótulo + 13 + total).
  const ok = cabeEnElHueco({ facturas: 13, filaAncla: 17, filaLimite: 38 })
  assert.equal(ok.cabe, true)
  assert.equal(ok.alto, 15)
  assert.equal(ok.holgura, 6)

  const no = cabeEnElHueco({ facturas: 40, filaAncla: 17, filaLimite: 38 })
  assert.equal(no.cabe, false)
  assert.match(no.motivo, /necesita 42 filas y hay 21 libres/)
})

test('el límite exacto entra, uno más no', () => {
  assert.equal(cabeEnElHueco({ facturas: 19, filaAncla: 17, filaLimite: 38 }).cabe, true)
  assert.equal(cabeEnElHueco({ facturas: 20, filaAncla: 17, filaLimite: 38 }).cabe, false)
})

test('EL CONTROL se reapunta a la columna del importe, y sólo eso', () => {
  const viejo = '=LET(dif;ROUND((SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")-SUM($D$18:$D$37));0);'
    + 'IF(dif=0;"✓ cierra";"⚠ falta "&TEXT(dif;"$#,##0")))'
  const nuevo = reapuntarControl(viejo, 'G', { filaEncabezado: 17, filaLimite: 38 })

  assert.ok(nuevo.includes('SUM($G$18:$G$37)'), 'no reapuntó el SUM del bloque propio')
  assert.ok(!nuevo.includes('SUM($D$18:$D$37)'), 'dejó la columna vieja')
  // Lo de Compras no se toca: reescribir lo que no cambió es cómo se rompe una fórmula sana.
  assert.ok(nuevo.includes('SUMIFS(Compras!$O$4:$O;Compras!$X$4:$X;"Pendiente")'), 'tocó los SUMIFS de Compras')
  assert.ok(nuevo.includes('"⚠ falta "'), 'tocó el texto del mensaje')
})

test('un control que ya apunta bien queda idéntico', () => {
  const ya = '=SUM($G$18:$G$37)'
  assert.equal(reapuntarControl(ya, 'G', { filaEncabezado: 17, filaLimite: 38 }), ya)
})

test('un control vacío no se inventa', () => {
  assert.equal(reapuntarControl('', 'G', { filaEncabezado: 17, filaLimite: 38 }), '')
  assert.equal(reapuntarControl(null, 'G', { filaEncabezado: 17, filaLimite: 38 }), '')
})

test('LA FECHA lleva formato de fecha, y su columna se calcula del orden real', () => {
  const f = formatoDeLaFecha({ sheetId: 3, filaAncla: 17, alto: 15, vista: VISTA.DETALLE })
  // proximoPago es el 3er campo de fila → columna C (índice 2). Si cambia el orden, cambia sola.
  const esperada = camposDeFila({ vista: VISTA.DETALLE }).findIndex((r) => r.sourceColumnOffset === COL.proximoPago)
  assert.equal(f.repeatCell.range.startColumnIndex, esperada)
  assert.equal(f.repeatCell.cell.userEnteredFormat.numberFormat.type, 'DATE')
  assert.equal(f.repeatCell.cell.userEnteredFormat.numberFormat.pattern, 'dd/mm/yyyy',
    'sin patrón dd/mm/yyyy la fecha sale como 46238, el número de serie crudo')
})

test('la DEUDA se formatea como plata, y no en la columna de la cantidad de facturas', () => {
  const imp = formatoDelImporte({ sheetId: 3, filaAncla: 17, alto: 15, ancho: 3 })
  assert.equal(imp.repeatCell.range.startColumnIndex, 1, 'la deuda es el PRIMER valor: columna B')
  assert.equal(imp.repeatCell.cell.userEnteredFormat.numberFormat.type, 'CURRENCY')
})

test('el cuerpo de la tabla NO repite el "$": estas dinámicas no emiten fila de total', () => {
  for (const vista of [VISTA.POR_PROVEEDOR, VISTA.DETALLE]) {
    for (const p of formatoDeTodo({ sheetId: 3, filaAncla: 17, alto: 15, vista })) {
      const nf = p.repeatCell.cell.userEnteredFormat.numberFormat
      if (nf.type !== 'CURRENCY') continue
      assert.equal(nf.pattern, MONEDA_CUERPO.pattern,
        'un "$" repetido en ochenta filas deja de informar; la unidad la declara el titular de arriba')
      assert.ok(nf.pattern.includes('('), 'el negativo va entre paréntesis (AICPA/FASB/IFRS/SEC)')
      assert.ok(nf.pattern.includes('—'), 'el cero se escribe en raya, no como "$0"')
    }
  }
})

test('en la vista detalle el importe y la fecha NO caen en la misma columna', () => {
  const imp = formatoDelImporte({ sheetId: 3, filaAncla: 17, alto: 15, ancho: 7, vista: VISTA.DETALLE })
  const fec = formatoDeLaFecha({ sheetId: 3, filaAncla: 17, alto: 15, vista: VISTA.DETALLE })
  assert.notEqual(imp.repeatCell.range.startColumnIndex, fec.repeatCell.range.startColumnIndex)
})

test('LA GEOMETRÍA encuentra los rótulos con el proveedor en cualquier columna', () => {
  const conPivot = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ cierra'],
    ['N° Comprobante', 'Proveedor', 'Fecha prevista de pago (día)', 'Cliente / Asignación', 'Tipo pago'],
    [], [], ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  const g = geometriaDeLaSeccion(conPivot)
  assert.equal(g.filaEncabezado, 4, 'no encontró la fila de rótulos con el comprobante primero')
  assert.equal(g.filaLimite, 7)
})

test('la misma geometría sirve para el bloque de fórmulas viejo', () => {
  const conBloque = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ cierra'],
    ['Proveedor / factura', 'Próximo pago', 'Comprobante', 'Importe', 'Obra'],
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  assert.equal(geometriaDeLaSeccion(conBloque).filaEncabezado, 4)
})

test('sin el título de la sección que sigue no hay plan: no se escribe a ciegas', () => {
  const sinLimite = [['1 · QUÉ SE DEBE Y CUÁNDO'], ['Proveedor', 'a', 'b', 'c']]
  assert.throws(() => geometriaDeLaSeccion(sinLimite), /sección que sigue/)
})

test('el límite es la sección que SIGUE, no "la 2": intercalar una sección no frena la sección 1', () => {
  // Estaba anclado a `/^2 ·/`. El día que se intercaló "2 · QUÉ SALE CADA DÍA", la cuenta corriente
  // pasó a ser la 3 y esta búsqueda dejaba de encontrar su límite: la sección 1 entera se frenaba.
  const conTres = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ cierra'],
    ['Proveedor', 'Se le debe', 'Vence', 'Qué hacer'], ['Hormiserv', '1', '2', '3'],
    ['3 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  assert.equal(geometriaDeLaSeccion(conTres).filaLimite, 6)
})

test('SIN AGUJEROS · el valor es un SUM, que nunca puede quedar vacío', () => {
  const p = pivotSeccion1(fuente)
  assert.deepEqual(p.values.map((v) => v.summarizeFunction), ['SUM'])
  // La fecha NO entra: como valor sólo podría ser MIN, y dos proveedores tienen la palabra
  // "Pendiente" donde va la fecha — MIN no encuentra número y la celda sale vacía.
  assert.ok(!p.values.some((v) => v.sourceColumnOffset === COL.proximoPago),
    'la fecha como valor deja huecos donde el origen dice "Pendiente"')
})

test('el detector de agujeros los encuentra, y no confunde una fila de más con un hueco', () => {
  const bloque = [['Proveedor', 'Deuda', 'Facturas'], ['Alumetal', '$1', '2'], ['', '$2', '1'], []]
  assert.deepEqual(celdasVacias(bloque, 3, 17), ['A19'])
  assert.deepEqual(celdasVacias([['A', 'B', 'C'], []], 3, 17), [], 'una fila entera vacía es el fin del bloque')
})

test('el origen llega al final de la GRILLA: una compra nueva entra sola', () => {
  const f = fuenteCompras({ sheetId: 7, filas: 2000 })
  assert.equal(f.endRowIndex, 2000,
    'si el origen se corta en la última factura cargada, la de mañana queda afuera en silencio')
})

test('EL CONTROL suma la columna de la DEUDA, no la de los conteos', () => {
  // Con dos valores, `ancho - 1` es la cantidad de facturas: el control sumaba 13 contra un titular
  // de $15.716.930 y daba cualquier cosa. La deuda es el primer valor.
  assert.equal(letraDeLaDeuda(), 'B')
  // Detalle: 5 campos de fila (A..E) y el importe en la F. La G queda para "Qué hacer".
  assert.equal(letraDeLaDeuda({ vista: VISTA.DETALLE }), 'F')
})

test('UN VALOR POR CUADRO, Y ES PLATA: el formato del cuerpo declara uno solo', () => {
  // `formatoDeTodo` declara UNA columna de moneda después de los campos de fila. Si mañana alguien
  // agrega un segundo valor que no sea plata (un conteo, un promedio), saldría con formato de moneda
  // y nadie se enteraría — es el `67797,51 | 31/12/1899` de siempre, un paso más adelante. La lib
  // tira un error explícito; este test se pone rojo antes, en el pivot.
  for (const vista of [VISTA.POR_PROVEEDOR, VISTA.DETALLE]) {
    const p = pivotSeccion1(fuente, { vista })
    assert.equal(p.values.length, 1, `la vista ${vista} tiene ${p.values.length} valores y el formato declara uno`)
    assert.equal(p.values[0].sourceColumnOffset, COL.saldo, 'el único valor tiene que ser el saldo')
  }
})

test('SIN FACTURA sí entra · SIN NOMBRE es el que rompe, y se avisa', () => {
  const fila = (prov, comp, saldo) => { const f = []; f[COL.proveedor] = prov; f[COL.comprobante] = comp; f[COL.saldo] = saldo; return f }
  // La Isla Metal SRL: $100.000 y ningún número de comprobante. Tiene que entrar, y entra.
  assert.deepEqual(deudaSinNombre([fila('La Isla Metal SRL', '', 100000)]), [])
  // Lo que rompe el cuadro es la falta de NOMBRE: ahí el pivot arma un grupo sin rótulo.
  assert.deepEqual(deudaSinNombre([fila('', '0001-0002', 5000)]), [{ comprobante: '0001-0002', saldo: 5000 }])
  assert.deepEqual(deudaSinNombre([fila('', '', 7000)]), [{ comprobante: '(sin número)', saldo: 7000 }])
})

/** ¿Esta fila (índice base 0) entra en la banda de formato? */
const cubre = (banda, fila) => fila >= banda.desde && fila < banda.desde + banda.alto

test('EL DERRAME · la fila que la dinámica emite de más se queda con el formato de antes', () => {
  // 04/08/2026: el cuadro A pasó de 9 a 10 proveedores y la última fila salió
  //   RSV | 67797,51 | 31/12/1899
  // el importe pelado (formato TEXTO de la columna B del cuadro B) y el contador como FECHA (su
  // columna C). El alto se había estimado con 9 proveedores, así que la 10ª fila quedó fuera del
  // repeatCell y heredó lo que la corrida anterior había dejado ahí.
  const p = bandasDeFormato({ filaEncabezado: 17, filaLimite: 80, gruposA: 9, facturas: 31 })
  const bandaVieja = { desde: p.iA, alto: p.altoA }   // el alto ESTIMADO de la corrida
  const decima = p.iA + 10                            // rótulo + 10 grupos: la fila que salió sin formato
  assert.equal(cubre(bandaVieja, decima), false, 'así salió RSV: fuera del rango de formato')
  assert.equal(cubre(p.bandaA, decima), true, 'la banda sigue midiéndose por la corrida, no por el footprint')
})

test('el formato del cuadro A cubre el gran total del pie y la deriva del conteo', () => {
  const p = bandasDeFormato({ filaEncabezado: 17, filaLimite: 80, gruposA: 10, facturas: 31 })
  // 0 = la última fila estimada · 1 = el gran total que agrega el pivot · 2 = un grupo de más
  // (el script cuenta con trim(), el pivot agrupa por el valor crudo: "RSV" y "RSV " son dos).
  for (const demas of [0, 1, 2]) {
    assert.equal(cubre(p.bandaA, p.iA + p.altoA - 1 + demas), true, `la fila ${demas} de más quedó sin formato`)
  }
  assert.equal(cubre(p.bandaA, p.iB), false, 'la banda de A se comió el rótulo del cuadro B')
})

test('EL FOOTPRINT ENTERO LLEVA FORMATO: las dos bandas no dejan una fila suelta', () => {
  for (const proveedores of [1, 9, 10, 25]) {
    for (const facturas of [proveedores, 31, 90]) {
      const filaEncabezado = 17
      const filaLimite = filaEncabezado + proveedores + facturas + 5 + 12 // + colchón
      const p = bandasDeFormato({ filaEncabezado, filaLimite, gruposA: proveedores, facturas })
      assert.equal(p.bandaA.desde, p.iA, 'el rótulo del cuadro A quedó afuera de la banda')
      assert.equal(p.bandaA.desde + p.bandaA.alto, p.bandaB.desde,
        `queda una fila sin banda entre los dos cuadros (${proveedores} prov · ${facturas} fact)`)
      assert.equal(p.bandaB.desde + p.bandaB.alto, p.finIdx,
        'el colchón queda sin formato: la factura de mañana hereda lo que hubiera ahí')
      assert.equal(p.necesita, proveedores + facturas + 5, 'cambió lo que el bloque reserva')
    }
  }
})

// ═══ EL DEFECTO: LA BANDA DEL CUERPO SE COMÍA LA FILA DE RÓTULOS (05/08) ═══
//
// `auditar-pantalla.mjs` sobre el archivo real: B17 "Se le debe", C17 "Facturas", G32 "Importe" —
// tres `texto_en_numero` que producía este mismo generador en cada corrida, porque el formato del
// cuerpo (moneda, contador) arrancaba en la fila del rótulo. El rótulo no es cuerpo.
test('el CUERPO arranca debajo del rótulo, y el rótulo tiene su propia fila', () => {
  for (const proveedores of [1, 10, 25]) {
    for (const facturas of [proveedores, 31, 90]) {
      const filaEncabezado = 17
      const filaLimite = filaEncabezado + proveedores + facturas + 5 + 12
      const p = bandasDeFormato({ filaEncabezado, filaLimite, gruposA: proveedores, facturas })
      assert.equal(p.rotuloA, p.iA + 1, 'la fila de rótulos del cuadro A, en base 1')
      assert.equal(p.rotuloB, p.iB + 1)
      assert.equal(p.cuerpoA.desde, p.iA + 1, 'el cuerpo de A empieza DESPUÉS del rótulo')
      assert.equal(p.cuerpoB.desde, p.iB + 1)
      // Rótulo + cuerpo teselan la banda entera: ni una fila del footprint se queda sin formato.
      assert.equal(p.cuerpoA.desde + p.cuerpoA.alto, p.bandaA.desde + p.bandaA.alto)
      assert.equal(p.cuerpoB.desde + p.cuerpoB.alto, p.finIdx)
    }
  }
  // Un bloque que todavía no entra no puede pedir un rango de alto negativo.
  const apretado = bandasDeFormato({ filaEncabezado: 17, filaLimite: 18, gruposA: 9, facturas: 40 })
  assert.ok(apretado.cuerpoA.alto >= 0 && apretado.cuerpoB.alto >= 0)
})

test('los rótulos que va a emitir la dinámica se saben ANTES de escribir', () => {
  const cabecera = []
  cabecera[COL.proveedor] = 'Proveedor'
  cabecera[COL.comprobante] = 'N° Comprobante'
  cabecera[COL.proximoPago] = 'Fecha prevista de pago (día)'
  cabecera[COL.obra] = 'Cliente / Asignación'
  cabecera[COL.tipoPago] = 'Tipo pago'
  cabecera[COL.categoria] = 'Categoría'
  assert.deepEqual(rotulosDelCuadro({ vista: VISTA.DETALLE, cabecera }),
    ['Proveedor', 'Fecha prevista de pago (día)', 'N° Comprobante', 'Cliente / Asignación', 'Tipo pago', 'Importe'])
  // Los `name` de los valores sí se pueden renombrar: son lo único que la API deja tocar.
  assert.deepEqual(rotulosDelCuadro({ vista: VISTA.POR_PROVEEDOR, cabecera, nombresDeValores: ['Se le debe'] }),
    ['Proveedor', 'Se le debe'])
  // Un rótulo por columna emitida, siempre: si no coinciden, el formato del rótulo se desalinea.
  for (const vista of [VISTA.DETALLE, VISTA.POR_PROVEEDOR]) {
    assert.equal(rotulosDelCuadro({ vista, cabecera }).length, anchoDelPivot(pivotSeccion1({ sheetId: 1, startRowIndex: 2, endRowIndex: 9, startColumnIndex: 0, endColumnIndex: 38 }, { vista })))
  }
})

test('la factura de mañana cae en una fila YA formateada', () => {
  const filaLimite = 80
  const hoy = bandasDeFormato({ filaEncabezado: 17, filaLimite, gruposA: 10, facturas: 31 })
  const manana = bandasDeFormato({ filaEncabezado: 17, filaLimite, gruposA: 10, facturas: 35 })
  const ultimaDeManana = manana.iB + manana.altoB - 1
  assert.equal(cubre(hoy.bandaB, ultimaDeManana), true,
    'el cuadro B crece dentro del colchón: si el colchón no lleva formato, la fila nueva sale cruda')
})

test('el bloque que todavía no entra no manda un repeatCell de alto 0', () => {
  const apretado = bandasDeFormato({ filaEncabezado: 17, filaLimite: 20, gruposA: 10, facturas: 31 })
  assert.equal(apretado.bandaB.alto, 0, 'un rango con start = end no se manda: primero se insertan filas')
  assert.ok(apretado.necesita > apretado.disponibles, 'no detectó que el bloque no entra')
})

test('CADA COLUMNA SE DECLARA EN CADA CORRIDA: 2 en el cuadro del eje, 6 en el detalle', () => {
  const pedidos = (vista) => formatoDeTodo({ sheetId: 3, filaAncla: 17, alto: 12, vista })
  const columnas = (vista) => pedidos(vista).map((p) => p.repeatCell.range.startColumnIndex)
  assert.deepEqual(columnas(VISTA.POR_PROVEEDOR), [0, 1], 'una columna sin declarar hereda el formato de antes')
  assert.deepEqual(columnas(VISTA.DETALLE), [0, 1, 2, 3, 4, 5])
  for (const vista of [VISTA.POR_PROVEEDOR, VISTA.DETALLE]) {
    for (const p of pedidos(vista)) {
      assert.ok(p.repeatCell.cell.userEnteredFormat.numberFormat.type, `columna ${p.repeatCell.range.startColumnIndex} sin numberFormat`)
      assert.equal(p.repeatCell.range.endColumnIndex, p.repeatCell.range.startColumnIndex + 1)
    }
  }
})

test('el tipo de cada columna es el que el dato pide, no el que la celda tenía', () => {
  const tipos = (vista) => formatoDeTodo({ sheetId: 3, filaAncla: 17, alto: 12, vista })
    .map((p) => p.repeatCell.cell.userEnteredFormat.numberFormat.type)
  assert.deepEqual(tipos(VISTA.POR_PROVEEDOR), ['TEXT', 'CURRENCY'],
    'el nombre es TEXTO: un proveedor que se llame "2024" saldría como fecha con el formato de antes')
  // El comprobante es TEXTO: como número, "826666" se veía 01/05/4163 con el formato de la vuelta anterior.
  // Con el proveedor de eje, la A es TEXTO y la fecha baja a la B — y sigue siendo DATE: es el mismo
  // mecanismo el que evita que un vencimiento se dibuje "$46.109", que es como se veía el sedimento.
  assert.deepEqual(tipos(VISTA.DETALLE), ['TEXT', 'DATE', 'TEXT', 'TEXT', 'TEXT', 'CURRENCY'])
})

test('ALTO EMITIDO · se cuenta lo que el archivo tiene, hasta la primera fila en blanco', () => {
  const bloque = [['Proveedor', 'Se le debe', 'Facturas'], ['Alumetal', '$5.174.285', '2'], ['RSV', '$67.798', '1'], [], ['Cada operación']]
  assert.equal(altoEmitido(bloque), 3, 'rótulo + dos proveedores')
  assert.equal(altoEmitido([['a'], ['b']]), 2, 'sin fila en blanco, es todo lo leído')
  assert.equal(altoEmitido([[' ', ''], ['b']]), 0, 'una fila de espacios es una fila vacía')
  assert.equal(altoEmitido([]), 0)
})

test('LA GEOMETRÍA engancha el PRIMER cuadro, aunque tenga sólo tres columnas', () => {
  // Exigiendo cuatro columnas se salteaba el cuadro de totales (proveedor · se le debe · facturas)
  // y enganchaba el de detalle: cada corrida escribía más abajo y duplicaba el cuadro entero.
  const conDos = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ cierra'],
    ['Proveedor', 'Se le debe', 'Facturas'],
    ['Alumetal', '$5.174.285', '2'], [],
    ['Cada operación'],
    ['Proveedor', 'N° Comprobante', 'Fecha', 'Obra', 'Tipo pago', 'Categoría', 'Importe'],
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  assert.equal(geometriaDeLaSeccion(conDos).filaEncabezado, 4, 'enganchó el segundo cuadro y va a duplicar')
})

test('si el cuadro dio #REF! la geometría se ubica por el título, no por su propia salida', () => {
  // El caso real: la fila de rótulos quedó como una sola celda "#REF!". Buscando "PROVEEDOR" con
  // dos columnas, la detección se enganchaba en el rótulo del cuadro de ABAJO y escribía un
  // segundo cuadro sin borrar el primero. Quedaron tres dinámicas donde tenía que haber dos.
  const filas = [
    ['Proveedores'], [], [], [],
    ['1 · QUÉ SE DEBE Y CUÁNDO'],           // fila 5
    [],                                      // 6
    ['✓ el detalle cierra con el titular'],  // 7
    ['#REF!'],                               // 8  ← acá va el cuadro A
    [], [], [],
    ['Cada operación'],
    ['Proveedor', 'N° Comprobante', 'Importe'], // 13 ← el señuelo
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'],     // 14
  ]
  const geo = geometriaDeLaSeccion(filas)
  assert.equal(geo.filaEncabezado, 8, 'se enganchó en el rótulo del cuadro de abajo')
  assert.equal(geo.porTitulo, true, 'tiene que declarar que se ubicó por el título')
  assert.equal(geo.filaLimite, 14)
})

test('cuando el cuadro está sano manda su propia fila de rótulos', () => {
  const filas = [
    ['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['✓ ok'],
    ['Proveedor', 'Se le debe', 'Facturas'],
    ['Alumetal', '$1', '1'],
    ['2 · CUENTA CORRIENTE POR PROVEEDOR'],
  ]
  const geo = geometriaDeLaSeccion(filas)
  assert.equal(geo.filaEncabezado, 4)
  assert.equal(geo.porTitulo, false)
})

test('el ancla por título nunca cae dentro de la sección 2', () => {
  const filas = [['1 · QUÉ SE DEBE Y CUÁNDO'], [], ['2 · CUENTA CORRIENTE POR PROVEEDOR']]
  assert.throws(() => geometriaDeLaSeccion(filas), /sección 2/)
})

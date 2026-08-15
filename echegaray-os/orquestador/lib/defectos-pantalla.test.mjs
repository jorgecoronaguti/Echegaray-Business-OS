import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectar, resumen, FECHA_CERO, esSerialCrudo, esRotuloDeColumna, esFilaDeRotulos } from './defectos-pantalla.mjs'

const cel = (valor, type) => ({ valor, formato: type ? { numberFormat: { type } } : null })
const hoja = (filas) => ({ filas, anchos: [] })

test('un texto en WRAP que no entra en el alto de la fila expone el alto que necesita', () => {
  // 36 caracteres a 10px ≈ 205px de ancho; la columna mide 100px → 3 líneas. La fila mide 21px, y
  // 3 líneas necesitan 3×(10+5)=45px. reparar-pantalla consume ese altoNecesario para subir la fila.
  const celWrap = { valor: 'una nota bastante larga que no entra ahí', formato: { textFormat: { fontSize: 10 }, wrapStrategy: 'WRAP' } }
  const f = { filas: [[celWrap]], anchos: [100], altos: [21] }
  const d = detectar(f).filter((x) => x.tipo === 'texto_apretado')
  assert.equal(d.length, 1)
  assert.equal(d[0].altoNecesario, 45)
})

test('la fecha cero se caza: 30/12/99 no es un día, es "no hay fecha"', () => {
  // Un MINIFS sin coincidencias devuelve 0, y 0 con formato de fecha se lee como 1899.
  const d = detectar(hoja([[cel('Proveedor'), cel('30/12/99', 'DATE')]]))
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'fecha_cero')
  assert.ok(FECHA_CERO.test('30/12/1899'))
})

test('una nota metida en una columna de importes se ve como un dato', () => {
  // La nota va DEBAJO de los importes, que es donde molesta: en el medio de la tabla se lee como
  // una fila más. Arriba de la columna sería el encabezado y es correcto — ver el test siguiente.
  const d = detectar(hoja([
    [cel('Concepto'), cel('Monto', 'CURRENCY')],
    [cel('Alquiler'), cel('$100.000', 'CURRENCY')],
    [cel('Resto'), cel('ninguno llega al 1% del total', 'CURRENCY')],
  ]))
  assert.equal(d[0].tipo, 'texto_en_numero')
  assert.equal(d[0].fila, 3)
})

test('el ENCABEZADO de una columna de importes no es un defecto', () => {
  // 1.107 de los 1.182 avisos del archivo eran esto: "IMPORTES" arriba de una columna de moneda.
  // Un detector que grita mil veces por cosas bien hechas entrena a no mirar la lista.
  const d = detectar(hoja([
    [cel('Concepto'), cel('IMPORTES', 'CURRENCY')],
    [cel('Alquiler'), cel('$100.000', 'CURRENCY')],
  ]))
  assert.deepEqual(d.filter((x) => x.tipo === 'texto_en_numero'), [])
})

test('el guion del formato de número NO es texto pegado a mano', () => {
  // "—" es cómo el patrón muestra el cero. Marcarlo llenaría el control de ruido.
  assert.deepEqual(detectar(hoja([[cel('x'), cel('—', 'CURRENCY')]])), [])
})

test('un importe formateado no se confunde con texto', () => {
  assert.deepEqual(detectar(hoja([[cel('x'), cel('$1.234.567', 'CURRENCY')]])), [])
  assert.deepEqual(detectar(hoja([[cel('x'), cel('7 d', 'NUMBER')]])), [])
  assert.deepEqual(detectar(hoja([[cel('x'), cel('25/06/2026', 'DATE')]])), [])
})

test('una fecha mostrada como moneda sólo se caza si la columna tiene fechas', () => {
  // Sólo por el rango la señal es ruido: marcaba veintitrés importes legítimos del cash flow. Lo
  // que la vuelve concluyente es que la MISMA columna tenga celdas con formato de fecha.
  const conFechas = hoja([[cel('x'), cel('25/06/2026', 'DATE')], [cel('y'), cel('$46.198', 'CURRENCY')]])
  assert.equal(detectar(conFechas)[0].tipo, 'fecha_como_moneda')
  // La misma cifra en una columna de importes es un importe y no se marca.
  assert.deepEqual(detectar(hoja([[cel('x'), cel('$54.043', 'CURRENCY')]])), [])
})

test('una fecha VEINTE filas más abajo no convierte un importe en sospechoso', () => {
  // El layout de esta planilla apila varias tablas sobre las mismas columnas. Mirando la columna
  // entera, "$54.358" de Ferretería y consumibles se marcaba porque otra tabla, más abajo, tiene
  // fechas en esa misma columna. La vecindad es lo que define una tabla.
  const filas = [[cel('Ferretería'), cel('$54.358', 'CURRENCY')]]
  for (let i = 0; i < 25; i++) filas.push([cel('relleno')])
  filas.push([cel('otra tabla'), cel('25/06/2026', 'DATE')])
  assert.deepEqual(detectar(filas.length ? { filas, anchos: [] } : null, { huecoMax: 999 }), [])
})

// ═══ EL FALSO POSITIVO DE "Proveedores": DOS TABLAS SOBRE LA MISMA COLUMNA (05/08) ═══
//
// El pie de la sección 2 lleva "Comprado 2026" en la columna C —moneda— y la tabla de notas de
// crédito, ocho filas más abajo, lleva su Fecha en la misma C. El auditor reportaba los $50.000 de un
// proveedor real como "un entero en el rango de seriales de fecha". No es una columna inconsistente:
// son dos tablas distintas, y lo que las separa es el título de sección que hay en el medio.
test('la vecindad NO cruza un título de sección: son dos tablas, no una columna', () => {
  const seccion2 = [
    [cel('2 · CUENTA CORRIENTE POR PROVEEDOR')],
    [cel('Proveedor'), cel('CUIT'), cel('Comprado 2026')],
    [cel('JM'), cel('30-11111111-1'), cel('$50.000', 'CURRENCY')],
    [cel('TOTAL'), cel(''), cel('$281.227.326', 'CURRENCY')],
  ]
  const seccion3 = [
    [cel('3 · NOTAS DE CRÉDITO')],
    [cel('Proveedor'), cel('Nota de crédito'), cel('Fecha')],
    [cel('Trielec'), cel('0003-00000123'), cel('12/05/2026', 'DATE')],
  ]
  assert.deepEqual(detectar(hoja([...seccion2, ...seccion3])), [],
    'el $50.000 de JM es plata de otra tabla: el título de la sección 3 corta la vecindad')

  // Y NO se afloja el control: dentro de la MISMA tabla, sin título en el medio, se sigue cazando.
  const mismaTabla = [
    [cel('4 · LO QUE ARCA FACTURÓ')],
    [cel('Proveedor'), cel('CUIT'), cel('Fecha')],
    [cel('ADDATO'), cel('30-22222222-2'), cel('12/05/2026', 'DATE')],
    [cel('BOTAS'), cel('30-33333333-3'), cel('$46.198', 'CURRENCY')],
  ]
  const d = detectar(hoja(mismaTabla))
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'fecha_como_moneda')
})

test('un importe negativo NO es texto', () => {
  // El signo va ANTES del peso. La primera versión no lo contemplaba y generó 2.486 falsos
  // positivos: un control que grita por todo enseña a ignorarlo.
  for (const v of ['-$2.949.816', '$-1.234', '-$0', '$ 1.234,56', '-12,5%']) {
    assert.deepEqual(detectar(hoja([[cel('x'), cel(v, 'CURRENCY')]])), [], `${v} es un número`)
  }
})

test('un ratio con formato de porcentaje se caza', () => {
  const d = detectar(hoja([[cel('x'), cel('2083%', 'PERCENT')]]))
  assert.equal(d[0].tipo, 'porcentaje_fuera_de_escala')
  assert.deepEqual(detectar(hoja([[cel('x'), cel('12,5%', 'PERCENT')]])), [])
})

test('un CUIT sin formatear se caza', () => {
  const d = detectar(hoja([[cel('Hormiserv'), cel('30681641730', 'TEXT')]]))
  assert.equal(d[0].tipo, 'cuit_sin_formato')
})

test('las filas en blanco seguidas se reportan como un solo hueco', () => {
  const filas = [[cel('arriba')], [], [], [], [], [], [cel('abajo')]]
  const d = detectar(hoja(filas))
  assert.equal(d.length, 1)
  assert.equal(d[0].tipo, 'hueco')
  assert.equal(d[0].fila, 2)
  assert.match(d[0].valor, /5 filas/)
})

test('una fila en blanco entre bloques NO es un defecto', () => {
  // Separar dos bloques con una línea vacía es correcto; el problema son veintinueve.
  assert.deepEqual(detectar(hoja([[cel('a')], [], [cel('b')]])), [])
})

test('el resumen agrupa por tipo y ordena por cantidad', () => {
  const filas = [
    [cel('a'), cel('30/12/99', 'DATE')],
    [cel('b'), cel('30/12/99', 'DATE')],
    [cel('c'), cel('nota suelta', 'CURRENCY')],
  ]
  const r = resumen(detectar(hoja(filas)))
  assert.equal(r[0].tipo, 'fecha_cero')
  assert.equal(r[0].n, 2)
  assert.equal(r[1].n, 1)
})

test('una fila de encabezado de meses no vuelve sospechosa a toda la tabla', () => {
  // Casi todos los cuadros del archivo abren con "ene feb mar…", que son fechas de verdad.
  // Contándolas, cualquier gasto en el rango de seriales se marcaba: $54.043 de Recurrentes y
  // $48.613 de Estructura son gastos reales.
  const filas = [
    [cel('Proveedor'), cel('ene', 'DATE'), cel('feb', 'DATE'), cel('mar', 'DATE')],
    [cel('RSV'), cel('$54.043', 'CURRENCY'), cel('$48.613', 'CURRENCY'), cel('$1.000', 'CURRENCY')],
  ]
  assert.deepEqual(detectar(hoja(filas)), [])
})

test('pero una sola fecha suelta en la columna sí cuenta', () => {
  const filas = [[cel('x'), cel('25/06/2026', 'DATE')], [cel('y'), cel('$46.198', 'CURRENCY')]]
  assert.equal(detectar(hoja(filas))[0].tipo, 'fecha_como_moneda')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS DEFECTOS QUE DESTAPÓ "Calendario de Cobros" (13/08)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('UN SERIAL CON FORMATO TEXT ES UNA FECHA DIBUJADA COMO NÚMERO: los "46260" del encabezado', () => {
  // El caso real, celda por celda: E4/G4/H4/I4 mostraban el serial y F4 ("sept-26") estaba bien.
  const filas = [[cel('Cliente / cobro', 'TEXT'), cel('46260', 'TEXT'), cel('sept-26', 'TEXT'), cel('46321', 'TEXT')]]
  const d = detectar(hoja(filas)).filter((x) => x.tipo === 'serial_crudo')
  assert.equal(d.length, 2, 'los dos seriales, y sólo ellos')
  assert.deepEqual(d.map((x) => x.col), ['B', 'D'])
})

test('el detector de serial crudo no muerde lo que está bien: hace falta el número Y el formato', () => {
  // MISMO VALOR, FORMATO DE FECHA → es exactamente la corrección, y no puede reportarse como defecto.
  assert.equal(esSerialCrudo('46260', 'DATE'), false)
  // Un número de comprobante de cinco dígitos fuera del rango de seriales no es una fecha.
  assert.equal(esSerialCrudo('12345', 'TEXT'), false)
  // Y un importe con formato de moneda ya lo mira otro detector, con su propia evidencia.
  assert.equal(esSerialCrudo('46.260', 'CURRENCY'), false)
})

test('un glifo emoji en una celda se reporta: está escrito y no se va a ver', () => {
  const d = detectar(hoja([[cel('⚠ Vencido'), cel('🟢 Vigente')]])).filter((x) => x.tipo === 'glifo_invisible')
  assert.equal(d.length, 2)
  assert.match(d[0].que, /no se dibuja/)
  // Los símbolos que el archivo usa a propósito no se reportan: si el detector gritara por "⇒ TOTAL"
  // o "↳ endosado" nadie volvería a mirar su lista.
  assert.deepEqual(detectar(hoja([[cel('⇒ TOTAL POR COBRAR'), cel('↳ endosado')]])), [])
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL ENCABEZADO DEL CUADRO DE ABAJO NO ES UN DEFECTO DEL CUADRO DE ARRIBA
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Los tres únicos avisos que tenía "Tarjeta de Credito" —B12, B19 y B26, las tres veces la palabra
// "Monto"— eran los encabezados de sus tres cuadros apilados, y los tres estaban bien puestos. El
// detector los marcaba porque miraba la columna entera y encontraba los importes del cuadro de
// arriba. Una pestaña sobre la que un control sólo dice cosas falsas es una pestaña que se saltea.

test('un encabezado debajo de un título de sección no hereda los números del cuadro de arriba', () => {
  // La forma real de "Tarjeta de Credito", transcrita: un cuadro con importes, el título de la
  // sección siguiente, y el encabezado del cuadro nuevo sobre las MISMAS dos columnas.
  const filas = [
    [cel('LA LÍNEA — CUÁNTO SE PUEDE GASTAR HOY')],
    [cel('Concepto'), cel('Monto', 'NUMBER')],
    [cel('Límite de compra'), cel('$10.000.000', 'NUMBER')],
    [],
    [cel('1 · CUÁNTO VENCE Y CUÁNDO')],
    [cel('Concepto'), cel('Monto', 'NUMBER')],
    [cel('Próximo débito'), cel('$965.864', 'NUMBER')],
  ]
  const d = detectar(hoja(filas)).filter((x) => x.tipo === 'texto_en_numero')
  assert.deepEqual(d, [], 'el "Monto" de la fila 6 es el rótulo de su cuadro, no una nota perdida')
  assert.equal(esRotuloDeColumna(filas, 5, 1), true)
})

test('pero el título NO absuelve a la primera fila de DATOS: el caso OBRAS!F10', () => {
  // "▲ 17.449.303" es un importe convertido en texto, en la primera fila debajo del título. Frenar en
  // el título y dar por buena esa fila lo tapaba — el defecto más caro de los que este detector busca,
  // porque un importe que es texto no suma en ninguna fórmula y no da error.
  // La forma real de OBRAS: el cuadro de cartera, su total, el título de la sección 2 y su cuadro.
  const filas = [
    [cel('Cartera'), cel('% venc.'), cel('▲ 61–90', 'CURRENCY')],
    [cel('⇒ TOTAL POR COBRAR'), cel('12,1%'), cel('$3.488.735', 'CURRENCY')],
    [],
    [cel('2 · OBRAS DEL AÑO')],
    [cel('Cliente'), cel('% cob.'), cel('Vencido', 'CURRENCY')],
    [cel('ARCOR'), cel('69,2%'), cel('▲ 17.449.303', 'CURRENCY')],
  ]
  const d = detectar(hoja(filas)).filter((x) => x.tipo === 'texto_en_numero')
  assert.equal(d.length, 1, 'la fila de datos se reporta aunque cuelgue de un título')
  assert.equal(`${d[0].col}${d[0].fila}`, 'C6')
  assert.equal(esRotuloDeColumna(filas, 4, 2), true, 'y la fila de rótulos sigue estando bien')
})

test('la excepción no se estira: un título no absuelve lo que está diez filas más abajo', () => {
  // `Proveedores!C200` es un N° de comprobante en una celda de moneda, con la fila vacía al lado y el
  // título de su sección dieciséis filas más arriba. Sin tope, el título lo daba por encabezado.
  const filas = [
    [cel('5 · LO QUE ARCA FACTURÓ')],
    [cel('Proveedor'), cel('Comprobante', 'CURRENCY')],
    [cel('ARCOR'), cel('$1.000', 'CURRENCY')],
    [], [], [],
    [null, cel('0001-00000205', 'CURRENCY')],
  ]
  const d = detectar(hoja(filas), { huecoMax: 99 }).filter((x) => x.tipo === 'texto_en_numero')
  assert.deepEqual(d.map((x) => `${x.col}${x.fila}`), ['B7'])
})

test('una celda sola rodeada de vacío no es una fila de rótulos: un encabezado rotula VARIAS columnas', () => {
  assert.equal(esFilaDeRotulos([cel('Concepto'), cel('Monto')], 1), true)
  assert.equal(esFilaDeRotulos([null, cel('0001-00000205')], 1), false, 'una sola celda no rotula nada')
  assert.equal(esFilaDeRotulos([cel('ARCOR'), cel('69,2%'), cel('▲ 17.449.303')], 2), false)
  // Y el tramo se corta en la celda vacía: un número de OTRA tabla, sesenta columnas más allá, no
  // convierte el encabezado de ésta en una fila de datos (era la fila 4 entera de "Cobranzas").
  assert.equal(esFilaDeRotulos([cel('Concepto'), cel('Monto'), null, cel('$300.588.858')], 1), true)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// EL PATRÓN DE LA CELDA ES PARTE DE LA EVIDENCIA (15/08)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Una celda con su patrón de número: es la mitad de la evidencia que faltaba. */
const celp = (valor, type, pattern) => ({ valor, formato: { numberFormat: { type, pattern } } })

const ALERTA_PAT = '"▲ "#,##0;("▲ "#,##0);"—"'

test('un importe dibujado con el ▲ de su propio patrón NO es texto', () => {
  // OBRAS!F10. Adentro hay 17449303.3143 —medido con UNFORMATTED_VALUE— y el patrón de alerta le
  // dibuja el triángulo adelante. Arreglar el formato movió el defecto al detector: las cinco celdas
  // con importe de la columna «Vencido» pasaron a reportarse como "texto en una celda CURRENCY".
  const d = detectar(hoja([
    // El cuadro de arriba deja un importe en la MISMA columna: por eso las de abajo no se absuelven
    // como encabezado, que es la situación real de OBRAS (F6 tiene el total del bloque anterior).
    [cel('⇒ Vencido a 61–90'), celp('$1.000.000', 'CURRENCY', '"$"#,##0')],
    [cel('Obra'), cel('Vencido', 'TEXT')],
    [cel('San Francisco'), celp('▲ 17.449.303', 'CURRENCY', ALERTA_PAT)],
    [cel('MESSINA'), celp('▲ $42.360.120', 'CURRENCY', '"▲ $"#,##0;("▲ $"#,##0);"—"')],
  ])).filter((x) => x.tipo === 'texto_en_numero')
  assert.deepEqual(d, [], `un número con literal en su patrón no es una nota: ${JSON.stringify(d)}`)
})

test('pero una NOTA en esa misma celda de alerta se sigue reportando', () => {
  // "▲ ninguna compra la nombra" es lo que publica OBRAS cuando no puede emparejar. Sacarle el
  // triángulo deja prosa, no un número: el control tiene que seguir viéndola.
  const d = detectar(hoja([
    [cel('⇒ Vencido a 61–90'), celp('$1.000.000', 'CURRENCY', '"$"#,##0')],
    [cel('Obra'), cel('Vencido', 'TEXT')],
    [cel('San Francisco'), celp('▲ 17.449.303', 'CURRENCY', ALERTA_PAT)],
    [cel('MESSINA'), celp('▲ ninguna compra la nombra', 'CURRENCY', ALERTA_PAT)],
  ])).filter((x) => x.tipo === 'texto_en_numero')
  assert.equal(d.length, 1)
  assert.equal(d[0].fila, 4)
})

test('"$ -" pegado en una columna de moneda SIGUE siendo un defecto', () => {
  // Compras: 243 celdas dicen "$ -" y adentro tienen la CADENA "$ -", no un cero (verificado con
  // UNFORMATTED_VALUE). El cero de ese patrón es "—" y sólo "—": ninguna de sus tres secciones
  // dibuja "$ -". Sacarle el "$" del patrón dejaba "-", caía en la regla del guion y las 243
  // desaparecían del informe.
  const PAT = '"$"#,##0.00;("$"#,##0.00);"—"'
  const d = detectar(hoja([
    [cel('Proveedor'), cel('IVA', 'TEXT')],
    [cel('Alumetal'), celp('$134.999,99', 'CURRENCY', PAT)],
    [cel('Hormiserv'), celp('$ -', 'CURRENCY', PAT)],
  ])).filter((x) => x.tipo === 'texto_en_numero')
  assert.equal(d.length, 1, 'se silenciaron los 243 "$ -" de Compras')
  assert.equal(d[0].fila, 3)
})

test('un negativo en notación contable no se convierte en texto al sacarle los literales', () => {
  // Cobranzas: `"$ "#,##0.00;[RED]"($ "#,##0.00\\);\\-`. El paréntesis que ABRE está entre comillas y
  // el que CIERRA va escapado con `\`, así que sacar sólo los entrecomillados deja "80.000,00)" —
  // medio importe con un paréntesis suelto, que ya no parece número. Cuatro importes negativos
  // legítimos (J58 · K58 · M58 · T58) se reportaban como texto.
  const PAT = '"$ "#,##0.00;[RED]"($ "#,##0.00\\);\\-'
  const d = detectar(hoja([
    [cel('Cliente'), cel('Neto', 'TEXT')],
    [cel('Quattropani'), celp('$ 192.000,00', 'CURRENCY', PAT)],
    [cel('Nota de crédito'), celp('($ 80.000,00)', 'CURRENCY', PAT)],
  ])).filter((x) => x.tipo === 'texto_en_numero')
  assert.deepEqual(d, [], `un importe negativo contable no es una nota: ${JSON.stringify(d)}`)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// UNA FILA DE DATOS CON VARIAS FECHAS NO ES UN ENCABEZADO DE PERÍODOS (15/08)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** El registro de "Jornales": tres fechas mezcladas con importes y un estado. NO es un encabezado. */
const filaDeRegistro = () => [
  cel('05/01/2026', 'DATE'), cel('15/01/2026', 'DATE'), celp('$1.380.275', 'CURRENCY', '"$"#,##0'),
  celp('$4.888.075', 'CURRENCY', '"$"#,##0'), cel('10', 'NUMBER'), cel('18/05/2026', 'DATE'),
]

test('un serial dibujado como importe ARRIBA de su tabla se caza aunque la fila de datos tenga varias fechas', () => {
  // Jornales!N126..N132: siete fechas de «Pagado el» publicadas como `$46.160 · $46.176 · …` arriba
  // del encabezado del registro, residuo de un layout ocho filas más corto. Con "tres o más fechas =
  // encabezado de períodos" las doce filas del registro no aportaban su columna N y NADIE las veía.
  const d = detectar(hoja([
    [cel('5 · OBRA — EL REGISTRO'), cel(''), cel(''), cel(''), cel(''), celp('$46.160', 'CURRENCY', '"$"#,##0')],
    [cel('Quincena', 'TEXT'), cel('Hasta', 'TEXT'), cel('Banco', 'TEXT'), cel('TOTAL', 'TEXT'), cel('Días', 'TEXT'), cel('Pagado el', 'TEXT')],
    filaDeRegistro(),
  ])).filter((x) => x.tipo === 'fecha_como_moneda')
  assert.equal(d.length, 1, 'el serial huérfano de la columna del dueño quedó invisible')
  assert.equal(d[0].col, 'F')
  assert.equal(d[0].fila, 1)
})

test('pero un encabezado de meses de verdad sigue sin contar como fecha vecina', () => {
  // "ene feb mar abr" con formato de fecha arriba de un cuadro: contándolo, cualquier importe en el
  // rango de seriales se marcaba ($54.043 en Recurrentes, $48.613 en Estructura, gastos reales).
  const d = detectar(hoja([
    [cel('Concepto'), cel('01/01/2026', 'DATE'), cel('01/02/2026', 'DATE'), cel('01/03/2026', 'DATE'), cel('01/04/2026', 'DATE')],
    [cel('Alquiler'), celp('$46.198', 'CURRENCY', '"$"#,##0'), celp('$46.198', 'CURRENCY', '"$"#,##0'), celp('$46.198', 'CURRENCY', '"$"#,##0'), celp('$46.198', 'CURRENCY', '"$"#,##0')],
  ])).filter((x) => x.tipo === 'fecha_como_moneda')
  assert.deepEqual(d, [], 'volvieron los falsos positivos del encabezado de meses')
})

test('un título de sección CON contenido al lado no corta la mirada; uno pelado sí', () => {
  // Es la misma frontera que ya usa `esRotuloDeColumna` y estaba escrita con otro predicado acá.
  const conOrfano = (tituloConDato) => hoja([
    [cel(''), cel(''), cel(''), cel(''), cel(''), celp('$46.160', 'CURRENCY', '"$"#,##0')],
    [cel('5 · OBRA — EL REGISTRO'), cel(''), cel(''), cel(''), cel(''), tituloConDato ? celp('$46.176', 'CURRENCY', '"$"#,##0') : cel('')],
    [cel('Quincena', 'TEXT'), cel('Hasta', 'TEXT'), cel('Banco', 'TEXT'), cel('TOTAL', 'TEXT'), cel('Días', 'TEXT'), cel('Pagado el', 'TEXT')],
    filaDeRegistro(),
  ])
  const conDato = detectar(conOrfano(true)).filter((x) => x.tipo === 'fecha_como_moneda')
  assert.equal(conDato.length, 2, 'un título que trae un dato al lado no abre un cuadro: no es frontera')
  const pelado = detectar(conOrfano(false)).filter((x) => x.tipo === 'fecha_como_moneda')
  assert.deepEqual(pelado, [], 'un título pelado SÍ separa dos tablas apiladas y la mirada no lo cruza')
})

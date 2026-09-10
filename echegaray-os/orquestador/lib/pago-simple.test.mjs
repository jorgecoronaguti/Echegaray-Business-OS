import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cuentasAceptadas, escaparXml, estilosDeDatos, filaDelEncabezado, filasDeDatos,
  hojaConPagos, ordenDePago, serialExcel, validarPagoSimple,
} from './pago-simple.mjs'

// La hoja de prueba tiene la MISMA FORMA que la que manda Santander —encabezado en la fila 7,
// celdas `inlineStr`, estilos por columna, filas vacías al final, merges y validaciones después de
// `sheetData`— con CUIL y cuentas inventados. Los datos reales de los trabajadores no entran al
// repositorio; lo que se prueba es la forma, y la forma es la que rompe.
//
// La fila 8 lleva estilos DISTINTOS al resto (s="109" contra s="111") y celdas de relleno en O..AA:
// así estaba el archivo real que el banco aceptó, y es el motivo por el que el formato se deduce de
// la mayoría y no de la primera fila.
const PROLOGO = '<worksheet><dimension ref="A1:AA13"/>'
  + '<cols><col width="18.25" customWidth="1" style="36" min="1" max="1"/></cols><sheetData>'
  + '<row r="6"><c r="A6" s="55" t="inlineStr"><is><t>INFORMACION DEL PAGO</t></is></c></row>'
  + '<row r="7" ht="58.5" customHeight="1"><c r="A7" s="56" t="inlineStr"><is><t>Forma de pago</t></is></c>'
  + '<c r="B7" s="57" t="inlineStr"><is><t>Orden de pago</t></is></c>'
  + '<c r="C7" s="58" t="inlineStr"><is><t>Raz&#243;n social del beneficiario (Opcional)</t></is></c>'
  + '<c r="D7" s="56" t="inlineStr"><is><t>Tipo de documento</t></is></c>'
  + '<c r="E7" s="59" t="inlineStr"><is><t>CUIT / CUIL</t></is></c>'
  + '<c r="F7" s="56" t="inlineStr"><is><t>Fecha de pago</t></is></c>'
  + '<c r="G7" s="60" t="inlineStr"><is><t>Importe del pago</t></is></c>'
  + '<c r="H7" s="56" t="inlineStr"><is><t>N&#250;mero de instrumento del pago</t></is></c></row>'
const EPILOGO = '</sheetData><mergeCells count="2"><mergeCell ref="A6:J6"/><mergeCell ref="K6:N6"/></mergeCells>'
  + '<dataValidations count="2">'
  + '<dataValidation sqref="A8:A1004" type="list"><formula1>"E,T,A,R"</formula1></dataValidation>'
  + '<dataValidation sqref="D8:D327" type="list"><formula1>"CUIT,CUIL"</formula1></dataValidation>'
  + '</dataValidations></worksheet>'

const dato = (r, { s, nombre, cuil, fecha, importe, cuenta, relleno = false }) =>
  `<row r="${r}" ht="15.75" customHeight="1">`
  + `<c r="A${r}" t="inlineStr"><is><t>T</t></is></c>`
  + `<c r="C${r}" t="inlineStr"><is><t>${nombre}</t></is></c>`
  + `<c r="D${r}" t="inlineStr"><is><t>CUIL</t></is></c>`
  + `<c r="E${r}" s="${s}" t="n"><v>${cuil}</v></c>`
  + `<c r="F${r}" s="115" t="n"><v>${fecha}</v></c>`
  + `<c r="G${r}" s="37" t="n"><v>${importe}</v></c>`
  + `<c r="H${r}" s="36" t="inlineStr"><is><t>${cuenta}</t></is></c>`
  + (relleno ? `<c r="O${r}" s="64" t="n"></c><c r="P${r}" s="64" t="n"></c>` : '')
  + '</row>'

const vacia = (r) => `<row r="${r}" ht="15.75" customHeight="1"></row>`

const PLANTILLA = PROLOGO
  + dato(8, { s: 109, nombre: 'PEREZ, JUAN CARLOS', cuil: '20111111112', fecha: 46252, importe: 1000, cuenta: '0720179640000011111111', relleno: true })
  + dato(9, { s: 111, nombre: 'GOMEZ MARIA E.', cuil: '27222222223', fecha: 46252, importe: 2500.5, cuenta: '0720179640000022222222' })
  + dato(10, { s: 111, nombre: 'LOPEZ NESTOR', cuil: '20333333334', fecha: 46252, importe: 700, cuenta: '0720179640000033333333' })
  + vacia(11) + vacia(12) + vacia(13) + EPILOGO

const ACEPTADAS = cuentasAceptadas(PLANTILLA)
const PAGOS = [
  { nombre: 'PEREZ, JUAN CARLOS', cuil: '20111111112', cuenta: '0720179640000011111111', importe: 1500 },
  { nombre: 'LOPEZ NESTOR', cuil: '20333333334', cuenta: '0720179640000033333333', importe: 800.25 },
]
const generar = (pagos = PAGOS) => hojaConPagos(PLANTILLA, { pagos, fechaSerial: 46275, orden: 82026 })

test('el encabezado se ubica por su texto, no por un número de fila fijo', () => {
  assert.equal(filaDelEncabezado(PLANTILLA), 7)
  assert.throws(() => filaDelEncabezado('<worksheet><sheetData/></worksheet>'), /Forma de pago/)
})

test('el formato se deduce de la MAYORÍA de las filas, no de la primera', () => {
  // La fila 8 usa s="109" y las otras dos s="111". Tomar la primera fila ataría el archivo nuevo
  // a la basura que dejó el editor en el original.
  const { estilos } = estilosDeDatos(PLANTILLA)
  assert.equal(estilos.E.s, '111')
  assert.equal(estilos.E.t, 'n')
  assert.equal(estilos.H.s, '36')
  assert.equal(estilos.H.t, 'inlineStr')
  assert.equal(estilos.A.s, null, 'la columna A no lleva estilo en el original')
  assert.equal(estilos.C.t, 'inlineStr')
})

test('las cuentas aceptadas se indexan por CUIL, con el nombre tal cual lo escribe el banco', () => {
  assert.equal(ACEPTADAS.size, 3)
  assert.deepEqual(ACEPTADAS.get('27222222223'), { cuenta: '0720179640000022222222', nombre: 'GOMEZ MARIA E.' })
})

test('la hoja generada mantiene la MISMA cantidad de filas y vacía las que sobran', () => {
  const g = generar()
  const filasDe = (x) => (x.match(/<row r="\d+"/g) ?? []).length
  assert.equal(filasDe(g), filasDe(PLANTILLA))
  assert.equal(filasDeDatos(g).length, 2)
  assert.match(g, /<row r="10" ht="15\.75" customHeight="1"><\/row>/, 'la fila del tercer pago viejo quedó con datos')
  assert.doesNotMatch(g, /GOMEZ/, 'quedó un beneficiario del lote anterior')
})

test('el prólogo y el epílogo quedan intactos: merges, validaciones y dimension', () => {
  const g = generar()
  assert.ok(g.startsWith(PROLOGO), 'cambió el encabezado de la hoja')
  assert.ok(g.endsWith(EPILOGO), 'cambiaron los merges o las validaciones')
  assert.match(g, /dimension ref="A1:AA13"/)
})

test('las filas nuevas salen con el vocabulario exacto de la plantilla', () => {
  const g = generar()
  assert.match(g, /<row r="8" ht="15\.75" customHeight="1"><c r="A8" t="inlineStr"><is><t>T<\/t><\/is><\/c><c r="B8" t="n"><v>82026<\/v><\/c>/)
  assert.match(g, /<c r="E8" s="111" t="n"><v>20111111112<\/v><\/c>/)
  assert.match(g, /<c r="F8" s="115" t="n"><v>46275<\/v><\/c>/)
  assert.match(g, /<c r="G8" s="37" t="n"><v>1500<\/v><\/c>/)
  assert.match(g, /<c r="H8" s="36" t="inlineStr"><is><t>0720179640000011111111<\/t><\/is><\/c>/)
  assert.doesNotMatch(g, /<c r="O8"/, 'se copió el relleno O..AA de la primera fila del original')
})

test('el importe se escribe como lo escribe el banco: el número, sin forzar decimales', () => {
  assert.match(generar(), /<c r="G9" s="37" t="n"><v>800\.25<\/v><\/c>/)
})

test('escaparXml: un «&» en el nombre no rompe la hoja', () => {
  assert.equal(escaparXml('PEREZ & CIA <SA>'), 'PEREZ &amp; CIA &lt;SA&gt;')
  const g = hojaConPagos(PLANTILLA, {
    pagos: [{ ...PAGOS[0], nombre: 'PEREZ & CIA' }], fechaSerial: 46275, orden: 82026,
  })
  assert.match(g, /<t>PEREZ &amp; CIA<\/t>/)
})

test('validarPagoSimple: el archivo generado pasa', () => {
  const r = validarPagoSimple(PLANTILLA, generar(), ACEPTADAS)
  assert.deepEqual(r.errores, [])
  assert.equal(r.ok, true)
  assert.equal(r.filas, 2)
})

test('validarPagoSimple: una cuenta que NO es la que el banco acreditó se pone roja', () => {
  const g = generar().replace('0720179640000011111111', '0720179640000011111199')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /NO es la que el banco acreditó/)
})

test('validarPagoSimple: un CUIL que nunca cobró se pone rojo', () => {
  const r = validarPagoSimple(PLANTILLA, generar([
    { nombre: 'NUEVO PEPE', cuil: '20999999996', cuenta: '0720179640000099999999', importe: 100 },
  ]), ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /no figura en ningún lote que el banco haya acreditado/)
})

test('validarPagoSimple: un nombre que no es el del banco se pone rojo', () => {
  const g = generar().replace('<t>PEREZ, JUAN CARLOS</t>', '<t>PEREZ JUAN C</t>')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /no es el que usó el banco/)
})

test('validarPagoSimple: un estilo de celda cambiado se pone rojo', () => {
  const g = generar().replace('<c r="E8" s="111"', '<c r="E8" s="109"')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /columna E: estilo 109/)
})

test('validarPagoSimple: una cuenta escrita como número en vez de texto se pone roja', () => {
  const g = generar().replace('<c r="H8" s="36" t="inlineStr"><is><t>0720179640000011111111</t></is></c>',
    '<c r="H8" s="36" t="n"><v>720179640000011111111</v></c>')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /columna H: tipo n/)
})

test('validarPagoSimple: perder las validaciones de datos se pone rojo', () => {
  const g = generar().replace(/<dataValidations[\s\S]*?<\/dataValidations>/, '')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /merges o las validaciones/)
})

test('validarPagoSimple: cambiar la cantidad de filas de la hoja se pone rojo', () => {
  const g = generar().replace(/<row r="13"[^>]*><\/row>/, '')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /filas y la plantilla/)
})

test('validarPagoSimple: una forma de pago que no es «T» se pone roja', () => {
  const g = generar().replace('<c r="A8" t="inlineStr"><is><t>T</t></is></c>', '<c r="A8" t="inlineStr"><is><t>E</t></is></c>')
  const r = validarPagoSimple(PLANTILLA, g, ACEPTADAS)
  assert.equal(r.ok, false)
  assert.match(r.errores.join(' | '), /forma de pago es «E»/)
})

test('serialExcel y ordenDePago', () => {
  assert.equal(serialExcel('20260818'), 46252, 'la fecha del lote que el banco debitó')
  assert.equal(serialExcel('20260910'), 46275)
  assert.equal(ordenDePago('202608'), 82026)
  assert.equal(ordenDePago('202604'), 42026, 'el período que el banco devolvió como «042026»')
  assert.equal(ordenDePago('202610'), 102026)
})

// LOS DEFECTOS QUE ESTE TEST ATRAPA son los que hacen que un mapa de conexión MIENTA. Un auditor que
// reporta veinte referencias rotas falsas no lo lee nadie, y ahí adentro se pierde la real.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  referenciasDeFormula, nombresLocalesLET, tokensDeNombre, sinTextos, esRefCelda,
  clasificarCelda, vitalidad, bloquesPegados, construirGrafo, colLetra, pareceFecha,
} from './conexion-flujo.mjs'

test('la pestaña citada NO se cuenta además como rango con nombre', () => {
  const r = referenciasDeFormula('=SUMIFS(Compras!M:M;Compras!D:D;">="&A1)')
  assert.deepEqual(r.pestanas, ['Compras'])
  // Si el nombre de la pestaña sobrevive al barrido, "Compras" se reporta como rango con nombre
  // inexistente y la pestaña más conectada del archivo aparece como referencia rota.
  assert.deepEqual(r.nombres, [])
})

test('la pestaña con espacios va entre comillas y se lee entera', () => {
  const r = referenciasDeFormula("='Cash Flow Semanal'!B5+'Impuestos y Financieros'!C9")
  assert.deepEqual(r.pestanas.sort(), ['Cash Flow Semanal', 'Impuestos y Financieros'])
  assert.deepEqual(r.nombres, [])
})

test('el rango con nombre SÍ se reporta, y la función no', () => {
  const r = referenciasDeFormula('=SUM(CAJA_TOTAL_DISPONIBLE;ANEXO_DESCUBIERTO)')
  assert.deepEqual(r.nombres.sort(), ['ANEXO_DESCUBIERTO', 'CAJA_TOTAL_DISPONIBLE'])
  assert.deepEqual(r.pestanas, [])
})

test('#N/A no es un rango con nombre llamado "N"', () => {
  // El defecto: sin blanquear los valores de error, cada #N/A o #DIV/0! del archivo inventaba un
  // nombre roto. Una pestaña con veinte errores de cálculo salía con veinte referencias rotas.
  const r = referenciasDeFormula('=IFERROR(A1;#N/A)')
  assert.deepEqual(r.nombres, [])
})

test('#REF! se cuenta como error duro, no como nombre', () => {
  const r = referenciasDeFormula('=#REF!+B2')
  assert.equal(r.errores.length, 1)
  assert.deepEqual(r.nombres, [])
  assert.deepEqual(r.pestanas, [])
})

test('las letras de un rango abierto (A:A) y los anclajes ($A$1) no son nombres', () => {
  assert.deepEqual(referenciasDeFormula('=SUM(A:A)').nombres, [])
  assert.deepEqual(referenciasDeFormula('=$A$1+$BH$90').nombres, [])
})

test('una función con punto no es un rango con nombre roto', () => {
  // FÓRMULA REAL de "Jornales por Quincena" (leída del archivo el 13/08/2026). `NETWORKDAYS` salía
  // como "rango con nombre que no existe" en 9 celdas — y aparecía arriba de todo, en el nivel más
  // grave. Un auditor que inventa el hallazgo más grave no se vuelve a usar.
  const f = '=IFERROR(NETWORKDAYS.INTL(A41;B41;"0000011");"")'
  assert.deepEqual(referenciasDeFormula(f).nombres, [])
  assert.deepEqual(referenciasDeFormula('=SUMAR.SI(A:A;">0")').nombres, [])
})

test('la notación científica no inventa un nombre "E"', () => {
  assert.deepEqual(referenciasDeFormula('=A1*1E+10').nombres, [])
})

test('las variables locales de LET no son rangos con nombre', () => {
  // Lección ya pagada ("LET: nombre A1 y ARRAYFORMULA"): `pend` vive adentro de la fórmula.
  const f = '=LET(pend;SUMIFS(Cobranzas!F:F;Cobranzas!C:C;"pendiente");iva;pend*0,21;pend+iva)'
  assert.deepEqual([...nombresLocalesLET(f)].sort(), ['iva', 'pend'])
  assert.deepEqual(referenciasDeFormula(f).nombres, [])
  assert.deepEqual(referenciasDeFormula(f).pestanas, ['Cobranzas'])
})

test('lo que está adentro de un texto no es una referencia', () => {
  // La QUERY del libro trae `select` y `where` con nombres de columna: sin blanquear los literales,
  // cada palabra del select entraba como rango con nombre inexistente.
  const f = '=QUERY(_MOVIMIENTOS!A:P;"select A,B where C = \'Compras\' and D > 0";1)'
  assert.deepEqual(referenciasDeFormula(f).pestanas, ['_MOVIMIENTOS'])
  assert.deepEqual(referenciasDeFormula(f).nombres, [])
  assert.match(sinTextos('=A1&"Proveedores!B2"'), /^=A1& +$/)
})

test('IMPORTRANGE declara el archivo externo, venga como URL o como id', () => {
  const url = '=IMPORTRANGE("https://docs.google.com/spreadsheets/d/1ABCdef_GHI-jkl/edit#gid=0";"Hoja1!A1")'
  assert.deepEqual(referenciasDeFormula(url).externas, ['1ABCdef_GHI-jkl'])
  assert.deepEqual(referenciasDeFormula('=IMPORTRANGE("1ABCdef_GHI-jkl";"A1")').externas, ['1ABCdef_GHI-jkl'])
})

test('una celda sin fórmula no cita nada', () => {
  assert.deepEqual(referenciasDeFormula(123456).pestanas, [])
  assert.deepEqual(referenciasDeFormula('TOTAL POR OBRA').nombres, [])
})

test('esRefCelda distingue celda de nombre', () => {
  assert.equal(esRefCelda('BH90'), true)
  assert.equal(esRefCelda('CAJA_TOTAL'), false)
  assert.equal(esRefCelda('A'), false)
})

test('tokensDeNombre no confunde la función con el nombre', () => {
  assert.deepEqual(tokensDeNombre('SUMIFS(  X_1 )').sort(), ['X_1'])
})

test('la celda derramada es VIVA, no un número pegado', () => {
  // El defecto que este test fija: con render FORMULA la celda derramada por una ARRAYFORMULA vuelve
  // vacía. Contarla como pegada mostraba 5.593 "números tipeados" donde había un IMPORTRANGE.
  assert.equal(clasificarCelda('', '1.234.567'), 'derramada')
  assert.equal(clasificarCelda(null, '$ 12.000'), 'derramada')
  assert.equal(clasificarCelda('=A1+1', '5'), 'formula')
  assert.equal(clasificarCelda(700000, '$ 700.000'), 'pegado')
  assert.equal(clasificarCelda('', ''), 'vacia')
  assert.equal(clasificarCelda('TOTAL', 'TOTAL'), 'texto')
})

test('el rótulo de período no es un importe pegado', () => {
  assert.equal(clasificarCelda(46234, '31/07/2026'), 'fecha')
  assert.equal(pareceFecha('6/7/26'), true)
  assert.equal(pareceFecha('700000'), false)
})

test('la vitalidad se mide sobre las celdas CON DATO, no sobre la grilla entera', () => {
  const v = vitalidad(['formula', 'formula', 'derramada', 'pegado', 'vacia', 'vacia', 'texto'])
  assert.equal(v.conDato, 5)
  assert.equal(v.vivas, 3)
  assert.equal(v.pctViva, 60)
  assert.equal(vitalidad([]).pctViva, null)
})

test('un bloque de importes pegados sale con su rango y su plata', () => {
  const formulas = [['Concepto', 'Monto'], ['a', 100], ['b', 200], ['c', 300], ['d', '=SUM(B2:B4)']]
  const vistas = [['Concepto', 'Monto'], ['a', '100'], ['b', '200'], ['c', '300'], ['d', '600']]
  const b = bloquesPegados(formulas, vistas)
  assert.equal(b.length, 1)
  assert.equal(b[0].rango, 'B2:B4')
  assert.equal(b[0].filas, 3)
  assert.equal(b[0].suma, 600)
})

test('dos importes sueltos no son un bloque (el umbral existe para no gritar por cualquier cosa)', () => {
  const f = [[100], [200], ['=A1']]
  assert.deepEqual(bloquesPegados(f, [['100'], ['200'], ['300']]), [])
})

test('colLetra es 0-based y cruza la Z', () => {
  assert.equal(colLetra(0), 'A')
  assert.equal(colLetra(25), 'Z')
  assert.equal(colLetra(26), 'AA')
})

const pest = (titulo, refP = {}, refN = {}, refsRotas = 0) => ({
  titulo, refPestanas: new Map(Object.entries(refP)), refNombres: new Map(Object.entries(refN)), refsRotas,
})

test('el grafo detecta la huérfana, la referencia rota y no cuenta la autorreferencia', () => {
  const g = construirGrafo(
    [pest('CAJA', { _MOVIMIENTOS: 12, CAJA: 40 }, { CAJA_TOTAL: 3 }), pest('_MOVIMIENTOS'), pest('SAC', {}, { NO_EXISTE: 2 })],
    ['CAJA', '_MOVIMIENTOS', 'SAC'],
    ['CAJA_TOTAL'],
  )
  // SAC no cita a nadie y nadie la cita: es la isla.
  assert.deepEqual(g.huerfanas, ['SAC'])
  // CAJA se cita a sí misma 40 veces: eso no la conecta con nada.
  assert.deepEqual(g.sale.get('CAJA'), ['_MOVIMIENTOS'])
  assert.deepEqual([...g.citadaPor.get('_MOVIMIENTOS')], [['CAJA', 12]])
  assert.deepEqual(g.rotas, [{ pestana: 'SAC', tipo: 'rango con nombre', destino: 'NO_EXISTE', celdas: 2 }])
})

test('citar una pestaña que ya no existe es una referencia rota', () => {
  const g = construirGrafo([pest('CAJA', { RESUMEN: 4 })], ['CAJA'], [])
  assert.deepEqual(g.rotas, [{ pestana: 'CAJA', tipo: 'pestaña', destino: 'RESUMEN', celdas: 4 }])
})

test('el #REF! de una fórmula llega al informe', () => {
  const g = construirGrafo([pest('CAJA', {}, {}, 3)], ['CAJA'], [])
  assert.deepEqual(g.rotas, [{ pestana: 'CAJA', tipo: '#REF!', destino: '#REF!', celdas: 3 }])
})

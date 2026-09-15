// Las fórmulas esperadas están ESCRITAS A MANO, como las deja Google al insertar Compras L / Cobranzas H:
// el test no recalcula con la función que prueba.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ajustarFormula, citaA, diferenciasDePestana, esVolatil, pestanasQueCitan } from './formula-insertar-columna.mjs'

const DESDE = { Compras: 11, Cobranzas: 7 }

test('propia pestaña: se corre desde L; lo anterior queda; los $ se conservan; el rango que cruza se estira', () => {
  const casos = [
    ['=SUM(O4:O)', '=SUM(P4:P)'],
    ['=$L$4*K4', '=$M$4*K4'],
    ['=IF(C51="";"";ROW()-4)', '=IF(C51="";"";ROW()-4)'],
    ['=SUM(A4:Z4)', '=SUM(A4:AA4)'],
    ['=SUM(K:K)+SUM(L:L)', '=SUM(K:K)+SUM(M:M)'],
    ['=AZ3+ZZ1', '=BA3+AAA1'],
    ['=SUMIFS($AB:$AB;$J:$J;"Civil")', '=SUMIFS($AC:$AC;$J:$J;"Civil")'],
  ]
  for (const [f, esperada] of casos) assert.equal(ajustarFormula(f, 'Compras', DESDE), esperada, f)
})

test('otra pestaña: sólo se corren las referencias con prefijo Compras!/Cobranzas!, cada una desde su columna', () => {
  const casos = [
    ['=SUMIF(Compras!$O:$O;">0";Compras!P4:P)', '=SUMIF(Compras!$P:$P;">0";Compras!Q4:Q)'],
    ["=SUM('Cobranzas'!H5:H)-'Cobranzas'!G5", "=SUM('Cobranzas'!I5:I)-'Cobranzas'!G5"],
    ['=Proveedores!L4+O4', '=Proveedores!L4+O4'],
    ["='Cash Flow'!M3+Cobranzas!AA2", "='Cash Flow'!M3+Cobranzas!AB2"],
  ]
  for (const [f, esperada] of casos) assert.equal(ajustarFormula(f, 'CAJA', DESDE), esperada, f)
})

test('lo que NO es referencia no se toca: textos, nombres de función, booleanos, exponentes', () => {
  // Todo corrido desde la columna A: cualquier cosa que se tomara por referencia cambiaría de letra.
  const todo = { Compras: 0 }
  for (const f of ['=INDIRECT("Compras!O4:O")', '=IF(TRUE;LOG10(100);1E5)', '=ATAN2(1;2)&"L4"', '=DAYS360(HOY;MAÑANA)']) {
    assert.equal(ajustarFormula(f, 'Compras', todo), f, f)
  }
  assert.equal(ajustarFormula('=QUERY(Compras!A4:O;"select L where M > 0")', 'X', DESDE), '=QUERY(Compras!A4:P;"select L where M > 0")')
  assert.equal(ajustarFormula(42, 'Compras', DESDE), 42)
})

test('volátiles: TODAY/NOW se reconocen en código, no dentro de un texto', () => {
  assert.equal(esVolatil('=TODAY()-B3'), true)
  assert.equal(esVolatil('=IF(A1>now();1;0)'), true)
  assert.equal(esVolatil('="TODAY()"'), false)
  assert.equal(esVolatil('=SUM(A1:A3)'), false)
})

test('qué pestañas citan a las insertadas: con y sin comillas, también dentro de INDIRECT; no las insertadas', () => {
  const foto = {
    Compras: [['=Cobranzas!H5']],
    CAJA: [['x', '=SUM(Compras!O:O)']],
    Proveedores: [["=COUNTIF('Cobranzas'!C:C;A2)"]],
    Dinamica: [['=INDIRECT("Compras!L4")']],
    Nada: [['=SUM(A1:A3)', 'Compras!O4 como texto suelto']],
    MisCompras: [['=MisCompras!A1']],
  }
  assert.deepEqual(pestanasQueCitan(foto, ['Compras', 'Cobranzas']), ['CAJA', 'Proveedores', 'Dinamica'])
  assert.equal(citaA('=OtrasCompras!A1', ['Compras']), false)
})

const INS = { indice: 11, filaEncabezado: 3 }

test('comparación: la inserción bien hecha da 0 — valores y fórmulas corridos, rótulo saltado', () => {
  const fila = (o) => { const f = new Array(16).fill(''); for (const [j, v] of Object.entries(o)) f[j] = v; return f }
  const antes = { formulas: [[], [], fila({ 10: 'K', 11: 'L' }), fila({ 11: 5, 14: '=SUM(L4:L)' })], valores: [[], [], fila({ 10: 'K', 11: 'L' }), fila({ 11: 5, 14: 5 })] }
  const despues = {
    formulas: [[], [], fila({ 10: 'K', 11: 'Obra', 12: 'L' }), fila({ 12: 5, 15: '=SUM(M4:M)' })],
    valores: [[], [], fila({ 10: 'K', 11: 'Obra', 12: 'L' }), fila({ 12: 5, 15: 5 })],
  }
  assert.deepEqual(diferenciasDePestana({ pestana: 'Compras', antes, despues, desde: DESDE, insercion: INS }), [])
})

test('EL DEFECTO: una fórmula mal corrida que da el MISMO valor se detecta como diferencia de fórmula', () => {
  const antes = { formulas: [[], [], [], ['', '=SUM(Compras!O4:O)']], valores: [[], [], [], ['', 100]] }
  const mal = { formulas: [[], [], [], ['', '=SUM(Compras!O4:O)']], valores: [[], [], [], ['', 100]] }
  const bien = { formulas: [[], [], [], ['', '=SUM(Compras!P4:P)']], valores: [[], [], [], ['', 100]] }
  const d = diferenciasDePestana({ pestana: 'CAJA', antes, despues: mal, desde: DESDE })
  assert.equal(d.length, 1)
  assert.match(d[0], /^CAJA!B4 \[fórmula\] "=SUM\(Compras!P4:P\)" → "=SUM\(Compras!O4:O\)"$/)
  assert.deepEqual(diferenciasDePestana({ pestana: 'CAJA', antes, despues: bien, desde: DESDE }), [])
})

test('una celda con TODAY() que cambió de valor no es diferencia; si cambió su fórmula, sí', () => {
  const antes = { formulas: [['=TODAY()-A2', 'x']], valores: [[46000, 'x']] }
  assert.deepEqual(diferenciasDePestana({ pestana: 'CAJA', antes, despues: { formulas: [['=TODAY()-A2', 'x']], valores: [[46001, 'x']] }, desde: DESDE }), [])
  assert.equal(diferenciasDePestana({ pestana: 'CAJA', antes, despues: { formulas: [['=TODAY()-A3', 'x']], valores: [[46000, 'x']] }, desde: DESDE }).length, 1)
  assert.equal(diferenciasDePestana({ pestana: 'CAJA', antes, despues: { formulas: [['=TODAY()-A2', 'y']], valores: [[46000, 'y']] }, desde: DESDE }).length, 2)
})

test('en la columna nueva no puede aparecer nada más que el rótulo', () => {
  const antes = { formulas: [[], [], [], new Array(12).fill('a')], valores: [[], [], [], new Array(12).fill('a')] }
  const despues = { formulas: [[], [], [], [...new Array(11).fill('a'), 'intrusa', 'a']], valores: [[], [], [], [...new Array(11).fill('a'), 'intrusa', 'a']] }
  const d = diferenciasDePestana({ pestana: 'Compras', antes, despues, desde: DESDE, insercion: INS })
  assert.equal(d.length, 2)
  assert.match(d[0], /Compras!L4/)
})

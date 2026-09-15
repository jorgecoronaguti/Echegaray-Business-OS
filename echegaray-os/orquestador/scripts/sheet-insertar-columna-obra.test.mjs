// LA INSERCIÓN DE «OBRA», CON DOBLES DE GOOGLE: aborta, compara valores Y fórmulas, y respeta el orden.
//
// El doble corre las fórmulas al insertar con un MAPA ESCRITO A MANO (lo que Google hace con cada fórmula
// de la fixture), no con `ajustarFormula`: si el script validara contra la misma función que produce lo
// esperado, nunca podría dar rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import { insertarColumnaObra, modoDeCorrida, reverificarColumnaObra, verificarEncabezado, ID, INSERCIONES, ROTULO } from './sheet-insertar-columna-obra.mjs'
import { DOLAR } from '../lib/insercion-obra-precondiciones.mjs'
import { COMPRAS_2508, COBRANZAS_1409 } from '../lib/encabezados-referencia.mjs'

const [COMPRAS, COBRANZAS] = INSERCIONES

/** Una pestaña mínima: la fila de rótulos en su lugar, dos filas de datos y una con fórmula a la derecha. */
function hojaDe(ins, encabezado, formula, valor) {
  const g = Array.from({ length: ins.filaEncabezado - 1 }, () => ['titulo'])
  g.push([...encabezado])
  g.push(encabezado.map((_, j) => `d1-${j}`))
  g.push(encabezado.map((_, j) => (j % 3 ? j * 10 : '')))
  const f = new Array(encabezado.length).fill('')
  const v = [...f]
  f[ins.indice + 3] = formula; v[ins.indice + 3] = valor
  return { formulas: [...g.map((r) => [...r]), f], valores: [...g.map((r) => [...r]), v] }
}

// Lo que Google deja en cada fórmula de la fixture después de insertar Compras L y Cobranzas H.
const GOOGLE = new Map([
  ['=SUM(O5:O6)', '=SUM(P5:P6)'],
  ['=K5*2', '=L5*2'],
  ['=SUM(Compras!O5:O6)+Cobranzas!C5', '=SUM(Compras!P5:P6)+Cobranzas!C5'],
  ["='Cobranzas'!K7", "='Cobranzas'!L7"],
])

/** Un doble de Google que inserta de verdad sobre las grillas en memoria y anota cada llamada. */
// El bloque del tipo de cambio: con el dólar declarado (paso 1b en verde) salvo que el caso lo rompa.
const BLOQUE_DOLAR = (declarado = 1480) => ({
  formulas: [['=GOOGLEFINANCE("CURRENCY:USDARS")'], [String(declarado || '')], ['=IF(C109<>"";C109;C108)'], ['=IF(C110<>"";C110;C109)']],
  valores: [[1505.95], [declarado || ''], [declarado || 1505.95], [declarado || 1505.95]],
})

function dobleDeGoogle({ encCompras = COMPRAS_2508, encCobranzas = COBRANZAS_1409, tocar = null, falla = null, dolar = 1480 } = {}) {
  const hojas = {
    Compras: hojaDe(COMPRAS, encCompras, '=SUM(O5:O6)', 30),
    Cobranzas: hojaDe(COBRANZAS, encCobranzas, '=K5*2', 20),
    CAJA: { formulas: [['=SUM(Compras!O5:O6)+Cobranzas!C5', '=TODAY()', 'texto'], ["='Cobranzas'!K7"]], valores: [[70, 46000, 'texto'], [9]] },
    Notas: { formulas: [['=A2'], ['x']], valores: [['x'], ['x']] },
  }
  const ids = { 1: 'Compras', 2: 'Cobranzas', 3: 'CAJA', 4: 'Notas' }
  const llamadas = []
  // TODO archivo que tocó la corrida. El ensayo sobre una copia vale por esto: una sola llamada que
  // se quedó con el id del archivo real escribiría el Sheet del dueño desde el ensayo.
  const archivos = new Set()
  let escrito = false
  return {
    llamadas, hojas, archivos,
    async getSheetMeta(fileId) {
      llamadas.push('meta'); archivos.add(fileId)
      return [...Object.entries(ids).map(([id, title]) => ({ title, sheetId: Number(id), rows: 100, cols: 50 })), { title: 'Gráfico', sheetId: 9 }]
    },
    async readSheetValues(fileId, rango, { render } = {}) {
      archivos.add(fileId)
      if (rango === DOLAR.rango) { llamadas.push('dolar'); return BLOQUE_DOLAR(dolar)[render === 'FORMULA' ? 'formulas' : 'valores'] }
      const p = /^'((?:[^']|'')+)'/.exec(rango)[1]
      const fila = /!A(\d+):BZ\d+$/.exec(rango)
      llamadas.push(fila ? `encabezado:${p}` : `leer:${p}:${render}`)
      if (falla?.({ p, render, escrito })) throw new Error(`503 al leer ${p}`)
      if (fila) return [hojas[p].valores[Number(fila[1]) - 1]]
      return (render === 'FORMULA' ? hojas[p].formulas : hojas[p].valores).map((f) => [...f])
    },
    async spreadsheetBatchUpdate(fileId, requests) {
      llamadas.push('escribir'); escrito = true; archivos.add(fileId)
      for (const r of requests) {
        const hoja = hojas[ids[r.insertDimension?.range.sheetId ?? r.updateCells.range.sheetId]]
        const grillas = [hoja.formulas, hoja.valores]
        if (r.insertDimension) {
          for (const g of grillas) for (const f of g) { if (f.length > r.insertDimension.range.startIndex) f.splice(r.insertDimension.range.startIndex, 0, '') }
        } else {
          for (const g of grillas) g[r.updateCells.range.startRowIndex][r.updateCells.range.startColumnIndex] = ROTULO
        }
      }
      for (const h of Object.values(hojas)) h.formulas = h.formulas.map((f) => f.map((c) => GOOGLE.get(c) ?? c))
      hojas.CAJA.valores[0][1] = 46001                    // TODAY() cambió entre las dos fotos: no es diferencia
      if (tocar) tocar(hojas)
      return {}
    },
  }
}

const correr = (google, { aplicar = true, precondiciones = [], correrPyl = null, id = undefined, ponerDesplegable = null } = {}) => insertarColumnaObra({
  google, aplicar, log: () => {}, correrPyl, ponerDesplegable, ...(id ? { id } : {}),
  verificarPrecondiciones: async () => { google.llamadas.push('precondiciones'); return precondiciones },
  guardar: (n) => { google.llamadas.push(`guardar:${n}`); return n },
  correrHuellas: async () => { google.llamadas.push('huellas') },
})
const hitos = (g) => g.llamadas.filter((x) => /^(precondiciones|encabezado|guardar|escribir|huellas|pyl|desplegable)/.test(x))

test('el encabezado real de hoy pasa el portón; «ORDEN DE  COMPRA» con doble espacio es el mismo rótulo', () => {
  assert.deepEqual(verificarEncabezado(COMPRAS_2508, COMPRAS), [])
  assert.deepEqual(verificarEncabezado(COBRANZAS_1409, COBRANZAS), [])
})

test('PRECONDICIONES: si una falla no lee el Sheet ni escribe — también en el dry', async () => {
  for (const aplicar of [true, false]) {
    const g = dobleDeGoogle()
    const r = await correr(g, { aplicar, precondiciones: ['echegaray-compras-sync.timer está active'] })
    assert.equal(r.paso, 'precondiciones')
    assert.deepEqual(g.llamadas, ['precondiciones'])
  }
})

test('sin verificador de precondiciones, o si el verificador explota, NO sigue', async () => {
  const g = dobleDeGoogle()
  const r = await insertarColumnaObra({ google: g, aplicar: true, log: () => {}, guardar: () => 'x', correrHuellas: async () => {} })
  assert.equal(r.paso, 'precondiciones')
  const r2 = await insertarColumnaObra({ google: g, aplicar: true, log: () => {}, guardar: () => 'x', correrHuellas: async () => {}, verificarPrecondiciones: async () => { throw new Error('sin bus') } })
  assert.match(r2.detalle.join(), /sin bus/)
  assert.ok(!g.llamadas.includes('meta'))
})

test('ABORTA si el encabezado no coincide — y no llama a ninguna escritura', async () => {
  const ya = [...COMPRAS_2508.slice(0, 11), 'Obra', ...COMPRAS_2508.slice(11)]
  const g = dobleDeGoogle({ encCompras: ya })
  const r = await correr(g)
  assert.equal(r.paso, 'encabezado')
  assert.match(r.detalle.join(' '), /esperaba «Concepto» y dice «Obra»/)
  assert.ok(!g.llamadas.includes('escribir') && !g.llamadas.includes('huellas'))
})

test('el dry lee las fórmulas de TODO el archivo y fotografía también las pestañas que citan Compras/Cobranzas', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { aplicar: false })
  assert.equal(r.paso, 'dry')
  assert.ok(!g.llamadas.includes('escribir'))
  for (const t of ['Compras', 'Cobranzas', 'CAJA', 'Notas']) assert.ok(g.llamadas.includes(`leer:${t}:FORMULA`), t)
  assert.ok(g.llamadas.includes('leer:CAJA:UNFORMATTED_VALUE'), 'CAJA cita Compras: se fotografían sus valores')
  assert.ok(!g.llamadas.includes('leer:Notas:UNFORMATTED_VALUE'), 'Notas no cita: no hace falta')
  assert.ok(!g.llamadas.some((x) => x.startsWith('leer:Gráfico')), 'una hoja sin grilla no se lee')
})

test('el orden es precondiciones → encabezado → foto → insertar → releer y comparar → huellas → foto nueva', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g)
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(hitos(g), ['precondiciones', 'encabezado:Compras', 'encabezado:Cobranzas', 'guardar:antes', 'escribir', 'huellas', 'guardar:despues'])
  assert.ok(g.llamadas.slice(g.llamadas.indexOf('escribir')).includes('leer:CAJA:FORMULA'), 'relee la pestaña que cita')
  assert.equal(g.hojas.Compras.valores[2][11], ROTULO)
  assert.equal(g.hojas.Cobranzas.valores[3][7], ROTULO)
})

test('UNA celda de valor cambiada frena antes de las huellas y deja el reporte con las dos fotos', async () => {
  const g = dobleDeGoogle({ tocar: (h) => { h.Compras.valores[3][20] = 'pisada' } })
  const r = await correr(g)
  assert.equal(r.paso, 'comparacion')
  assert.equal(r.detalle.length, 1)
  assert.match(r.detalle[0], /^Compras!U4 \[valor\]/)
  assert.ok(!g.llamadas.includes('huellas'))
  assert.ok(g.llamadas.includes('guardar:despues-con-diferencias') && g.llamadas.includes('guardar:reporte-falla'))
})

test('EL DEFECTO: una fórmula mal corrida en la pestaña que CITA, con el mismo valor, frena', async () => {
  const g = dobleDeGoogle({ tocar: (h) => { h.CAJA.formulas[1][0] = "='Cobranzas'!K7" } })
  const r = await correr(g)
  assert.equal(r.paso, 'comparacion')
  assert.deepEqual(r.detalle, [`CAJA!A2 [fórmula] "='Cobranzas'!L7" → "='Cobranzas'!K7"`])
  assert.ok(!g.llamadas.includes('huellas'))
})

test('EL DEFECTO: una fórmula mal corrida en la propia Compras, con el mismo valor, frena', async () => {
  const g = dobleDeGoogle({ tocar: (h) => { h.Compras.formulas[5][15] = '=SUM(O5:O6)' } })
  const r = await correr(g)
  assert.equal(r.paso, 'comparacion')
  assert.match(r.detalle.join(), /Compras!P6 \[fórmula\] "=SUM\(P5:P6\)" → "=SUM\(O5:O6\)"/)
})

test('LECTURA: si falla una lectura antes de insertar, NO inserta', async () => {
  const g = dobleDeGoogle({ falla: ({ p, render }) => p === 'CAJA' && render === 'UNFORMATTED_VALUE' })
  const r = await correr(g)
  assert.equal(r.paso, 'lectura')
  assert.match(r.detalle[0], /503 al leer CAJA/)
  assert.ok(!g.llamadas.includes('escribir'))
})

test('LECTURA: si la relectura falla con la columna ya insertada, reporta y NO corre huellas', async () => {
  const g = dobleDeGoogle({ falla: ({ p, escrito }) => escrito && p === 'Notas' })
  const g2 = dobleDeGoogle({ falla: ({ p, escrito }) => escrito && p === 'CAJA' })
  assert.equal((await correr(g)).ok, true, 'Notas no se relee: no cita')
  const r = await correr(g2)
  assert.equal(r.paso, 'relectura')
  assert.ok(!g2.llamadas.includes('huellas'))
  assert.ok(g2.llamadas.includes('guardar:reporte-falla'))
})

test('--reverificar compara otra vez sin escribir', async () => {
  const g = dobleDeGoogle()
  const antes = JSON.parse(JSON.stringify({ Compras: g.hojas.Compras, Cobranzas: g.hojas.Cobranzas, CAJA: g.hojas.CAJA }))
  await g.spreadsheetBatchUpdate('x', INSERCIONES.flatMap((ins, i) => [
    { insertDimension: { range: { sheetId: i + 1, startIndex: ins.indice } } },
    { updateCells: { range: { sheetId: i + 1, startRowIndex: ins.filaEncabezado - 1, startColumnIndex: ins.indice } } },
  ]))
  const n = g.llamadas.length
  const r = await reverificarColumnaObra({ google: g, antes, verificarPrecondiciones: async () => [], log: () => {} })
  assert.equal(r.ok, true, JSON.stringify(r.detalle))
  assert.ok(!g.llamadas.slice(n).includes('escribir'))
})

// ═══ EL P&L (15/09/2026) ═══
// El P&L importa Compras como texto y suma por letra: Google no lo ajusta. Se PLANEA antes de insertar
// (un plan con dudas, o que no se pudo leer, no inserta) y se APLICA después de las huellas.

const pyl = (google, { pylOk = true, explota = false } = {}) => async (o) => {
  google.llamadas.push(`pyl:${o.aplicar ? 'aplicar' : 'plan'}`)
  if (explota) throw new Error('P&L: 500')
  return { ok: pylOk, paso: pylOk ? 'fin' : 'plan', detalle: pylOk ? [] : ['X!C3: duda'] }
}

test('con P&L: plan antes de insertar, aplicar después de las huellas', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { correrPyl: pyl(g) })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(hitos(g).filter((x) => !/^(precond|encabezado)/.test(x)), ['guardar:antes', 'pyl:plan', 'escribir', 'huellas', 'pyl:aplicar', 'guardar:despues'])
})

test('un plan del P&L con dudas, o que no se pudo leer, NO inserta la columna', async () => {
  for (const o of [{ pylOk: false }, { explota: true }]) {
    const g = dobleDeGoogle()
    const r = await correr(g, { correrPyl: pyl(g, o) })
    assert.equal(r.paso, 'pyl-plan')
    assert.ok(!g.llamadas.includes('escribir'))
    assert.equal(g.hojas.Compras.valores[2][11], COMPRAS_2508[11], 'Compras sigue como estaba')
  }
})

test('el dry sólo planea el P&L', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { aplicar: false, correrPyl: pyl(g) })
  assert.equal(r.paso, 'dry')
  assert.ok(g.llamadas.includes('pyl:plan') && !g.llamadas.includes('pyl:aplicar'))
})

// ═══ EL ENSAYO SOBRE UNA COPIA, Y EL DESPLEGABLE (15/09/2026) ═══

test('modoDeCorrida: sin --copia se corre contra el archivo real', () => {
  assert.deepEqual(modoDeCorrida(['node', 'x.mjs', '--aplicar']), { copia: false, id: ID })
})

test('EL DEFECTO QUE ESTO CIERRA: --copia con el id del archivo REAL aborta', () => {
  assert.throws(() => modoDeCorrida(['--copia', ID, '--aplicar']), /archivo REAL/)
  assert.throws(() => modoDeCorrida(['--copia']), /necesita el id/)
  assert.throws(() => modoDeCorrida(['--copia', '--aplicar']), /necesita el id/)
})

test('--copia con otro id corre sobre ese archivo', () => {
  assert.deepEqual(modoDeCorrida(['--copia', 'COPIA-1', '--aplicar']), { copia: true, id: 'COPIA-1' })
})

test('EL DEFECTO: con un id de copia, NINGUNA llamada toca el archivo real', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { id: 'COPIA-1' })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual([...g.archivos], ['COPIA-1'])
})

test('sin --copia, todas las llamadas van al archivo real', async () => {
  const g = dobleDeGoogle()
  await correr(g)
  assert.deepEqual([...g.archivos], [ID])
})

const desplegable = (google, { ok = true } = {}) => async () => {
  google.llamadas.push('desplegable')
  return { ok, paso: ok ? 'fin' : 'relectura', detalle: ok ? [] : ['Compras!L4:L: la celda no tiene ninguna validación'] }
}

test('el desplegable se pone DESPUÉS de insertar y ANTES de comparar', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { ponerDesplegable: desplegable(g) })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual(hitos(g), ['precondiciones', 'encabezado:Compras', 'encabezado:Cobranzas', 'guardar:antes', 'escribir', 'desplegable', 'huellas', 'guardar:despues'])
})

test('EL DEFECTO: si el desplegable no queda puesto, la comparación y las huellas CORREN igual pero la corrida NO cierra', async () => {
  const g = dobleDeGoogle()
  const r = await correr(g, { ponerDesplegable: desplegable(g, { ok: false }) })
  assert.equal(r.ok, false)
  assert.equal(r.paso, 'desplegable')
  assert.match(r.detalle.join(), /no tiene ninguna validación/)
  assert.ok(g.llamadas.includes('huellas'), 'la columna quedó bien insertada: las huellas se corren')
  assert.ok(g.llamadas.includes('guardar:despues'), 'la foto nueva se guarda igual')
})

test('el dry NO pone el desplegable: todavía no hay columna donde ponerlo', async () => {
  const g = dobleDeGoogle()
  await correr(g, { aplicar: false, ponerDesplegable: desplegable(g) })
  assert.ok(!g.llamadas.includes('desplegable'))
})

test('EL DEFECTO: con el dólar sin clavar NO se fotografía ni se inserta — arrastraría cien valores', async () => {
  const g = dobleDeGoogle({ dolar: 0 })
  const r = await correr(g)
  assert.equal(r.paso, 'tipo-de-cambio')
  assert.match(r.detalle.join(), /cuelga de GOOGLEFINANCE/)
  assert.ok(!g.llamadas.includes('escribir'))
  assert.ok(!g.llamadas.some((x) => x.startsWith('guardar')), 'ni siquiera saca la foto previa')
})

test('el paso 1b corre entre el encabezado y la foto, también en el dry', async () => {
  const g = dobleDeGoogle()
  await correr(g, { aplicar: false })
  const i = g.llamadas.indexOf('dolar')
  assert.ok(i > g.llamadas.indexOf('encabezado:Cobranzas'))
  assert.ok(i < g.llamadas.indexOf('guardar:antes'))
})

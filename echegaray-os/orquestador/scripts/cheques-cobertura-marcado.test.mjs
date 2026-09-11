// EL MARCADO DE LA COLUMNA M, CONTRA UN GOOGLE DE MENTIRA. Nada de red, nada de escribir el Sheet.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// 13/08: la corrida entera moría con "me niego a escribir: la columna M de Cheques Emitidos tiene
// contenido que no reconozco". La causa era UNA celda —M132, una nota tipeada por una carga puntual
// vía API— y el guard era `zona.some(...)`: todo-o-nada. Los otros 105 cheques quedaron sin marca, y
// el calendario de CAJA sólo ve los marcados.
//
// Estos tests miran lo que se ESCRIBE, no lo que se calcula: los rangos que van al batchUpdateValues
// y los rangos que van al formato. Si alguien vuelve a escribir la ventana como un rango contiguo,
// el rango vuelve a incluir la fila ajena y se ponen rojos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { marcarInstrumentos } from './cheques-cobertura-sheet.mjs'
import { MARCAS } from '../lib/cheques-cobertura.mjs'
import { FILA_HDR, FILA_DATO0 } from '../lib/cheques-emitidos-geometria.mjs'
import { INSTRUMENTOS } from '../lib/cash-flow-lineas.mjs'

const CH = 'Cheques Emitidos'
const NOTA = 'módulo echeq del banco 06/08 · vence 25/08'

/** El cliente de Google, de mentira: registra lo que se le pide escribir y formatear. */
const fakeGoogle = (colM) => {
  const escrituras = []; const formatos = []
  return {
    escrituras,
    formatos,
    getSheetMeta: async () => ([
      { title: CH, sheetId: 1, rows: 400, cols: 20 },
      { title: 'Tarjeta de Credito', sheetId: 2, rows: 100, cols: 20 },
    ]),
    readSheetValues: async (_id, rango) => (rango.startsWith(CH) ? colM : []),
    batchUpdateValues: async (_id, data) => { escrituras.push(...data) },
    spreadsheetBatchUpdate: async (_id, reqs) => { formatos.push(...reqs) },
  }
}

/** 6 cheques a partir de FILA_DATO0; el de la fila `sucia` es el que tiene la nota al lado. */
const escenario = ({ sucias = [] } = {}) => {
  const cheques = Array.from({ length: 6 }, (_, i) => ({
    fila: FILA_DATO0 + i, proveedor: `Proveedor ${i}`, monto: 100000 + i, comprobante: `0038-0002587${i}`, debitado: 'No',
  }))
  const colM = []
  colM[FILA_HDR - 1] = ['Estado en el OS · al 01/08/2026']
  for (const f of sucias) colM[f - 1] = [NOTA]
  const datos = {
    enCompras: new Set(cheques.map((c) => c.comprobante.replace(/^0+|(?<=-)0+/g, ''))),
    cheques, tarjeta: [], pestanaCheques: CH,
    filasCh: FILA_DATO0 + 5, filasTj: 31,
  }
  const resp = { cheques: { inferidos: new Map() }, tarjeta: { inferidos: new Map() } }
  return { datos, resp, colM }
}

/** Corre el marcado capturando lo que grita por consola. */
const correr = async (colM, datos, resp) => {
  const google = fakeGoogle(colM)
  const dicho = []
  const warn = console.warn; const log = console.log
  console.warn = (...a) => dicho.push(a.join(' ')); console.log = (...a) => dicho.push(a.join(' '))
  try { await marcarInstrumentos(google, datos, resp) } finally { console.warn = warn; console.log = log }
  return { google, dicho: dicho.join('\n') }
}

/** Los rangos de valores escritos sobre la columna M del registro (sin el encabezado). */
const rangosDeMarcas = (google) => google.escrituras
  .map((e) => e.range).filter((r) => r.startsWith(`${CH}!M`) && !r.endsWith(`M${FILA_HDR}`))

test('la fila con la nota ajena se saltea y las demás se marcan igual', async () => {
  const sucia = FILA_DATO0 + 3
  const { datos, resp, colM } = escenario({ sucias: [sucia] })
  const { google, dicho } = await correr(colM, datos, resp)

  // DOS tramos con el hueco en el medio. Un solo rango `M27:M32` le pisaría la nota al dueño.
  assert.deepEqual(rangosDeMarcas(google), [
    `${CH}!M${FILA_DATO0}:M${sucia - 1}`,
    `${CH}!M${sucia + 1}:M${FILA_DATO0 + 5}`,
  ])
  const escritas = google.escrituras.filter((e) => rangosDeMarcas(google).includes(e.range))
  assert.equal(escritas.flatMap((e) => e.values).length, 5, 'se marcan los 5 cheques limpios')
  for (const v of escritas.flatMap((e) => e.values)) assert.equal(v[0], MARCAS.ok)

  // Y GRITA: la fila, el proveedor, el texto encontrado y la marca que no se escribió.
  assert.match(dicho, new RegExp(`fila\\s+${sucia}`))
  assert.match(dicho, /Proveedor 3/)
  assert.match(dicho, /módulo echeq/)
  assert.match(dicho, /SIN MARCAR/)
  assert.match(dicho, /1 SALTEADA/)
})

test('la fila salteada tampoco se formatea: lo que no se escribió no cambió de forma', async () => {
  const sucia = FILA_DATO0 + 3
  const { datos, resp, colM } = escenario({ sucias: [sucia] })
  const { google } = await correr(colM, datos, resp)
  // El formato de las marcas (TEXT + cuerpo 9) se aplica por tramo. Si volviera a ser un repeatCell
  // sobre la ventana entera, la celda del dueño quedaría repintada aunque su contenido sobreviva.
  const tocadas = google.formatos
    .filter((r) => r.repeatCell?.range?.startColumnIndex === 12)
    .flatMap((r) => {
      const { startRowIndex: a, endRowIndex: b } = r.repeatCell.range
      return Array.from({ length: b - a }, (_, i) => a + i + 1) // a 1-based
    })
  assert.ok(!tocadas.includes(sucia), `la fila ${sucia} no se puede formatear: no es nuestra`)
  assert.ok(tocadas.includes(FILA_DATO0) && tocadas.includes(FILA_DATO0 + 5), 'las propias sí')
})

test('sin ninguna fila ajena se escribe un solo tramo corrido', async () => {
  const { datos, resp, colM } = escenario()
  const { google, dicho } = await correr(colM, datos, resp)
  assert.deepEqual(rangosDeMarcas(google), [`${CH}!M${FILA_DATO0}:M${FILA_DATO0 + 5}`])
  assert.ok(!/SALTEADA/.test(dicho))
})

test('si la columna se llenó de contenido ajeno, ahí sí aborta y dice dónde mirar', async () => {
  const sucias = [0, 1, 2, 3, 4, 5].map((i) => FILA_DATO0 + i)
  const { datos, resp, colM } = escenario({ sucias })
  const google = fakeGoogle(colM)
  await assert.rejects(
    () => marcarInstrumentos(google, datos, resp),
    (e) => /me niego a escribir/.test(e.message) && new RegExp(`M${FILA_DATO0}=`).test(e.message),
  )
  assert.equal(google.escrituras.length, 0, 'un aborto no puede haber escrito nada antes')
})

test('la marca propia de una corrida anterior no es contenido ajeno: se re-marca', async () => {
  const { datos, resp, colM } = escenario()
  colM[FILA_DATO0 + 1] = [MARCAS.falta] // el cheque ya estaba marcado y ahora su factura sí está
  const { google } = await correr(colM, datos, resp)
  assert.deepEqual(rangosDeMarcas(google), [`${CH}!M${FILA_DATO0}:M${FILA_DATO0 + 5}`])
  const vals = google.escrituras.find((e) => e.range === `${CH}!M${FILA_DATO0}:M${FILA_DATO0 + 5}`).values
  assert.equal(vals[1][0], MARCAS.ok, 'la marca vieja se pisa con la nueva, que es lo suyo')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EL CABLEADO DEL VACIADO DE SELLOS FÓSILES — pedido por la auditoría del 11/09/2026 (límite L7)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `sellosViejos` es pura y tiene sus doce casos en lib/marcado-columna.test.mjs. Lo que esos tests NO
// pueden ver es el CABLE: que `marcarInstrumentos` le pase la columna que releyó (`columna: zona`, en
// las dos llamadas a `estampar`) y que el vaciado llegue de verdad al batch. Sin este test, alguien
// saca `columna: zona` de una de las dos y ningún test se pone rojo — el auditor lo dijo así.
//
// La columna es la de «Tarjeta de Credito» con la forma VIVA del 11/09: fósiles en L2 y L23, sello
// fresco en L31 (`INSTRUMENTOS.tarjeta.filaCab`), marcas de fila debajo y una nota del dueño arriba.

const FC_TJ = INSTRUMENTOS.tarjeta.filaCab
const TJ = 'Tarjeta de Credito'

/** La columna L de la Tarjeta como está viva hoy. `limpia` simula la corrida siguiente. */
const columnaDeLaTarjeta = ({ limpia = false } = {}) => {
  const col = Array.from({ length: 60 }, () => [''])
  if (!limpia) {
    col[1] = ['Estado en el OS · al 24/7/2026']    // L2  — fósil
    col[22] = ['Estado en el OS · al 24/7/2026']   // L23 — fósil
  }
  col[5] = ['ojo con esta cuota']                  // L6  — del dueño, ARRIBA de la cabecera
  col[FC_TJ - 1] = ['Estado en el OS · al 10/9/2026'] // L31 — el sello de la corrida anterior
  col[FC_TJ + 1] = [MARCAS.ok]                     // una marca de fila, DEBAJO de la cabecera
  return col
}

/** Un Google de mentira que devuelve la columna de la Tarjeta y registra lo que se le pide escribir. */
const fakeGoogleTarjeta = (colL) => {
  const escrituras = []
  return {
    escrituras,
    getSheetMeta: async () => ([
      { title: CH, sheetId: 1, rows: 400, cols: 20 },
      { title: TJ, sheetId: 2, rows: 60, cols: 20 },
    ]),
    readSheetValues: async (_id, rango) => (rango.startsWith(TJ) ? colL : []),
    batchUpdateValues: async (_id, data) => { escrituras.push(...data) },
    spreadsheetBatchUpdate: async () => {},
  }
}

const escenarioTarjeta = () => ({
  datos: {
    enCompras: new Set(['1-1']), pestanaCheques: CH, cheques: [], filasCh: FILA_DATO0,
    tarjeta: [{ fila: FC_TJ + 2, proveedor: 'Starlink', monto: 524399, comprobante: '0001-00000001', debitado: '' }],
    filasTj: FC_TJ + 3,
  },
  resp: { cheques: { inferidos: new Map() }, tarjeta: { inferidos: new Map() } },
})

/** Los rangos de UNA celda a los que se les escribió cadena vacía: los vaciados. */
const vaciados = (google) => google.escrituras
  .filter((e) => !e.range.includes(':') && e.values?.length === 1 && e.values[0][0] === '')
  .map((e) => e.range)

const correrTarjeta = async (colL) => {
  const { datos, resp } = escenarioTarjeta()
  const google = fakeGoogleTarjeta(colL)
  const warn = console.warn; const log = console.log
  console.warn = () => {}; console.log = () => {}
  try { await marcarInstrumentos(google, datos, resp, { esBloqueada: async () => false }) } finally {
    console.warn = warn; console.log = log
  }
  return google
}

test('EL EFECTO: los fósiles L2 y L23 se vacían, y el sello de la corrida se estampa en su fila', async () => {
  const google = await correrTarjeta(columnaDeLaTarjeta())
  assert.deepEqual(vaciados(google), [`${TJ}!L2`, `${TJ}!L23`])
  // Los DOS instrumentos estampan su sello en la misma corrida; acá se mira el de la Tarjeta.
  const sellos = google.escrituras
    .filter((e) => String(e.values?.[0]?.[0] ?? '').startsWith('Estado en el OS')).map((e) => e.range)
  assert.ok(sellos.includes(`${TJ}!L${FC_TJ}`), `el sello nuevo va a la cabecera de HOY; se escribieron ${sellos}`)
})

test('NUNCA el sello de la corrida, NUNCA la nota del dueño, NUNCA lo de abajo de la cabecera', async () => {
  const v = vaciados(await correrTarjeta(columnaDeLaTarjeta()))
  assert.ok(!v.includes(`${TJ}!L${FC_TJ}`), 'vaciar el sello vigente es el defecto opuesto')
  assert.ok(!v.includes(`${TJ}!L6`), 'la nota del dueño arriba de la cabecera se queda')
  assert.ok(!v.includes(`${TJ}!L${FC_TJ + 2}`), 'una marca de fila no es un sello')
})

test('IDEMPOTENTE: con la columna ya limpia no se propone ningún vaciado', async () => {
  assert.deepEqual(vaciados(await correrTarjeta(columnaDeLaTarjeta({ limpia: true }))), [])
})

test('UNA PESTAÑA CANDADA NO SE TOCA: ni las marcas ni los fósiles de su columna', async () => {
  const { datos, resp } = escenarioTarjeta()
  const google = fakeGoogleTarjeta(columnaDeLaTarjeta())
  const warn = console.warn; const log = console.log
  console.warn = () => {}; console.log = () => {}
  try { await marcarInstrumentos(google, datos, resp, { esBloqueada: async () => true }) } finally {
    console.warn = warn; console.log = log
  }
  assert.deepEqual(google.escrituras, [], 'con candado no se escribe una sola celda')
})

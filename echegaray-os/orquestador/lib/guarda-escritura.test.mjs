import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { nombreTab, esProtegible, tabsProtegibles, separarPermitido, separarRequests, gridVacia, protegerVacioSobreLleno, guardarEscritura, evaluarBloqueadas, guardarRequests, CLASE, clasificarRequest } from './guarda-escritura.mjs'
import { firmaDeGrid } from './firma-tab.mjs'

// ═══ DOBLE DE LA BASE — se registra ACÁ ARRIBA, antes de que nadie importe db.mjs ═══
//
// El portón importa `./db.mjs` de forma dinámica, adentro de evaluarBloqueadas, y no acepta un `query`
// inyectado. Interceptar ese único módulo alcanza para probar la decisión REAL: el candado
// (pestana-bloqueada.mjs) y la firma (firma-tab.mjs) corren de verdad, contra una base controlada. No se
// simula la decisión — se simula la base. Sin red, sin Postgres, sin Google.
//
// El estado por defecto es "sin base" (query lanza), que es exactamente el entorno de hoy: así los tests
// de más arriba no cambian de significado. Cada test de la sección ESCRITURA COMPARTIDA (abajo, con el
// porqué completo) arma la base que necesita con `baseFalsa()`.
const sinBase = async () => { throw new Error('sin base (default: igual que un worktree sin DATABASE_URL)') }
globalThis.__dobleDbGuarda = { query: sinBase }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dobleDbGuarda.query(...a)' }
  },
})

test('nombreTab: saca la pestaña de un rango A1', () => {
  assert.equal(nombreTab('Compras!A1:B2'), 'Compras')
  assert.equal(nombreTab('Compras!A1'), 'Compras')
  assert.equal(nombreTab("'Cheques Emitidos'!A5:M9"), 'Cheques Emitidos')
  assert.equal(nombreTab("'Tarjeta de Credito'!K10"), 'Tarjeta de Credito')
  assert.equal(nombreTab('CAJA!A5'), 'CAJA')
  // Rango sin pestaña → null (no se puede atribuir a una pestaña).
  assert.equal(nombreTab('A1:B2'), null)
  assert.equal(nombreTab(''), null)
  assert.equal(nombreTab(undefined), null)
})

test('nombreTab: una comilla escapada dentro del nombre', () => {
  assert.equal(nombreTab("'Obra ''X'''!A1"), "Obra 'X'")
})

test('esProtegible: los espejos _RAW no son de contenido', () => {
  assert.equal(esProtegible('Compras'), true)
  assert.equal(esProtegible('Cash Flow Semanal'), true)
  assert.equal(esProtegible('_BANCO_RAW'), false)
  assert.equal(esProtegible('_J_OBREROS'), false)
  assert.equal(esProtegible('_ARCA_RAW'), false)
  assert.equal(esProtegible(null), false)
  assert.equal(esProtegible(''), false)
})

test('tabsProtegibles: pestañas de contenido distintas, excluye espejos', () => {
  const data = [
    { range: 'Compras!A1:B2', values: [] },
    { range: 'Compras!C1', values: [] },
    { range: "'Cheques Emitidos'!A1", values: [] },
    { range: '_BANCO_RAW!A1', values: [] },
    { range: 'A1:B2', values: [] }, // sin pestaña
  ]
  assert.deepEqual(tabsProtegibles(data).sort(), ['Cheques Emitidos', 'Compras'])
})

test('separarPermitido: descarta los rangos de pestañas bloqueadas, deja pasar el resto y los espejos', () => {
  const data = [
    { range: 'Compras!A1', values: [['x']] },
    { range: "'Cheques Emitidos'!A1", values: [['y']] },
    { range: '_BANCO_RAW!A1', values: [['z']] },
  ]
  const { permitido, bloqueado } = separarPermitido(data, new Set(['Compras']))
  assert.deepEqual(permitido.map((d) => d.range), ["'Cheques Emitidos'!A1", '_BANCO_RAW!A1'])
  assert.deepEqual(bloqueado.map((d) => d.range), ['Compras!A1'])
})

test('separarPermitido: sin bloqueadas, pasa todo tal cual', () => {
  const data = [{ range: 'Compras!A1', values: [] }, { range: 'CAJA!A5', values: [] }]
  const { permitido, bloqueado } = separarPermitido(data, new Set())
  assert.equal(permitido.length, 2)
  assert.equal(bloqueado.length, 0)
})

// ═══ CLASIFICACIÓN DE REQUESTS (03/08) — el borrado también destruye ═══
//
// Las tres assertions que cambiaron de significado respecto de la versión anterior de este test, y por
// qué: `deleteDimension`, `mergeCells` y un `repeatCell` SIN máscara `fields` daban `null` (pasaban
// libres). Las dos primeras destruyen contenido —borrar filas es la operación más destructiva que existe;
// combinar un rango con datos descarta el valor de todas las celdas menos la ancla— y la tercera no se
// puede afirmar inofensiva sin la máscara. La assertion vieja de `deleteDimension` es literalmente el
// defecto que este cambio arregla: fijaba por escrito que borrar filas sobre una pestaña candada pasaba.

/** Atajo de lectura: ¿este request pasa por la guarda, y a qué pestañas se le atribuye? */
const clase = (req, dims) => { const c = clasificarRequest(req, dims); return { destructivo: c.clase === CLASE.DESTRUCTIVO, ids: c.sheetIds, todas: c.todas } }

test('clasificarRequest: escribir una celda destruye — y borrarla también', () => {
  // updateCells con valor / nota / pivot → destructivo (RESPETO-NOTAS, 27/07: una nota es del dueño).
  assert.deepEqual(clase({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue,userEnteredFormat' } }), { destructivo: true, ids: [7], todas: false })
  assert.deepEqual(clase({ updateCells: { range: { sheetId: 7 }, fields: 'note' } }), { destructivo: true, ids: [7], todas: false })
  assert.deepEqual(clase({ updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: '' }] }], fields: 'note' } }), { destructivo: true, ids: [7], todas: false })
  assert.deepEqual(clase({ updateCells: { start: { sheetId: 8 }, fields: 'note' } }), { destructivo: true, ids: [8], todas: false })
  assert.deepEqual(clase({ updateCells: { start: { sheetId: 9 }, fields: 'userEnteredValue' } }), { destructivo: true, ids: [9], todas: false })
  assert.equal(clase({ updateCells: { range: { sheetId: 7 }, fields: 'pivotTable' } }).destructivo, true)
  // updateCells sólo formato → pasa. Y "note" no se cuela por una subcadena (`footnotes`).
  assert.equal(clase({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredFormat.textFormat' } }).destructivo, false)
  assert.equal(clase({ updateCells: { range: { sheetId: 7 }, fields: 'footnotes' } }).destructivo, false)
  // copyPaste de fórmula/valor pisa el destino; de formato, no.
  assert.deepEqual(clase({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMULA' } }), { destructivo: true, ids: [3], todas: false })
  assert.equal(clase({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMAT' } }).destructivo, false)
  assert.deepEqual(clase({ pasteData: { coordinate: { sheetId: 4 } } }), { destructivo: true, ids: [4], todas: false })
  assert.deepEqual(clase({ appendCells: { sheetId: 5 } }), { destructivo: true, ids: [5], todas: false })
  // EL DEFECTO: los que BORRAN o DESPLAZAN. Antes pasaban libres los tres.
  assert.deepEqual(clase({ deleteDimension: { range: { sheetId: 1, dimension: 'ROWS', startIndex: 5, endIndex: 20 } } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ deleteRange: { range: { sheetId: 1 }, shiftDimension: 'ROWS' } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ deleteSheet: { sheetId: 1 } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ insertDimension: { range: { sheetId: 1 } } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ moveDimension: { source: { sheetId: 1 }, destinationIndex: 3 } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ sortRange: { range: { sheetId: 1 } } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ deleteDuplicates: { range: { sheetId: 1 } } }), { destructivo: true, ids: [1], todas: false })
  assert.deepEqual(clase({ trimWhitespace: { range: { sheetId: 1 } } }), { destructivo: true, ids: [1], todas: false })
  // mergeCells: combinar un rango con datos descarta el valor de todas menos la ancla. unmerge no.
  assert.deepEqual(clase({ mergeCells: { range: { sheetId: 1 } } }), { destructivo: true, ids: [1], todas: false })
  assert.equal(clase({ unmergeCells: { range: { sheetId: 1 } } }).destructivo, false)
  // repeatCell sin máscara: no se puede AFIRMAR que sea sólo formato → fail-closed.
  assert.equal(clase({ repeatCell: { range: { sheetId: 1 } } }).destructivo, true)
  assert.equal(clase({ repeatCell: { range: { sheetId: 1 }, fields: 'userEnteredFormat.backgroundColor' } }).destructivo, false)
  // repeatCell CON valor pisa un rango entero de una: era el otro agujero de la misma familia.
  assert.equal(clase({ repeatCell: { range: { sheetId: 1 }, cell: { userEnteredValue: { stringValue: 'x' } }, fields: 'userEnteredValue' } }).destructivo, true)
  // Apariencia y estructura que sólo agrega: pasan.
  for (const r of [{ addSheet: { properties: { title: 'Nueva' } } }, { appendDimension: { sheetId: 1, length: 10 } }, { updateBorders: { range: { sheetId: 1 } } }, { updateDimensionProperties: { range: { sheetId: 1 }, fields: 'pixelSize' } }, { addDimensionGroup: { range: { sheetId: 1 } } }]) {
    assert.equal(clase(r).destructivo, false, JSON.stringify(r))
  }
  assert.equal(clase(null).destructivo, false)
})

test('clasificarRequest: cutPaste protege el ORIGEN además del destino — vaciarlo también es borrar', () => {
  // Clasificarlo sólo por el destino (lo que hacía la versión anterior) dejaba el origen sin protección:
  // un cutPaste desde una pestaña candada hacia una libre le vaciaba las celdas al dueño.
  const c = clase({ cutPaste: { source: { sheetId: 7 }, destination: { sheetId: 8 }, pasteType: 'PASTE_NORMAL' } })
  assert.deepEqual(c.ids.sort(), [7, 8])
  assert.equal(c.destructivo, true)
  assert.equal(separarRequests([{ cutPaste: { source: { sheetId: 7 }, destination: { sheetId: 8 } } }], new Set([7])).bloqueados.length, 1, 'el ORIGEN candado lo frena')
  assert.equal(separarRequests([{ cutPaste: { source: { sheetId: 7 }, destination: { sheetId: 8 } } }], new Set([8])).bloqueados.length, 1, 'el DESTINO candado también')
})

test('clasificarRequest: un tipo desconocido o inatribuible le pega a TODAS (fail-closed)', () => {
  // El olvido que produjo este bug fue exactamente éste: un request que nadie clasificó pasó libre. Con
  // la lista blanca invertida, lo que no está enumerado entra por el lado seguro sin que nadie se acuerde.
  const inventado = clase({ requestQueGoogleAgregueEnDosAnios: { range: { sheetId: 4 } } })
  assert.equal(inventado.destructivo, true)
  assert.deepEqual(inventado.ids, [4], 'igual se le saca el sheetId para no frenar de más')
  // Sin ningún sheetId no se puede atribuir → todas.
  assert.deepEqual(clase({ findReplace: { allSheets: true, find: 'a', replacement: 'b' } }), { destructivo: true, ids: [], todas: true })
  assert.deepEqual(clase({ deleteEmbeddedObject: { objectId: 99 } }), { destructivo: true, ids: [], todas: true })
  // Un request `todas` se frena si hay CUALQUIER pestaña protegida, y pasa si no hay ninguna.
  const req = [{ findReplace: { allSheets: true, find: 'a', replacement: 'b' } }]
  assert.equal(separarRequests(req, new Set([7])).bloqueados.length, 1)
  assert.equal(separarRequests(req, new Set()).permitidos.length, 1)
})

test('clasificarRequest: achicar la grilla es un deleteDimension con otro nombre; agrandarla no', () => {
  // `updateSheetProperties{gridProperties.rowCount}` es la vía indirecta de borrar filas: bajar el
  // rowCount se lleva puestas las de abajo CON su contenido. Distinguir achicar de agrandar necesita el
  // tamaño actual (getSheetMeta) — sin él no se puede afirmar cuál de las dos es, así que se frena.
  const dims = new Map([[1, { rows: 500, cols: 26 }]])
  const achica = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 100 } }, fields: 'gridProperties.rowCount' } }
  const agranda = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 900 } }, fields: 'gridProperties.rowCount' } }
  assert.equal(clase(achica, dims).destructivo, true)
  assert.equal(clase(agranda, dims).destructivo, false)
  assert.equal(clase(achica, null).destructivo, true, 'sin el tamaño actual: fail-closed')
  assert.equal(clase(agranda, null).destructivo, true, 'sin el tamaño actual: fail-closed aunque agrande')
  // Congelar filas y pintar la pestaña siguen pasando libres: `frozenRowCount` no es `rowCount`.
  assert.equal(clase({ updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties.frozenRowCount' } }, dims).destructivo, false)
  assert.equal(clase({ updateSheetProperties: { properties: { sheetId: 1, tabColor: {} }, fields: 'tabColor' } }, dims).destructivo, false)
  // Máscara combinada y máscara ancha.
  assert.equal(clase({ updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 900, columnCount: 10 } }, fields: 'gridProperties(rowCount,columnCount)' } }, dims).destructivo, true, 'achica las columnas')
  assert.equal(clase({ updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 2 } }, fields: 'gridProperties' } }, dims).destructivo, true, 'máscara ancha: borra el rowCount que no declara')
})

test('separarRequests: descarta sólo lo destructivo a sheetIds bloqueados, deja la apariencia', () => {
  const reqs = [
    { updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue' } },              // contenido a 7 (bloqueado)
    { repeatCell: { range: { sheetId: 7 }, fields: 'userEnteredFormat.textFormat' } },   // formato a 7 → pasa
    { updateCells: { range: { sheetId: 8 }, fields: 'userEnteredValue' } },              // contenido a 8 (libre) → pasa
  ]
  const { permitidos, bloqueados } = separarRequests(reqs, new Set([7]))
  assert.equal(permitidos.length, 2)
  assert.equal(bloqueados.length, 1)
  assert.ok(bloqueados[0].updateCells.range.sheetId === 7)
})

// ═══ CINTURÓN "VACÍO SOBRE LLENO" (28/07, TGUARD) — defensa en profundidad, sin base ═══

test('gridVacia: reconoce una grilla sin contenido; el 0 y el texto SÍ son contenido', () => {
  assert.equal(gridVacia([]), true)
  assert.equal(gridVacia(undefined), true)
  assert.equal(gridVacia(null), true)
  assert.equal(gridVacia([[]]), true)
  assert.equal(gridVacia([['', ''], ['', null, undefined]]), true)
  assert.equal(gridVacia([['x']]), false)
  assert.equal(gridVacia([['', ''], ['', 0]]), false, 'el 0 es contenido')
  assert.equal(gridVacia([['', 'algo']]), false)
})

test('protegerVacioSobreLleno: grilla VACÍA sobre destino con datos → NO escribe (fail-closed, sin base)', async () => {
  // Reproduce el bug: un generador (sin DATABASE_URL) produce una grilla vacía que borraría la pestaña.
  let leyo = false
  const cliente = { async readSheetValues() { leyo = true; return [['Proveedor', 'Importe'], ['ARCOR', 1000]] } }
  const { data, protegidos } = await protegerVacioSobreLleno(cliente, 'ID', [{ range: 'Compras!A1:B2', values: [] }])
  assert.equal(data.length, 0, 'la escritura vacía se descarta')
  assert.equal(protegidos.length, 1)
  assert.equal(protegidos[0].range, 'Compras!A1:B2')
  assert.ok(leyo, 'releyó el destino para confirmar que tenía contenido')
  assert.match(protegidos[0].motivo, /vac/i)
})

test('protegerVacioSobreLleno: grilla NO vacía → pasa tal cual, NO relee (camino feliz intacto)', async () => {
  let leyo = false
  const cliente = { async readSheetValues() { leyo = true; return [['viejo']] } }
  const data = [{ range: 'Compras!A1:B2', values: [['ARCOR', 1000]] }]
  const out = await protegerVacioSobreLleno(cliente, 'ID', data)
  assert.deepEqual(out.data, data, 'la escritura con contenido pasa idéntica')
  assert.equal(out.protegidos.length, 0)
  assert.equal(leyo, false, 'una escritura con contenido NUNCA se relee: cero costo')
})

test('protegerVacioSobreLleno: vacío sobre destino vacío → inofensivo, pasa', async () => {
  const cliente = { async readSheetValues() { return [] } }
  const { data, protegidos } = await protegerVacioSobreLleno(cliente, 'ID', [{ range: 'Compras!A1:B2', values: [] }])
  assert.equal(data.length, 1, 'vacío sobre vacío no destruye nada → se permite')
  assert.equal(protegidos.length, 0)
})

test('protegerVacioSobreLleno: si NO se puede releer el destino → fail-closed (no piso)', async () => {
  const cliente = { async readSheetValues() { throw new Error('sin red / sin permiso') } }
  const { data, protegidos } = await protegerVacioSobreLleno(cliente, 'ID', [{ range: 'Compras!A1:B2', values: [] }])
  assert.equal(data.length, 0, 'ante la duda no se escribe')
  assert.equal(protegidos.length, 1)
  assert.match(protegidos[0].motivo, /releer|fail-closed/i)
})

test('protegerVacioSobreLleno: mezcla — descarta la vacía-sobre-llena, conserva la de contenido', async () => {
  const cliente = { async readSheetValues(_id, range) { return range.startsWith('Compras') ? [['ARCOR', 1]] : [] } }
  const data = [
    { range: 'Compras!A1:B2', values: [] },            // vacía sobre lleno → se protege
    { range: 'CAJA!A1', values: [['saldo', 500]] },    // con contenido → pasa
  ]
  const { data: out, protegidos } = await protegerVacioSobreLleno(cliente, 'ID', data)
  assert.deepEqual(out.map((d) => d.range), ['CAJA!A1'])
  assert.deepEqual(protegidos.map((p) => p.range), ['Compras!A1:B2'])
})

test('guardarEscritura: sin base, grilla VACÍA sobre pestaña con datos → protegido, NO escribe', async () => {
  // El cinturón corre ANTES de candado/firma y no toca Postgres: aunque no haya DATABASE_URL, no piso.
  const cliente = { async readSheetValues() { return [['ARCOR', 1000]] } }
  const g = await guardarEscritura(cliente, 'ID', [{ range: 'Compras!A1:B2', values: [] }])
  assert.equal(g.data.length, 0, 'no queda nada para escribir → el caller devuelve protegido:true')
  assert.deepEqual(g.bloqueadas, ['Compras!A1:B2'])
  assert.ok(g.motivo, 'devuelve el motivo del bloqueo')
})

test('guardarEscritura: chequearVacio:false (clearValues/append) NO aplica el cinturón vacío', async () => {
  // clearValues es un borrado intencional: con chequearVacio:false, el cinturón no lo frena. Se lo deja
  // seguir hacia la guarda de candado/firma. Sin base, evaluarBloqueadas falla-cerrado (protege la
  // pestaña de contenido igual) — lo que se comprueba acá es que NO lo frenó el cinturón vacío.
  const cliente = { async readSheetValues() { throw new Error('no debería releer para el cinturón') } }
  const g = await guardarEscritura(cliente, 'ID', [{ range: 'Compras!A1:B2', values: [] }], { chequearVacio: false })
  // Sin base, la pestaña de contenido queda protegida por candado/firma (fail-closed), pero el motivo
  // del cinturón vacío NO aparece: la ruta fue la de candado/firma, no la del cinturón.
  assert.equal(g.motivo, undefined, 'no lo frenó el cinturón vacío-sobre-lleno')
})

test('RESPETO-NOTAS: borrar/escribir una NOTA sobre una pestaña candada se frena; el formato pasa', () => {
  // Reproduce el hueco cerrado (27/07): sheetId 7 está bajo control del dueño (candada o editada).
  // El limpiador de notas basura manda un updateCells{fields:'note', rows:[{values:[{note:''}]}]} que
  // borraría una nota humana. Antes cruzaba el portón (fields:'note' se clasificaba como no-contenido);
  // ahora es contenido y, sobre una pestaña bloqueada, se descarta. El formato a la misma pestaña pasa.
  const reqs = [
    { updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: '' }] }], fields: 'note' } }, // borrado de nota a 7 (bloqueada)
    { updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: 'nota del OS' }] }], fields: 'note' } }, // escritura de nota a 7 (bloqueada)
    { repeatCell: { range: { sheetId: 7 }, fields: 'userEnteredFormat.backgroundColor' } }, // formato a 7 → pasa
    { updateCells: { range: { sheetId: 8 }, fields: 'note' } }, // nota a 8 (pestaña libre) → pasa
  ]
  const { permitidos, bloqueados } = separarRequests(reqs, new Set([7]))
  assert.equal(bloqueados.length, 2)
  assert.ok(bloqueados.every((r) => r.updateCells.range.sheetId === 7 && /\bnote\b/.test(r.updateCells.fields)))
  assert.equal(permitidos.length, 2)
  assert.ok(permitidos.some((r) => r.repeatCell))                         // el formato de la pestaña candada pasa
  assert.ok(permitidos.some((r) => r.updateCells?.range.sheetId === 8))   // la nota a la pestaña libre pasa
})

// ═══ ESCRITURA COMPARTIDA (30/07) — la asistencia de JORNALES no puede morir por la firma ═══
//
// EL BUG, EN PRODUCCIÓN. La carga de asistencia escribe UNA celda ("presente hoy") en la pestaña
// `Obreros 26` del Sheet JORNALES. Esa pestaña la editan PERSONAS todos los días: no la genera el OS, la
// comparte con ellas. Como la firma de la pestaña entera (A1:BZ) SIEMPRE difería de la última que selló
// el OS, el portón la daba por "editada", la AUTO-CANDABA y descartaba la escritura. El jefe de obra veía
// "La pestaña de JORNALES está tomada y no se puede escribir ahora" — y, peor, el auto-candado la dejaba
// muerta para siempre: ni siquiera al día siguiente entraba una jornada.
//
// LA DISTINCIÓN QUE FALTABA. La firma responde "¿reescribo esta pestaña que yo genero?". Es la pregunta
// correcta para un generador que pisa una pestaña entera, y la equivocada para una escritura QUIRÚRGICA
// de una celda sobre una pestaña ajena. Para esa clase de escritura la protección no es la firma: es el
// control de concurrencia POR CELDA que ya tiene registrarAsistencia (relee la celda destino, compara su
// huella con la del plan y aborta TODA la operación si algo cambió). Es más fuerte, no más débil: la
// firma sólo dice "alguien tocó la pestaña"; la huella dice "cambió justo la celda que voy a escribir".
//
// Lo que `compartida: true` NO afloja, y por eso está testeado abajo: el cinturón vacío-sobre-lleno, y el
// CANDADO EXPLÍCITO del dueño (si él tomó la pestaña, nadie escribe — su voluntad manda siempre).

/**
 * Arma la base falsa: qué pestañas están candadas y qué firma selló el OS. Devuelve el registro de los
 * EFECTOS sobre la base (a quién se candó, qué firma se selló) — que es lo que permite afirmar que algo
 * NO pasó. Una firma sellada que no es un sha256 real garantiza que la firma actual siempre difiere:
 * es el escenario permanente de JORNALES, donde una persona edita la pestaña todos los días.
 */
function baseFalsa({ candadas = [], candadasAuto = [], firmaSellada = null } = {}) {
  const registro = { candados: [], sellos: [] }
  globalThis.__dobleDbGuarda.query = async (sql, params = []) => {
    if (/insert into public\.sheet_pestanas_bloqueadas/i.test(sql)) { registro.candados.push(params[1]); return { rows: [] } }
    // `bloqueada_por` distingue el candado del DUEÑO del auto-candado que pone el OS al detectar por
    // firma que la pestaña cambió. La guarda lo consulta para decidir si `soloFilasVacias` puede aplicar.
    if (/select bloqueada_por from public\.sheet_pestanas_bloqueadas/i.test(sql)) {
      const pest = params[1]
      if (candadas.includes(pest)) return { rows: [{ bloqueada_por: 'dueño' }] }
      if (candadasAuto.includes(pest)) return { rows: [{ bloqueada_por: 'auto' }] }
      return { rows: [] }
    }
    if (/select pestana from public\.sheet_pestanas_bloqueadas/i.test(sql)) return { rows: [...candadas, ...candadasAuto].map((p) => ({ pestana: p })) }
    if (/select firma from public\.sheet_tab_firma/i.test(sql)) return { rows: firmaSellada ? [{ firma: firmaSellada }] : [] }
    if (/insert into public\.sheet_tab_firma/i.test(sql)) { registro.sellos.push(params[1]); return { rows: [] } }
    return { rows: [] }
  }
  return registro
}

/** Cliente de Sheets falso: devuelve siempre la misma grilla y anota cada lectura (rango + opciones). */
function clienteFalso(grid = [['Nombre', 'Ju 30'], ['PEREZ JUAN', 9]]) {
  const lecturas = []
  return { lecturas, async readSheetValues(_fileId, range, opts) { lecturas.push({ range, opts }); return grid } }
}

const FIRMA_VIEJA = 'firma-que-selló-el-OS-antes-de-que-la-tocaran'
const CELDA_ASISTENCIA = [{ range: "'Obreros 26'!R21", values: [[9]] }]

test('compartida: la firma de JORNALES SIEMPRE difiere (la editan a diario) y la asistencia igual entra', async (t) => {
  // EL BUG EXACTO. Si esto falla, el jefe de obra vuelve a ver "la pestaña está tomada" y la carga de
  // asistencia queda muerta: ninguna jornada del día entra al Sheet.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteFalso(), 'JORNALES', CELDA_ASISTENCIA, { compartida: true })
  assert.deepEqual(g.bloqueadas, [], 'la firma NO puede bloquear una pestaña que el OS comparte con personas')
  assert.equal(g.data.length, 1, 'la jornada se escribe')
  assert.deepEqual(g.data[0].values, [[9]])
})

test('compartida: NO auto-canda la pestaña — el auto-candado dejaba JORNALES muerta para siempre', async (t) => {
  // El auto-candado de firmaGuardia es la mitad más cara del bug: la primera carga fallaba, y a partir de
  // ahí la pestaña quedaba candada, así que TODAS las siguientes fallaban barato y sin diagnóstico.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const registro = baseFalsa({ firmaSellada: FIRMA_VIEJA })
  await guardarEscritura(clienteFalso(), 'JORNALES', CELDA_ASISTENCIA, { compartida: true })
  assert.deepEqual(registro.candados, [], 'nadie candó "Obreros 26": el OS no toma una pestaña que no es suya')
})

test('compartida: un candado EXPLÍCITO del dueño SÍ frena la asistencia — su voluntad manda siempre', async (t) => {
  // Que la firma no aplique no puede convertirse en una puerta trasera al candado: si el dueño tomó la
  // pestaña, ni la asistencia la escribe.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ candadas: ['Obreros 26'] })
  const g = await guardarEscritura(clienteFalso(), 'JORNALES', CELDA_ASISTENCIA, { compartida: true })
  assert.deepEqual(g.bloqueadas, ['Obreros 26'])
  assert.equal(g.data.length, 0, 'no se escribe una celda sobre una pestaña que el dueño tomó')
})

test('compartida: el cinturón vacío-sobre-lleno sigue vivo — una grilla vacía no borra una jornada cargada', async (t) => {
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const cliente = clienteFalso([[9]]) // el destino HOY tiene la jornada cargada
  const g = await guardarEscritura(cliente, 'JORNALES', [{ range: "'Obreros 26'!R21", values: [] }], { compartida: true })
  assert.equal(g.data.length, 0, 'la escritura vacía se descarta aunque la pestaña sea compartida')
  assert.deepEqual(g.bloqueadas, ["'Obreros 26'!R21"])
  assert.match(g.motivo, /vac/i)
})

test('compartida: NO sella la firma al terminar — el OS no es dueño de la pestaña de JORNALES', async (t) => {
  // Sellar sería peor que inútil: el OS se declararía autor de una pestaña que escriben las personas, y
  // la próxima edición humana quedaría "confirmada" contra una firma que nunca fue suya.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const registro = baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const cliente = clienteFalso()
  const g = await guardarEscritura(cliente, 'JORNALES', CELDA_ASISTENCIA, { compartida: true })
  assert.equal(g.data.length, 1, 'precondición: la escritura pasó, así que sellar() es el camino real')
  const lecturasAntes = cliente.lecturas.length
  await g.sellar()
  assert.deepEqual(registro.sellos, [], 'no se guarda ninguna firma de "Obreros 26"')
  assert.equal(cliente.lecturas.length, lecturasAntes, 'ni siquiera relee A1:BZ para sellar: cero costo')
})

test('compartida: ni se consulta la firma — no se relee A1:BZ de una pestaña que no se va a comparar', async (t) => {
  // Prueba que la firma se SALTEA, no que su resultado se ignore. Releer toda la pestaña para después
  // descartar la respuesta es cuota de API y latencia en cada marcada de asistencia.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const cliente = clienteFalso()
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const bloqueadas = await evaluarBloqueadas(cliente, 'JORNALES', ['Obreros 26'], { compartida: true })
  assert.equal(bloqueadas.size, 0)
  assert.equal(cliente.lecturas.filter((l) => /A1:BZ/.test(l.range)).length, 0, 'la firma no se calculó')
})

test('SIN compartida (default): la firma que difiere sigue bloqueando y auto-candando — el resto no afloja', async (t) => {
  // El contrapeso de todo lo de arriba: la corrección no puede debilitar a los generadores, que son
  // justamente los que pisan pestañas enteras y ya destruyeron el trabajo del dueño seis veces.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const registro = baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteFalso(), 'ID', [{ range: 'Compras!A5:B5', values: [['ARCOR', 1000]] }])
  assert.deepEqual(g.bloqueadas, ['Compras'], 'la editaste: el generador no la pisa')
  assert.equal(g.data.length, 0)
  assert.deepEqual(registro.candados, ['Compras'], 'y queda candada, como siempre')
})

// ═══ `soloFilasVacias` (03/08) — el APPEND que no puede pisar nada y sin embargo se bloqueaba ═══
//
// EL CASO MEDIDO contra el Sheet real: `cargar-comprobantes-compras.mjs` agregó un fajo de 7 comprobantes
// a "Compras" (filas 800..806, vacías, debajo de la última con datos). La firma de "Compras" difería —el
// dueño la había editado— y la guarda descartó la escritura entera. Las 7 filas quedaron vacías.
//
// Lo que estos tests fijan es el LÍMITE de la excepción, no su comodidad: se levanta sólo lo que el OS
// dedujo solo (firma / auto-candado), sólo sobre un destino RELEÍDO y confirmado vacío, y nunca sobre el
// candado del dueño ni cuando la relectura falla. Si alguno de estos cinco se pone verde por accidente,
// la excepción dejó de ser angosta y hay que revisarla: es la única puerta al candado que existe.

/**
 * Cliente de Sheets falso para el append: la pestaña entera (A1:BZ, la que mira la firma) SIEMPRE tiene
 * contenido —el dueño la usa—, mientras que el DESTINO del append devuelve lo que pida cada test.
 * `fallaDestino` simula la relectura que no se puede hacer (429, sin red, sin permiso).
 */
function clienteAppend(destino = [], { fallaDestino = false } = {}) {
  const lecturas = []
  return {
    lecturas,
    async readSheetValues(_fileId, range) {
      lecturas.push(range)
      if (/A1:BZ/.test(range)) return [['Compras', 'la pestaña que el dueño edita todos los días']]
      if (fallaDestino) throw new Error('429 / sin red: no pude releer el destino')
      return destino
    },
  }
}

const APPEND = [{ range: 'Compras!E800:E806', values: [['ARCOR'], ['YPF']] }]

test('soloFilasVacias: firma editada + destino VACÍO → la escritura entra (el append no pisa nada)', async (t) => {
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const cliente = clienteAppend([]) // filas 800..806: vacías
  const g = await guardarEscritura(cliente, 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 1, 'el fajo se escribe: abajo no había nada del dueño')
  assert.deepEqual(g.data[0].values, [['ARCOR'], ['YPF']])
  assert.deepEqual(g.bloqueadas, [], 'no queda nada bloqueado que reportar')
  assert.deepEqual(g.rescatadas, ['Compras'])
  assert.ok(cliente.lecturas.includes('Compras!E800:E806'), 'confirmó el vacío releyendo el destino, no confiando en el llamador')
})

test('soloFilasVacias: NO sella la firma de la pestaña rescatada — la edición del dueño sigue protegida', async (t) => {
  // Si sellara, el append borraría la evidencia de que el dueño editó "Compras" y la próxima corrida del
  // generador —esa que SÍ reescribe la pestaña entera— pasaría el control como si nada hubiera cambiado.
  // La excepción deja entrar el append; no le devuelve la pestaña al OS.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const registro = baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteAppend([]), 'ID', APPEND, { soloFilasVacias: true })
  await g.sellar()
  assert.deepEqual(registro.sellos, [], 'ninguna firma nueva de "Compras"')
})

test('soloFilasVacias: si el destino tiene UNA celda con algo → NO se escribe', async (t) => {
  // El caso peligroso: la fila calculada quedó vieja (alguien ya cargó ahí) y el append pisaría datos.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteAppend([['', ''], ['', 'ANOTACIÓN DEL DUEÑO']]), 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 0, 'ahí ya hay algo: la excepción no aplica')
  assert.deepEqual(g.bloqueadas, ['Compras'])
})

test('soloFilasVacias: si NO se puede releer el destino → falla CERRADO, no escribe', async (t) => {
  // "No pude confirmar que estaba vacío" no es "estaba vacío". Es la misma regla que el resto de la guarda.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteAppend([], { fallaDestino: true }), 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 0, 'ante la duda no se escribe')
  assert.deepEqual(g.bloqueadas, ['Compras'])
})

test('soloFilasVacias: una pestaña CANDADA A MANO sigue bloqueada aunque el destino esté vacío', async (t) => {
  // El candado es la voluntad DECLARADA del dueño sobre la pestaña entera ("es mía, no la toques"). No lo
  // levanta una heurística por más segura que sea: si esto se pone verde, la excepción dejó de ser angosta.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ candadas: ['Compras'] })
  const g = await guardarEscritura(clienteAppend([]), 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 0, 'la candaste vos: no entra ni un append')
  assert.deepEqual(g.bloqueadas, ['Compras'])
  assert.deepEqual(g.rescatadas, [])
})

test('soloFilasVacias: el AUTO-candado (lo dedujo el OS de la firma) sí se levanta sobre destino vacío', async (t) => {
  // Sin esto la excepción nacía muerta: `firmaGuardia` AUTO-CANDA la pestaña la primera vez que detecta la
  // edición, así que en la corrida siguiente el motivo ya no es "firma" sino "candado". Ese candado no lo
  // puso el dueño: lo dedujo el OS del mismo hecho (la firma difiere) que la excepción sí contempla.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ candadasAuto: ['Compras'] })
  const g = await guardarEscritura(clienteAppend([]), 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 1, 'un candado automático no es la voluntad declarada del dueño')
  assert.deepEqual(g.rescatadas, ['Compras'])
})

test('soloFilasVacias es OPT-IN: sin la bandera, el mismo append sobre destino vacío se bloquea', async (t) => {
  // El contrapeso: ningún generador hereda la excepción por existir. La pide quien sabe que agrega filas.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseFalsa({ firmaSellada: FIRMA_VIEJA })
  const g = await guardarEscritura(clienteAppend([]), 'ID', APPEND)
  assert.equal(g.data.length, 0)
  assert.deepEqual(g.bloqueadas, ['Compras'])
})

test('soloFilasVacias: sin base (fail-closed total) tampoco escribe — no se sabe si la candaste a mano', async () => {
  // El default del archivo es "sin base", igual que un worktree sin DATABASE_URL: ahí no se puede
  // distinguir un candado del dueño de una firma, así que la excepción no puede aplicar.
  const g = await guardarEscritura(clienteAppend([]), 'ID', APPEND, { soloFilasVacias: true })
  assert.equal(g.data.length, 0)
  assert.deepEqual(g.bloqueadas, ['Compras'])
})

// ═══ EL BORRADO PASA POR LA GUARDA, Y NO SE AUTO-BLINDA (03/08) ═══
//
// LOS DOS CASOS REALES, el mismo día contra el Sheet real. Se borraron 15 filas de "Jornales por
// Quincena" con `deleteDimension`: pasó sin control, cambió la firma de la pestaña, eso la AUTO-CANDÓ, y
// la escritura que COMPLETABA el trabajo quedó bloqueada — la pestaña a medio camino. Lo mismo en
// "Impuestos y Financieros": borrada la sección duplicada, la pestaña se auto-candó por el propio borrado
// y las filas que dependían de lo borrado quedaron en #REF! sin poder repararlas.
//
// Son dos defectos encadenados y los dos se prueban acá: (1) el borrado no pasaba por la guarda, (2) un
// cambio que la guarda AUTORIZÓ no re-sellaba la firma, así que el OS leía su propia escritura como una
// edición del dueño y se bloqueaba a sí mismo a mitad de una operación.

/** Base con firma VIVA: lo que se sella se puede volver a leer. Sin eso no se puede probar el re-sellado. */
function baseViva({ candadas = [], candadasAuto = [] } = {}) {
  const reg = { candados: [], firmas: new Map() }
  globalThis.__dobleDbGuarda.query = async (sql, params = []) => {
    if (/insert into public\.sheet_pestanas_bloqueadas/i.test(sql)) { reg.candados.push(params[1]); return { rows: [] } }
    if (/select bloqueada_por from public\.sheet_pestanas_bloqueadas/i.test(sql)) {
      const p = params[1]
      if (candadas.includes(p)) return { rows: [{ bloqueada_por: 'dueño' }] }
      if (candadasAuto.includes(p)) return { rows: [{ bloqueada_por: 'auto' }] }
      return { rows: [] }
    }
    if (/select pestana from public\.sheet_pestanas_bloqueadas/i.test(sql)) return { rows: [...candadas, ...candadasAuto].map((p) => ({ pestana: p })) }
    if (/select firma from public\.sheet_tab_firma/i.test(sql)) { const f = reg.firmas.get(params[1]); return { rows: f ? [{ firma: f }] : [] } }
    if (/insert into public\.sheet_tab_firma/i.test(sql)) { reg.firmas.set(params[1], params[2]); return { rows: [] } }
    return { rows: [] }
  }
  return reg
}

const TAB = 'Jornales por Quincena'
const SID = 3
/** 30 filas: 15 de encabezado+quincena buena y 15 duplicadas, que es lo que se borró de verdad. */
const GRID = Array.from({ length: 30 }, (_, i) => [`fila ${i}`, i * 100])
const BORRAR_15 = [{ deleteDimension: { range: { sheetId: SID, dimension: 'ROWS', startIndex: 15, endIndex: 30 } } }]

/**
 * Planilla falsa que se MODIFICA de verdad: el borrado se aplica sobre su grilla, así la firma cambia
 * como cambia en el Sheet real. Un doble que devolviera siempre la misma grilla no probaría nada — el
 * bug entero consiste en que la firma cambia por culpa del propio OS.
 */
function planillaFalsa(filas = GRID) {
  const estado = { grid: filas.map((f) => [...f]) }
  return {
    estado,
    async getSheetMeta() { return [{ sheetId: SID, title: TAB, rows: estado.grid.length, cols: 26 }] },
    async readSheetValues() { return estado.grid.map((f) => [...f]) },
    borrar(desde, hasta) { estado.grid.splice(desde, hasta - desde) },
  }
}

test('deleteDimension sobre una pestaña CANDADA POR EL DUEÑO: rechazado', async (t) => {
  // El corazón del defecto. Antes esto pasaba: borrar quince filas de una pestaña que el dueño tomó
  // cruzaba la guarda entera, mientras escribirle una fórmula a la misma pestaña se frenaba.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseViva({ candadas: [TAB] })
  const g = await guardarRequests(planillaFalsa(), 'ID', BORRAR_15)
  assert.equal(g.requests.length, 0, 'no queda nada que mandar → spreadsheetBatchUpdate devuelve protegido:true')
  assert.deepEqual(g.bloqueadas, [TAB])
})

test('deleteDimension sobre una pestaña LIBRE: pasa, y re-sella su propia escritura', async (t) => {
  // La otra mitad: la guarda no puede volverse un freno de mano. En una pestaña libre el borrado entra.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const reg = baseViva()
  const pl = planillaFalsa()
  reg.firmas.set(TAB, firmaDeGrid(pl.estado.grid)) // baseline: la última que escribió el OS
  const g = await guardarRequests(pl, 'ID', BORRAR_15)
  assert.equal(g.requests.length, 1, 'el borrado pasa')
  assert.deepEqual(g.bloqueadas, [])
  pl.borrar(15, 30) // el batch se aplica de verdad contra la planilla
  await g.sellar()
  assert.equal(reg.firmas.get(TAB), firmaDeGrid(pl.estado.grid), 'la firma sellada es la de DESPUÉS del borrado')
  assert.deepEqual(reg.candados, [], 'y nadie candó nada')
})

test('la operación de DOS PASOS (borrar y después escribir) se completa entera, sin auto-blindarse', async (t) => {
  // EL CASO EXACTO de "Jornales por Quincena" y de "Impuestos y Financieros". Si esto se pone rojo, el OS
  // vuelve a poder romper una pestaña y no poder arreglarla: el borrado se auto-canda y la escritura que
  // repara lo borrado queda afuera, con las filas dependientes en #REF!.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const reg = baseViva()
  const pl = planillaFalsa()
  reg.firmas.set(TAB, firmaDeGrid(pl.estado.grid))

  const paso1 = await guardarRequests(pl, 'ID', BORRAR_15)
  assert.equal(paso1.requests.length, 1, 'precondición: el borrado está autorizado')
  pl.borrar(15, 30)
  await paso1.sellar()

  const paso2 = await guardarEscritura(pl, 'ID', [{ range: `'${TAB}'!A16:B16`, values: [['TOTAL QUINCENA', 4500]] }])
  assert.deepEqual(paso2.bloqueadas, [], 'el OS reconoce su propio borrado en vez de leerlo como una edición tuya')
  assert.equal(paso2.data.length, 1, 'la escritura que COMPLETA el trabajo entra')
  assert.deepEqual(reg.candados, [], 'y la pestaña no quedó auto-candada por el borrado del propio OS')
})

test('el re-sellado NO levanta el candado del dueño: una pestaña candada no se toca ni se sella', async (t) => {
  // El límite del arreglo, y lo único que lo hace admisible: sólo se sella lo que la guarda AUTORIZÓ.
  // Si esto se pone verde al revés (aparece una firma nueva), el re-sellado se convirtió en un bypass.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  const reg = baseViva({ candadas: [TAB] })
  const pl = planillaFalsa()
  const g = await guardarRequests(pl, 'ID', [
    ...BORRAR_15,
    { updateDimensionProperties: { range: { sheetId: SID, dimension: 'COLUMNS' }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
  ])
  assert.equal(g.requests.length, 1, 'el borrado se frena; el ancho de columna pasa')
  assert.ok(g.requests[0].updateDimensionProperties)
  await g.sellar()
  assert.equal(reg.firmas.has(TAB), false, 'ninguna firma nueva para una pestaña que el dueño tomó')
})

test('un batch de pura apariencia no consulta nada: ni getSheetMeta, ni base, ni firma', async (t) => {
  // El contrapeso de costo: la guarda nueva es más ancha, no más cara. 106 repeatCell de formato por
  // corrida no pueden empezar a pagar una lectura de A1:BZ cada uno.
  t.after(() => { globalThis.__dobleDbGuarda.query = sinBase })
  baseViva()
  const cliente = { async getSheetMeta() { throw new Error('no debería pedir la meta') }, async readSheetValues() { throw new Error('no debería leer') } }
  const g = await guardarRequests(cliente, 'ID', [
    { repeatCell: { range: { sheetId: SID }, fields: 'userEnteredFormat.numberFormat' } },
    { updateBorders: { range: { sheetId: SID } } },
    { updateSheetProperties: { properties: { sheetId: SID, tabColor: {} }, fields: 'tabColor' } },
  ])
  assert.equal(g.requests.length, 3)
  assert.deepEqual(g.bloqueadas, [])
})

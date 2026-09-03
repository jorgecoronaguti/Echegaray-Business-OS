import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const estado = { huellas: [], caida: false, guardadas: [] }
registerHooks({
  load(url, context, next) {
    if (!url.endsWith('/orquestador/lib/db.mjs')) return next(url, context)
    return { format: 'module', shortCircuit: true, source: 'export const query = (...a) => globalThis.__dbFmt(...a)' }
  },
})
globalThis.__dbFmt = async (sql, params) => {
  if (estado.caida) throw new Error('sin base')
  const s = String(sql)
  if (/to_regclass/.test(s)) return { rows: [{ t: 'public.sheet_huella_formato' }] }
  if (/select rango_a1, tipo, huella/.test(s)) return { rows: estado.huellas }
  if (/insert into public\.sheet_huella_formato/.test(s)) { estado.guardadas.push(params); return { rows: [] } }
  return { rows: [] }
}

const { TIPO, claveDeFormato, decidirFormato, huellaDeRango, esFormatoVirgen, filtrarFormato, olvidarCacheFormato } = await import('./huella-formato.mjs')

const SID = 2
const TAB = 'CAJA'
const id2tab = new Map([[SID, TAB]])
const PINTAR = { repeatCell: { range: { sheetId: SID, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 2 }, cell: {}, fields: 'userEnteredFormat.backgroundColor' } }

const negrita = { textFormat: { bold: true } }
const fila = (f) => [{ formato: f }, { formato: f }]
const lecturaCon = (f) => ({ filas: [fila(f), fila(f)], anchos: [], congeladas: { filas: 0, columnas: 0 } })

test('claveDeFormato: reconoce lo que formatea, y no lo que escribe contenido', () => {
  assert.equal(claveDeFormato(PINTAR).tipo, TIPO.CELDA)
  assert.equal(claveDeFormato(PINTAR).rango, 'A1:B2')
  assert.equal(claveDeFormato({ mergeCells: { range: { sheetId: SID, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 } } }).tipo, TIPO.MERGE)
  assert.equal(claveDeFormato({ updateDimensionProperties: { range: { sheetId: SID, dimension: 'COLUMNS', startIndex: 1, endIndex: 4 }, fields: 'pixelSize' } }).tipo, TIPO.ANCHO)
  assert.equal(claveDeFormato({ updateSheetProperties: { properties: { sheetId: SID, tabColor: {} }, fields: 'tabColor' } }).tipo, TIPO.PESTANA)
  // Un updateCells CON valor es contenido, y lo decide la propiedad por celda, no ésta.
  assert.equal(claveDeFormato({ updateCells: { range: { sheetId: SID }, fields: 'userEnteredValue' } }), null)
  assert.equal(claveDeFormato({ addChart: {} }), null)
})

test('decidirFormato: las cinco ramas, y cuál falla cerrado', () => {
  assert.equal(decidirFormato({ huellaViva: null }).aplica, false)
  assert.equal(decidirFormato({ huellaViva: 'a', huellaGuardada: 'a' }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: 'a' }).aplica, false)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: true }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: false, virgen: true }).aplica, true)
  assert.equal(decidirFormato({ huellaViva: 'b', huellaGuardada: null, pestanaSinHuellas: false, virgen: false }).aplica, false)
})

test('huellaDeRango: dos formatos distintos no pueden dar la misma huella', () => {
  const a = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  const b = huellaDeRango(TIPO.CELDA, lecturaCon({ textFormat: { bold: false } }), PINTAR.repeatCell.range)
  assert.notEqual(a, b)
  assert.equal(huellaDeRango(TIPO.CELDA, null, PINTAR.repeatCell.range), null)
  assert.equal(esFormatoVirgen(TIPO.CELDA, lecturaCon(null), PINTAR.repeatCell.range), true)
  assert.equal(esFormatoVirgen(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range), false)
})

function cliente(lectura) {
  olvidarCacheFormato()
  return { async readSheetUserFormats() { return lectura } }
}

test('MUTACIÓN: el dueño cambió el diseño de ese rango → el formato NO se re-aplica', async () => {
  estado.caida = false; estado.guardadas = []
  // El OS dejó el rango con negrita y lo selló; hoy tiene otra cosa.
  const sellada = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  estado.huellas = [{ rango_a1: 'A1:B2', tipo: TIPO.CELDA, huella: sellada }]
  const r = await filtrarFormato(cliente(lecturaCon({ backgroundColor: { red: 1 } })), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [], 'se re-aplicó el formato sobre el diseño que el dueño cambió')
  assert.equal(r.respetadas.length, 1)
  assert.match(r.respetadas[0].causa, /lo cambiaste vos/)
})

test('el formato que dejé sigue igual: se re-aplica y se vuelve a sellar', async () => {
  estado.caida = false; estado.guardadas = []
  const sellada = huellaDeRango(TIPO.CELDA, lecturaCon(negrita), PINTAR.repeatCell.range)
  estado.huellas = [{ rango_a1: 'A1:B2', tipo: TIPO.CELDA, huella: sellada }]
  const r = await filtrarFormato(cliente(lecturaCon(negrita)), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [PINTAR])
  await r.sellar()
  assert.equal(estado.guardadas.length, 1)
  assert.deepEqual(estado.guardadas[0].slice(0, 4), ['FILE', TAB, 'A1:B2', TIPO.CELDA])
})

test('primera pasada sobre una pestaña sin huellas de formato: aplica y siembra', async () => {
  estado.caida = false; estado.huellas = []; estado.guardadas = []
  const r = await filtrarFormato(cliente(lecturaCon({ backgroundColor: { red: 1 } })), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(r.requests, [PINTAR])
})

test('sin base, o sin poder leer el formato vivo: no se re-aplica nada (fail-closed)', async () => {
  estado.caida = true
  const a = await filtrarFormato(cliente(lecturaCon(negrita)), 'FILE', [PINTAR], id2tab)
  assert.deepEqual(a.requests, [])
  estado.caida = false; estado.huellas = [{ rango_a1: 'otro', tipo: TIPO.CELDA, huella: 'x' }]
  olvidarCacheFormato()
  const b = await filtrarFormato({ async readSheetUserFormats() { throw new Error('429') } }, 'FILE', [PINTAR], id2tab)
  assert.deepEqual(b.requests, [])
  assert.match(b.respetadas[0].causa, /fail-closed/)
})

test('B7 — CINCO batches sobre la misma pestaña pagan UNA lectura, no cinco', async () => {
  // La promesa del encabezado («una lectura por pestaña») era por BATCH, y un generador manda varios.
  // Cada lectura es A1:BZ2000 = 156.000 celdas: cinco por pestaña × catorce pestañas es exactamente
  // el gasto que hace que alguien termine apagando la guarda.
  estado.caida = false; estado.huellas = []; estado.guardadas = []
  olvidarCacheFormato()
  let lecturas = 0
  const g = { async readSheetUserFormats() { lecturas++; return lecturaCon(negrita) } }
  for (let i = 0; i < 5; i++) await filtrarFormato(g, 'FILE', [PINTAR], id2tab)
  assert.equal(lecturas, 1, `pagó ${lecturas} lecturas de A1:BZ2000 para la misma pestaña`)
})

test('B7 — después de aplicar formato, el caché se invalida: el sello relee lo que quedó', async () => {
  estado.caida = false; estado.huellas = []; estado.guardadas = []
  olvidarCacheFormato()
  let lecturas = 0
  const g = { async readSheetUserFormats() { lecturas++; return lecturaCon(negrita) } }
  const r = await filtrarFormato(g, 'FILE', [PINTAR], id2tab)
  assert.equal(lecturas, 1)
  await r.sellar()
  assert.equal(lecturas, 2, 'el sello tiene que RELEER: hashear lo que se mandó sería validar el control contra su propia salida')
})

test('B7 — una lectura que FALLA no se cachea: la corrida siguiente reintenta', async () => {
  estado.caida = false; estado.huellas = [{ rango_a1: 'otro', tipo: TIPO.CELDA, huella: 'x' }]
  olvidarCacheFormato()
  let n = 0
  const g = { async readSheetUserFormats() { n++; if (n === 1) throw new Error('429'); return lecturaCon(null) } }
  const a = await filtrarFormato(g, 'FILE', [PINTAR], id2tab)
  assert.deepEqual(a.requests, [], 'con la lectura caída no se re-aplica nada')
  const b = await filtrarFormato(g, 'FILE', [PINTAR], id2tab)
  assert.equal(n, 2, 'el fallo quedó cacheado y la pestaña no se pudo formatear nunca más')
  assert.deepEqual(b.requests, [PINTAR], 'el rango está virgen: se aplica')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AGRANDAR LA GRILLA NO ES FORMATEAR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ (03/09/2026). El dueño, por enésima vez: «sigue estando mal lo de los gráficos de caja,
// cuando haces la corrida se actualiza y baja». Medido contra el Sheet real: los cuatro gráficos
// anclaban BIEN (filas 22, 37 y 52) y la hoja tenía 55 filas donde el layout necesita 68 — el
// editor vivo sube el último bloque hasta que entre y lo dibuja encima del anterior.
//
// El generador ya sabía arreglarlo (`requestDeAltoMinimo`), pero la guarda de formato clasificaba
// CUALQUIER `updateSheetProperties` como diseño de la pestaña y lo frenaba:
//   🎨 "CAJA"!*: no re-aplico el formato — ese rango ya tiene un formato que yo no puse.
// Agrandar la grilla no toca ninguna celda: agrega filas vacías al final. No es una decisión de
// diseño del dueño, es capacidad. `frozenRowCount`, `hideGridlines` y el resto SÍ lo son y siguen
// protegidos — por eso la excepción mira `fields`, no el tipo de request.

const SOLO_FILAS = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 68 } }, fields: 'gridProperties.rowCount' } }
const SOLO_COLS = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { columnCount: 30 } }, fields: 'gridProperties.columnCount' } }
const FILAS_Y_COLS = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 68, columnCount: 30 } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } }
const CONGELADAS = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { frozenRowCount: 4 } }, fields: 'gridProperties.frozenRowCount' } }
const MIXTO = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 68, frozenRowCount: 4 } }, fields: 'gridProperties.rowCount,gridProperties.frozenRowCount' } }

test('agrandar la grilla NO es formato: la guarda lo deja pasar', () => {
  assert.equal(claveDeFormato(SOLO_FILAS), null, 'rowCount solo agrega filas vacías al final: no es diseño')
  assert.equal(claveDeFormato(SOLO_COLS), null, 'columnCount idem')
  assert.equal(claveDeFormato(FILAS_Y_COLS), null, 'los dos juntos siguen siendo tamaño, no diseño')
})

test('lo que SÍ es diseño de la pestaña se sigue protegiendo', () => {
  assert.equal(claveDeFormato(CONGELADAS)?.tipo, TIPO.PESTANA, 'congelar filas es una decisión visual del dueño')
  assert.equal(claveDeFormato(CONGELADAS)?.rango, '*')
  assert.equal(claveDeFormato(MIXTO)?.tipo, TIPO.PESTANA,
    'un request que ADEMÁS toca el diseño se protege entero: la excepción es sólo para el tamaño puro')
})

test('el request real que arregla los gráficos de CAJA atraviesa la guarda', async () => {
  const { requestDeAltoMinimo } = await import('./caja-graficos.mjs')
  const req = requestDeAltoMinimo(749583421, 55)
  assert.equal(claveDeFormato(req), null, 'es el request que quedó frenado el 03/09 y dejó los gráficos pisados')
  const r = await filtrarFormato({ async readSheetUserFormats() { throw new Error('no debería leer') } }, 'FILE', [req], id2tab)
  assert.deepEqual(r.requests, [req], 'pasa entero, y sin gastar una lectura de formato')
  assert.deepEqual(r.respetadas, [])
})

test('la excepción NO abre la puerta a achicar la grilla', async () => {
  const { clasificarRequest, CLASE } = await import('./clasificar-request.mjs')
  const achicar = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 10 } }, fields: 'gridProperties.rowCount' } }
  // Esquiva la guarda de FORMATO igual que el de agrandar — son el mismo tipo de request…
  assert.equal(claveDeFormato(achicar), null)
  // …pero la que manda sobre el tamaño es la guarda ESTRUCTURAL, que sí mira el alto vivo.
  const dims = new Map([[1, { rows: 55, cols: 26 }]])
  assert.equal(clasificarRequest(achicar, dims).clase, CLASE.DESTRUCTIVO, 'de 55 a 10 filas borra 45 filas con lo que tengan')
  assert.equal(clasificarRequest(SOLO_FILAS, dims).clase, CLASE.INOCUO, 'de 55 a 68 no deja ninguna afuera')
  // Sin dimensiones no se puede afirmar nada: falla cerrado, y por eso el atajo de `guardarRequests`
  // no puede saltearse la lectura de meta para un request de tamaño.
  assert.equal(clasificarRequest(SOLO_FILAS, null).clase, CLASE.DESTRUCTIVO, 'sin el tamaño actual no se afirma que crezca')
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS TRES CONTROLES QUE FALTABAN (auditoría del 03/09/2026)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// El auditor mutó `if (!campos.length) return false` a `return true` y la suite quedó VERDE: el
// docblock declaraba fail-closed y ningún test lo probaba. Y el test de achique probaba el
// CLASIFICADOR, no el PORTÓN — que es donde el agujero estaba de verdad: `frenaRequest` sólo miraba
// pestañas candadas a mano, y la firma automática está apagada desde el 05/08.

test('sin `fields` no se afirma nada: la guarda protege por defecto', async () => {
  const { soloCambiaElTamanoDeLaGrilla } = await import('./huella-formato.mjs')
  const sinFields = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 68 } } } }
  assert.equal(soloCambiaElTamanoDeLaGrilla(sinFields), false, 'sin máscara no se puede saber qué toca')
  assert.equal(claveDeFormato(sinFields)?.tipo, TIPO.PESTANA, 'y por eso se protege como pestaña')
  assert.equal(soloCambiaElTamanoDeLaGrilla({ updateSheetProperties: { fields: '' } }), false, 'máscara vacía idem')
  assert.equal(soloCambiaElTamanoDeLaGrilla({ updateSheetProperties: { fields: '   ' } }), false, 'sólo espacios idem')
  assert.equal(soloCambiaElTamanoDeLaGrilla({ updateSheetProperties: { fields: ' gridProperties.rowCount ' } }), true,
    'pero los espacios alrededor de un campo válido no lo invalidan: se recorta')
})

test('EL PORTÓN frena el achique aunque la pestaña NO esté candada', async () => {
  const { frenaRequest, clasificarRequest } = await import('./guarda-escritura.mjs')
  const dims = new Map([[1, { rows: 68, cols: 26 }]])
  const achicar = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 10 } }, fields: 'gridProperties.rowCount' } }
  const agrandar = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 90 } }, fields: 'gridProperties.rowCount' } }
  // SIN candado: es el caso real — la firma automática está apagada, casi ninguna pestaña está candada.
  assert.equal(frenaRequest(clasificarRequest(achicar, dims), new Set()), true,
    'de 68 a 10 filas borra 58 filas con lo que tengan: se frena aunque nadie candó la pestaña')
  assert.equal(frenaRequest(clasificarRequest(agrandar, dims), new Set()), false,
    'agrandar no borra nada: sigue pasando, que es lo que arregla los gráficos de CAJA')
})

test('sin las dimensiones vivas tampoco se deja pasar un cambio de tamaño', async () => {
  const { frenaRequest, clasificarRequest } = await import('./guarda-escritura.mjs')
  const agrandar = { updateSheetProperties: { properties: { sheetId: 1, gridProperties: { rowCount: 90 } }, fields: 'gridProperties.rowCount' } }
  assert.equal(frenaRequest(clasificarRequest(agrandar, null), new Set()), true,
    'sin saber el alto actual no se puede afirmar que agranda: falla cerrado')
})

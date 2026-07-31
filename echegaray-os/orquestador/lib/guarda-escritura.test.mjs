import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { nombreTab, esProtegible, tabsProtegibles, separarPermitido, sheetIdDeRequestContenido, separarRequests, gridVacia, protegerVacioSobreLleno, guardarEscritura, evaluarBloqueadas } from './guarda-escritura.mjs'

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

test('sheetIdDeRequestContenido: sólo los requests que escriben VALORES cuentan', () => {
  // updateCells con userEnteredValue → contenido
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue,userEnteredFormat' } }), 7)
  // updateCells sólo formato → NO es contenido (nunca destruye datos del dueño)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredFormat.textFormat' } }), null)
  // updateCells que toca la NOTA → SÍ es contenido (RESPETO-NOTAS): una nota es del dueño y no se pisa
  // en pestaña candada/editada. Cubre escritura, borrado (rows:[{values:[{note:''}]}]) y note combinada.
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'note' } }), 7)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, rows: [{ values: [{ note: '' }] }], fields: 'note' } }), 7)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { start: { sheetId: 8 }, fields: 'note' } }), 8)
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'userEnteredFormat,note' } }), 7)
  // La palabra "note" no puede colarse por un nombre de campo que la contenga como subcadena.
  assert.equal(sheetIdDeRequestContenido({ updateCells: { range: { sheetId: 7 }, fields: 'footnotes' } }), null)
  // updateCells con start (no range) igual cuenta
  assert.equal(sheetIdDeRequestContenido({ updateCells: { start: { sheetId: 9 }, fields: 'userEnteredValue' } }), 9)
  // copyPaste de fórmula/valor → contenido; de formato → no
  assert.equal(sheetIdDeRequestContenido({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMULA' } }), 3)
  assert.equal(sheetIdDeRequestContenido({ copyPaste: { destination: { sheetId: 3 }, pasteType: 'PASTE_FORMAT' } }), null)
  // pasteData / appendCells → contenido
  assert.equal(sheetIdDeRequestContenido({ pasteData: { coordinate: { sheetId: 4 } } }), 4)
  assert.equal(sheetIdDeRequestContenido({ appendCells: { sheetId: 5 } }), 5)
  // formato/estructura puros → null (nunca se bloquean)
  assert.equal(sheetIdDeRequestContenido({ repeatCell: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ mergeCells: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ deleteDimension: { range: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido({ updateSheetProperties: { properties: { sheetId: 1 } } }), null)
  assert.equal(sheetIdDeRequestContenido(null), null)
})

test('separarRequests: descarta sólo los requests de contenido a sheetIds bloqueados, deja el formato', () => {
  const reqs = [
    { updateCells: { range: { sheetId: 7 }, fields: 'userEnteredValue' } }, // contenido a 7 (bloqueado)
    { repeatCell: { range: { sheetId: 7 } } },                              // formato a 7 → pasa
    { updateCells: { range: { sheetId: 8 }, fields: 'userEnteredValue' } }, // contenido a 8 (libre) → pasa
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
function baseFalsa({ candadas = [], firmaSellada = null } = {}) {
  const registro = { candados: [], sellos: [] }
  globalThis.__dobleDbGuarda.query = async (sql, params = []) => {
    if (/insert into public\.sheet_pestanas_bloqueadas/i.test(sql)) { registro.candados.push(params[1]); return { rows: [] } }
    if (/select pestana from public\.sheet_pestanas_bloqueadas/i.test(sql)) return { rows: candadas.map((p) => ({ pestana: p })) }
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

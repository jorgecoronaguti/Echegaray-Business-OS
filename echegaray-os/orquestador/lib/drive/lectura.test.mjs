// Lectura de identidad/almacenamiento. Hermético: cliente Google falso, 0 red.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearLectura, conversionSoportada, mimeDeFormato, esNativoGoogle } from './lectura.mjs'
import { CODIGO } from './errores.mjs'
import { MIME_CARPETA, PROP_IDEMPOTENCIA } from './referencia.mjs'

const SHEET = 'application/vnd.google-apps.spreadsheet'

/** Doble del cliente Google. `archivos` es el Drive de mentira, por ID. */
function falso(archivos, { urls = [] } = {}) {
  return {
    async getMeta(id) {
      const a = archivos[id]
      if (!a) { const e = new Error(`File not found: ${id}`); e.status = 404; throw e }
      return a
    },
    async listarCarpeta(id) { return Object.values(archivos).filter((a) => (a.parents || []).includes(id)) },
    async apiGetDrive(url) { urls.push(url); return { files: Object.values(archivos).filter((a) => !a.trashed) } },
    async listarRevisiones() { return [{ id: 'r1' }, { id: 'r2' }] },
    async descargarBytes() { return Buffer.from('bytes') },
    async exportarBytesComo() { return Buffer.from('pdf') },
  }
}

const CARPETA_VIVA = { id: 'cv', name: 'ADMINISTRACION', mimeType: MIME_CARPETA, trashed: false, parents: ['raiz'] }
const CARPETA_PAPELERA = { id: 'cp', name: 'BORRADA', mimeType: MIME_CARPETA, trashed: true, parents: ['raiz'] }
const HIJO = { id: 'h1', name: 'F931.pdf', mimeType: 'application/pdf', trashed: false, parents: ['cv'] }

test('UNA CARPETA EN LA PAPELERA NO SE LEE VACÍA: se dice que está en la papelera', async () => {
  // El defecto pagado: Drive contesta `files: []` sin error y el OS reporta "no hay nada".
  const l = crearLectura({ google: falso({ cp: CARPETA_PAPELERA }) })
  await assert.rejects(() => l.listarCarpeta('cp'), (e) => e.codigo === CODIGO.TRASHED)
})

test('listar una carpeta devuelve TAMBIÉN la carpeta: "vacía" y "no era esa" no se ven igual', async () => {
  const l = crearLectura({ google: falso({ cv: CARPETA_VIVA, h1: HIJO }) })
  const r = await l.listarCarpeta('cv')
  assert.equal(r.carpeta.file_id, 'cv')
  assert.equal(r.carpeta.name, 'ADMINISTRACION')
  assert.equal(r.count, 1)
  assert.equal(r.items[0].file_id, 'h1')
})

test('listar algo que no es carpeta es un argumento inválido, no una lista vacía', async () => {
  const l = crearLectura({ google: falso({ h1: HIJO }) })
  await assert.rejects(() => l.listarCarpeta('h1'), (e) => e.codigo === CODIGO.INVALID_ARGUMENT)
})

test('un id inexistente es NOT_FOUND, con el código, no un Error de Google crudo', async () => {
  const l = crearLectura({ google: falso({}) })
  await assert.rejects(() => l.referencia('no-existe'), (e) => e.codigo === CODIGO.NOT_FOUND)
  await assert.rejects(() => l.referencia(''), (e) => e.codigo === CODIGO.INVALID_ARGUMENT)
})

test('referenciaViva distingue "no existe" de "está en la papelera"', async () => {
  const l = crearLectura({ google: falso({ cp: CARPETA_PAPELERA }) })
  const ref = await l.referencia('cp')     // referencia() NO lo esconde
  assert.equal(ref.trashed, true)
  await assert.rejects(() => l.referenciaViva('cp'), (e) => e.codigo === CODIGO.TRASHED)
})

test('la query se ESCAPA: un cliente con apóstrofo no rompe la búsqueda', async () => {
  const urls = []
  const l = crearLectura({ google: falso({ h1: HIJO }, { urls }) })
  await l.buscarPorNombre("D'Angelo")
  const q = decodeURIComponent(urls[0].match(/[?&]q=([^&]+)/)[1])
  assert.ok(q.includes("name contains 'D\\'Angelo'"), q)
  assert.ok(q.includes('trashed = false'))
})

test('buscar sin ningún criterio NO lista el Drive entero: se rechaza', async () => {
  const l = crearLectura({ google: falso({}) })
  await assert.rejects(() => l.buscarPorMetadata({}), (e) => e.codigo === CODIGO.INVALID_ARGUMENT)
})

test('la búsqueda por clave de idempotencia consulta las properties del archivo', async () => {
  const urls = []
  const l = crearLectura({ google: falso({ h1: HIJO }, { urls }) })
  await l.porClaveDeIdempotencia('k-9')
  const q = decodeURIComponent(urls[0].match(/[?&]q=([^&]+)/)[1])
  assert.ok(q.includes(`properties has { key='${PROP_IDEMPOTENCIA}' and value='k-9' }`), q)
})

test('un nativo de Google no se descarga: se dice por qué, no se deja pegar el 403', async () => {
  const nativo = { id: 'sh', name: 'Cash Flow', mimeType: SHEET, trashed: false, parents: [] }
  const l = crearLectura({ google: falso({ sh: nativo }) })
  await assert.rejects(() => l.descargar('sh'), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION && /exportalo/.test(e.message))
})

test('una conversión que Drive no hace se rechaza ANTES de llamar a Drive', async () => {
  assert.equal(conversionSoportada(SHEET, 'application/pdf'), true)
  assert.equal(conversionSoportada(SHEET, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), false)
  assert.equal(conversionSoportada('application/pdf', 'application/pdf'), false) // un pdf no se exporta
  const l = crearLectura({ google: falso({ sh: { id: 'sh', name: 'x', mimeType: SHEET, trashed: false, parents: [] } }) })
  await assert.rejects(() => l.exportar('sh', 'pptx'), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION)
  const ok = await l.exportar('sh', 'pdf')
  assert.equal(ok.mime_type, 'application/pdf')
})

test('los alias de formato y el detector de nativos', () => {
  assert.equal(mimeDeFormato('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(mimeDeFormato('application/pdf'), 'application/pdf')
  assert.equal(esNativoGoogle(SHEET), true)
  assert.equal(esNativoGoogle('application/pdf'), false)
})

test('sin índice, la búsqueda semántica DICE que no puede: no devuelve vacío', async () => {
  const l = crearLectura({ google: falso({}) })
  await assert.rejects(() => l.buscarEnIndice('flujo de fondos'), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION)
})

// ─────────────────────────────────────────────────────────────────────────────
// «CONFIANZA ALTA» NO ERA «NO HAY AMBIGÜEDAD», Y UNA TOOL QUE ABRE ARCHIVOS LE CREÍA.
//
// `resolver()` de `drive-busqueda/` devuelve `alta` cuando queda UN candidato después de filtrar.
// Medido contra las 3.695 filas reales del índice: «Recibo 2026-05 Q2.pdf» daba `alta` con cero
// alternativas — y hay VEINTIDÓS archivos con ese nombre exacto, uno por empleado. `drive.navigate`
// abría el recibo de sueldo de una persona concreta y lo llamaba certeza.
//
// La degradación va acá y no en `drive-busqueda/`, que lo comparte el chat: el que no puede
// adivinar es el que ABRE el archivo. Un buscador puede proponer; abrir es decidir.

/** Índice de mentira: devuelve siempre el mismo ganador con confianza alta y sin alternativas. */
function indiceQueSiempreDiceAlta(nombre) {
  const fila = {
    drive_file_id: 'F1', name: nombre, nombre_norm: nombre.toLowerCase(),
    path: `/x/${nombre}`, path_norm: `/x/${nombre}`.toLowerCase(),
    tokens: nombre.toLowerCase(), mime_type: 'application/pdf', is_folder: false, tipo: 'pdf',
  }
  return {
    async filasVigentes() { return [fila] },
    aceptaciones() { return new Map() },
    fuentes() { return new Map() },
    estados() { return new Map() },
    alias() { return null },
  }
}

test('un nombre que se repite en el índice DEJA de ser confianza alta', async () => {
  const db = { async query() { return { rows: [{ n: 22 }] } } }
  const l = crearLectura({ google: falso({}), indice: indiceQueSiempreDiceAlta('Recibo 2026-05 Q2.pdf'), db })
  const r = await l.buscarEnIndice('Recibo 2026-05 Q2.pdf')
  assert.equal(r.homonimos, 22)
  assert.notEqual(r.confianza, 'alta', 'con 22 homónimos siguió diciendo que estaba seguro')
  assert.match(r.porQue ?? '', /22 archivos con el nombre exacto/)
})

test('un nombre único conserva su confianza: no se rompe el caso bueno', async () => {
  const db = { async query() { return { rows: [{ n: 1 }] } } }
  const l = crearLectura({ google: falso({}), indice: indiceQueSiempreDiceAlta('Flujo de Caja 2026.xlsx'), db })
  const r = await l.buscarEnIndice('Flujo de Caja 2026.xlsx')
  assert.equal(r.homonimos, 1)
  assert.equal(r.confianza, 'alta')
})

test('sin base no se INVENTA ni certeza ni duda: homonimos queda en null', async () => {
  // Y `drive.navigate` trata `null` como "no pude mirar", no como "es único": si el índice no se
  // puede consultar, la respuesta es no saber. Un control que no pudo mirar no dice «no está».
  const l = crearLectura({ google: falso({}), indice: indiceQueSiempreDiceAlta('X.pdf'), db: null })
  const r = await l.buscarEnIndice('X.pdf')
  assert.equal(r.homonimos, null)
  assert.equal(r.confianza, 'alta')
})

test('si el índice no se deja consultar, tampoco se inventa: se degrada a no saber', async () => {
  const db = { async query() { throw new Error('la base no contesta') } }
  const l = crearLectura({ google: falso({}), indice: indiceQueSiempreDiceAlta('X.pdf'), db })
  const r = await l.buscarEnIndice('X.pdf')
  assert.equal(r.homonimos, null, 'un error de base no puede leerse como "es único"')
})

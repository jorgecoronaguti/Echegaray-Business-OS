// EL ENLACE DE DRIVE PEGADO — el único punto donde un vínculo se puede romper en silencio.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// `vincularDocumento` guarda el id que salga de acá. Un id mal extraído NO falla al guardar: la fila
// entra, la pantalla dice "Vinculado" y el 404 aparece recién cuando alguien hace clic, semanas
// después, sin nadie que sepa de dónde salió. Todo lo que se pueda verificar del parseo tiene que
// verificarse acá, porque después de esta función ya no hay nada que lo detecte.
//
// Los tres modos de falla que cubre:
//   1. Extraer el id equivocado — `/drive/folders/<id>` comparte prefijo con el resto de las rutas
//      de drive.google.com, y un patrón mal ordenado devuelve el pedazo de al lado.
//   2. Confundir carpeta con archivo — la URL de una carpeta abierta como archivo da 404.
//   3. Aceptar algo que NO es de Drive — un enlace de Dropbox, OneDrive o una ruta cualquiera se
//      guardaría como si fuera un archivo de la obra.
//
// Se importa el .ts DE VERDAD (Node 24 saca los tipos solo). No una copia: una copia probaría la
// copia, y el archivo que corre en producción es el otro.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  etiquetaDeTipo, parsearReferenciaDrive, urlDeDrive,
} from '../../src/features/obras/services/driveUrl.ts'

const ID = '1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVw'
const ID_CARPETA = '1zZyYxXwWvVuUtTsSrRqQpPoOnNmMlLkK'

test('acepta el enlace de un ARCHIVO de Drive', () => {
  for (const url of [
    `https://drive.google.com/file/d/${ID}/view?usp=sharing`,
    `https://drive.google.com/file/d/${ID}/view`,
    `https://drive.google.com/file/d/${ID}/edit?usp=drive_link`,
    `drive.google.com/file/d/${ID}/view`,
  ]) {
    const r = parsearReferenciaDrive(url)
    assert.equal(r?.drive_file_id, ID, url)
    assert.equal(r?.tipo, 'archivo', url)
    // La URL de un `/file/d/` NO dice qué hay adentro: el mime tiene que quedar en null y no
    // adivinarse, o el rótulo de la tabla afirmaría algo que nadie miró.
    assert.equal(r?.mime_type, null, url)
  }
})

test('acepta el enlace de una CARPETA y la marca como carpeta', () => {
  for (const url of [
    `https://drive.google.com/drive/folders/${ID_CARPETA}`,
    `https://drive.google.com/drive/folders/${ID_CARPETA}?usp=drive_link`,
    `https://drive.google.com/drive/u/0/folders/${ID_CARPETA}`,
  ]) {
    const r = parsearReferenciaDrive(url)
    assert.equal(r?.drive_file_id, ID_CARPETA, url)
    assert.equal(r?.tipo, 'carpeta', url)
    assert.equal(r?.mime_type, 'application/vnd.google-apps.folder', url)
  }
})

test('acepta los nativos de docs.google.com y saca el mime de la URL', () => {
  const casos = [
    ['spreadsheets', 'application/vnd.google-apps.spreadsheet'],
    ['document', 'application/vnd.google-apps.document'],
    ['presentation', 'application/vnd.google-apps.presentation'],
  ]
  for (const [producto, mime] of casos) {
    const r = parsearReferenciaDrive(`https://docs.google.com/${producto}/d/${ID}/edit#gid=0`)
    assert.equal(r?.drive_file_id, ID, producto)
    assert.equal(r?.tipo, 'archivo', producto)
    assert.equal(r?.mime_type, mime, producto)
  }
})

test('acepta las formas viejas open?id= y uc?id=', () => {
  assert.equal(parsearReferenciaDrive(`https://drive.google.com/open?id=${ID}`)?.drive_file_id, ID)
  assert.equal(parsearReferenciaDrive(`https://drive.google.com/uc?export=download&id=${ID}`)?.drive_file_id, ID)
})

test('acepta el id pelado, y ahí SÍ manda el tipo que declaró la persona', () => {
  assert.deepEqual(parsearReferenciaDrive(ID), { drive_file_id: ID, tipo: 'archivo', mime_type: null })
  assert.deepEqual(parsearReferenciaDrive(`  ${ID_CARPETA}  `, 'carpeta'), {
    drive_file_id: ID_CARPETA, tipo: 'carpeta', mime_type: 'application/vnd.google-apps.folder',
  })
})

test('cuando la URL dice el tipo, la URL le gana al formulario', () => {
  // Pegar el enlace de una carpeta en el formulario de "vincular archivo" es equivocarse de
  // formulario, no de archivo. Si ganara el formulario, el vínculo se guardaría como archivo y el
  // clic abriría un 404.
  const r = parsearReferenciaDrive(`https://drive.google.com/drive/folders/${ID_CARPETA}`, 'archivo')
  assert.equal(r?.tipo, 'carpeta')
})

test('RECHAZA lo que no es de Drive', () => {
  for (const basura of [
    '',
    '   ',
    'no tengo el link',
    'https://www.dropbox.com/s/abc123def456ghi789/Contrato.pdf',
    'https://ecsas-my.sharepoint.com/personal/jorge/Documents/Planos.pdf',
    'https://ejemplo.com/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVw',
    // Alfabeto de id válido pero con punto: es un dominio, no un id.
    'drive.google.com',
    'C:/Obras/ARCOR/Contrato.pdf',
  ]) {
    assert.equal(parsearReferenciaDrive(basura), null, JSON.stringify(basura))
  }
})

test('un id pelado demasiado corto NO se acepta', () => {
  // "contrato" entra en el alfabeto base64url. Aceptarlo guardaría un vínculo roto sin un error.
  assert.equal(parsearReferenciaDrive('contrato'), null)
  assert.equal(parsearReferenciaDrive('planos-2026'), null)
})

test('la URL de apertura respeta el tipo — una carpeta como archivo da 404', () => {
  assert.equal(urlDeDrive(ID, 'archivo'), `https://drive.google.com/file/d/${ID}/view`)
  assert.equal(urlDeDrive(ID_CARPETA, 'carpeta'), `https://drive.google.com/drive/folders/${ID_CARPETA}`)
})

test('el rótulo de tipo sale del mime, y si no hay, de la extensión', () => {
  assert.equal(etiquetaDeTipo('carpeta', null, 'Planos'), 'Carpeta')
  assert.equal(etiquetaDeTipo('archivo', 'application/pdf', 'Contrato.pdf'), 'PDF')
  assert.equal(etiquetaDeTipo('archivo', 'application/vnd.google-apps.spreadsheet', 'Cómputo'), 'Planilla')
  assert.equal(etiquetaDeTipo('archivo', null, 'Presupuesto.xlsx'), 'Excel')
  assert.equal(etiquetaDeTipo('archivo', null, 'Planta baja.dwg'), 'Plano')
  // Sin mime y sin extensión no se afirma nada más que "archivo".
  assert.equal(etiquetaDeTipo('archivo', null, 'Contrato firmado'), 'Archivo')
  assert.equal(etiquetaDeTipo('archivo', null, null), 'Archivo')
})

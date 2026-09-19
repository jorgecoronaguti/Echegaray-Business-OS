import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADO,
  clasificar,
  escribeSheet,
  esTest,
  aplicarExcepciones,
  resumir,
  agruparPorArchivo,
} from './generadores-al-dia.mjs'

// ═══ EL DEFECTO QUE ORIGINÓ TODO ═══
// `main` tenía un `jornales-pestana.mjs` sin dirección/retiro y la rama tenía 22 menciones. Nadie lo
// tocó en `main` desde la base común: es un fast-forward puro y hay que avisarlo.
test('la rama tocó el archivo y main no → ATRASADO (el caso jornales-pestana)', () => {
  assert.equal(clasificar({ commitsRama: 15, commitsMain: 0 }), ESTADO.ATRASADO)
})

// ═══ LA PROTECCIÓN QUE NO SE PUEDE PERDER ═══
// `google.mjs` y `guarda-escritura.mjs` los tocaron LOS DOS lados. Si esto se clasificara como
// ATRASADO, copiar la versión de la rama revertiría el freno de mano y el no-borrar-sin-bypass.
// Este test se pone rojo si alguien "simplifica" la regla a "la rama tiene commits → traela".
test('los dos lados tocaron el archivo → DIVERGIDO, nunca ATRASADO', () => {
  assert.equal(clasificar({ commitsRama: 6, commitsMain: 5 }), ESTADO.DIVERGIDO)
  assert.equal(clasificar({ commitsRama: 2, commitsMain: 2 }), ESTADO.DIVERGIDO)
  // Un solo commit de main alcanza para que deje de ser copiable.
  assert.notEqual(clasificar({ commitsRama: 24, commitsMain: 1 }), ESTADO.ATRASADO)
})

test('sólo main lo tocó → ADELANTE, no hay nada que traer', () => {
  assert.equal(clasificar({ commitsRama: 0, commitsMain: 3 }), ESTADO.ADELANTE)
})

// Mismo contenido por caminos distintos (cherry-pick, o el mismo arreglo escrito dos veces):
// el historial dice que divergieron, pero no hay nada que decidir. Sin esto, el detector gritaría
// por decenas de archivos idénticos y se volvería ruido que nadie mira.
test('blobs iguales → IGUAL aunque el historial de los dos lados diga otra cosa', () => {
  assert.equal(clasificar({ commitsRama: 4, commitsMain: 2, blobsIguales: true }), ESTADO.IGUAL)
  assert.equal(clasificar({ commitsRama: 9, commitsMain: 0, blobsIguales: true }), ESTADO.IGUAL)
})

test('nadie lo tocó → IGUAL', () => {
  assert.equal(clasificar({}), ESTADO.IGUAL)
})

// ═══ EL DETECTOR DE ESCRITORES ═══
test('escribeSheet reconoce las puertas reales de escritura', () => {
  assert.equal(escribeSheet("import { WRITE_SCOPES } from '../lib/google.mjs'"), true)
  assert.equal(escribeSheet('await escribirPreservando(google, ID, rango, grid)'), true)
  assert.equal(escribeSheet('await guardarEscritura(cliente, fileId, data)'), true)
  assert.equal(escribeSheet('await guardarRequests(cliente, fileId, requests)'), true)
  assert.equal(escribeSheet('sheets.spreadsheets.values.update({})'), true)
  assert.equal(escribeSheet('await api.batchUpdate({ requests })'), true)
})

// Un script que sólo LEE no puede borrar nada: si entrara al informe, el detector avisaría por
// archivos que no tienen ningún riesgo y perdería credibilidad.
test('escribeSheet no marca a un lector', () => {
  assert.equal(escribeSheet("import { makeGoogleClient } from '../lib/google.mjs'\nawait cli.leer(r)"), false)
  assert.equal(escribeSheet(''), false)
  assert.equal(escribeSheet(null), false)
})

test('los tests y fixtures no cuentan como escritores del Sheet real', () => {
  assert.equal(esTest('orquestador/lib/caja.test.mjs'), true)
  assert.equal(esTest('orquestador/lib/jornales-fixture.mjs'), true)
  assert.equal(esTest('orquestador/scripts/caja-pestana.mjs'), false)
})

// ═══ LAS EXCEPCIONES CADUCAN SOLAS ═══
// Éste es el test que impide el agujero: una excepción vale para EL BLOB revisado. Si la rama se
// mueve, el blob cambia y el archivo vuelve a aparecer como pendiente.
test('la excepción declarada tapa el hallazgo sólo mientras la rama no se mueva', () => {
  const fila = { archivo: 'lib/google.mjs', rama: 'feat/x', blobRama: 'aaa', estado: ESTADO.DIVERGIDO }
  const exc = [{ archivo: 'lib/google.mjs', rama: 'feat/x', blobRama: 'aaa', motivo: 'gana main' }]

  const tapado = aplicarExcepciones([fila], exc)
  assert.equal(tapado.pendientes.length, 0)
  assert.equal(tapado.resueltas.length, 1)
  assert.equal(tapado.resueltas[0].motivo, 'gana main')

  // La rama avanzó sobre ese mismo archivo: blob nuevo, la excepción YA NO aplica.
  const conBlobNuevo = aplicarExcepciones([{ ...fila, blobRama: 'bbb' }], exc)
  assert.equal(conBlobNuevo.pendientes.length, 1, 'la rama se movió: tiene que volver a avisar')
  assert.equal(conBlobNuevo.caducadas.length, 1, 'y hay que decir que la excepción quedó vieja')
})

test('una excepción para otra rama no tapa el hallazgo', () => {
  const fila = { archivo: 'lib/google.mjs', rama: 'feat/x', blobRama: 'aaa', estado: ESTADO.DIVERGIDO }
  const r = aplicarExcepciones([fila], [{ archivo: 'lib/google.mjs', rama: 'feat/OTRA', blobRama: 'aaa', motivo: 'x' }])
  assert.equal(r.pendientes.length, 1)
})

// ═══ EL VEREDICTO ═══
test('resumir separa lo grave de lo que exige ojo humano', () => {
  const r = resumir([
    { archivo: 'a.mjs', estado: ESTADO.ATRASADO },
    { archivo: 'b.mjs', estado: ESTADO.DIVERGIDO },
    { archivo: 'c.mjs', estado: ESTADO.ADELANTE },
  ])
  assert.equal(r.atrasados.length, 1)
  assert.equal(r.divergidos.length, 1)
  assert.equal(r.hayProblema, true)
})

test('sin atrasados ni divergidos no hay problema', () => {
  assert.equal(resumir([{ archivo: 'c.mjs', estado: ESTADO.ADELANTE }]).hayProblema, false)
  assert.equal(resumir([]).hayProblema, false)
})

test('agruparPorArchivo junta un mismo generador atrasado en varias ramas', () => {
  const g = agruparPorArchivo([
    { archivo: 'scripts/caja-pestana.mjs', rama: 'r1', estado: ESTADO.ATRASADO, commitsRama: 24 },
    { archivo: 'scripts/caja-pestana.mjs', rama: 'r2', estado: ESTADO.ATRASADO, commitsRama: 3 },
    { archivo: 'scripts/jornales-pestana.mjs', rama: 'r1', estado: ESTADO.ATRASADO, commitsRama: 15 },
  ])
  assert.equal(g.length, 2)
  assert.equal(g[0].archivo, 'scripts/caja-pestana.mjs')
  assert.equal(g[0].ramas.length, 2)
})

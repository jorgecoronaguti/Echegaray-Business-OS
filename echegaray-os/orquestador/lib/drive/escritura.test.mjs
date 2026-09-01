// Crear y gestionar archivos. Hermético: cliente Google falso, 0 red.
//
// Los tests de acá existen para atrapar los defectos que ya costaron trabajo en este repo:
// afirmar una escritura que no ocurrió, y duplicar un archivo en el reintento.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearEscritura } from './escritura.mjs'
import { crearLectura } from './lectura.mjs'
import { crearAuditorEnMemoria } from './auditoria.mjs'
import { CODIGO } from './errores.mjs'
import { MIME_CARPETA, PROP_IDEMPOTENCIA } from './referencia.mjs'

const SHEET = 'application/vnd.google-apps.spreadsheet'

/**
 * Drive de mentira, con estado real: crear/renombrar/mover/copiar/archivar mutan `archivos`,
 * y la relectura de verificación mira ESE estado. `sordo` simula el caso peligroso: la API
 * contesta que sí y el archivo no cambia.
 */
function drive(inicial = {}, { sordo = false, ubicaMal = false } = {}) {
  const archivos = { ...inicial }
  const llamadas = []
  let n = 0
  const g = {
    archivos, llamadas,
    async getMeta(id) {
      const a = archivos[id]
      if (!a) { const e = new Error(`File not found: ${id}`); e.status = 404; throw e }
      return { ...a }
    },
    async listarCarpeta(id) { return Object.values(archivos).filter((a) => (a.parents || []).includes(id)) },
    async apiGetDrive(url) {
      const q = decodeURIComponent((url.match(/[?&]q=([^&]+)/) || [])[1] || '')
      const m = /value='([^']*)'/.exec(q)
      const clave = m?.[1]
      const files = Object.values(archivos).filter((a) => !a.trashed && clave && a.properties?.[PROP_IDEMPOTENCIA] === clave)
      return { files }
    },
    async createFile({ name, mimeType, parents, properties }) {
      llamadas.push(['createFile', name])
      const id = `n${++n}`
      archivos[id] = { id, name, mimeType, parents: ubicaMal ? [] : (parents ?? []), trashed: false, properties: properties ?? {}, version: '1' }
      return { id, name, mimeType }
    },
    async uploadFile(name, _b64, mimeType, { parentId, properties } = {}) {
      llamadas.push(['uploadFile', name])
      const id = `u${++n}`
      archivos[id] = { id, name, mimeType, parents: (parentId && !ubicaMal) ? [parentId] : [], trashed: false, properties: properties ?? {}, md5Checksum: 'abc' }
      return { id, link: 'x' }
    },
    async renameFile(id, name) {
      llamadas.push(['renameFile', id, name])
      if (!sordo) archivos[id] = { ...archivos[id], name }
      return { id, name }   // la API SIEMPRE contesta que sí — ése es el punto
    },
    async moveFile(id, folderId) {
      llamadas.push(['moveFile', id, folderId])
      if (!sordo) archivos[id] = { ...archivos[id], parents: [folderId] }
      return { id, parents: [folderId] }
    },
    async copyFile(id, name, parents, { properties } = {}) {
      llamadas.push(['copyFile', id, name])
      const nid = `c${++n}`
      const props = { ...(archivos[id].properties ?? {}) }
      for (const [k, v] of Object.entries(properties ?? {})) { if (v == null) delete props[k]; else props[k] = v }
      archivos[nid] = { ...archivos[id], id: nid, name, parents: parents ?? archivos[id].parents, properties: props }
      return { id: nid, name }
    },
    async trashFile(id) {
      llamadas.push(['trashFile', id])
      if (!sordo) archivos[id] = { ...archivos[id], trashed: true }
      return { id, trashed: true }
    },
    async exportarComoPdf(id, { nombre, parentId } = {}) {
      llamadas.push(['exportarComoPdf', id])
      const nid = `p${++n}`
      archivos[nid] = { id: nid, name: ubicaMal ? 'otro-nombre.pdf' : nombre, mimeType: 'application/pdf', parents: (parentId && !ubicaMal) ? [parentId] : [], trashed: false, properties: {} }
      return { id: nid, link: 'x' }
    },
  }
  return g
}

function armar(inicial, opts = {}) {
  const google = drive(inicial, opts)
  const lectura = crearLectura({ google })
  const auditor = crearAuditorEnMemoria()
  const escritura = crearEscritura({ google, lectura, auditor, esperaVerificacionMs: 1 })
  return { google, lectura, auditor, escritura }
}

const CARPETA = { id: 'C', name: 'OBRAS', mimeType: MIME_CARPETA, parents: ['raiz'], trashed: false, properties: {} }
const CARPETA2 = { id: 'D', name: 'ARCHIVO', mimeType: MIME_CARPETA, parents: ['raiz'], trashed: false, properties: {} }
const PAPELERA = { id: 'P', name: 'VIEJA', mimeType: MIME_CARPETA, parents: ['raiz'], trashed: true, properties: {} }
const ARCHIVO = { id: 'F', name: 'Presupuesto.pdf', mimeType: 'application/pdf', parents: ['C'], trashed: false, properties: {} }

// ─────────────── LA UBICACIÓN ES PARTE DEL EFECTO, NO UN ADORNO ───────────────
//
// Estas tres NO ponían nada en rojo antes: `crearNativo`, `subir` y `exportarADrive`
// comparaban nombre/mime/trashed y jamás `parents`. Un "guardá el informe en la carpeta del
// cliente" que Drive ubicara mal devolvía ok:true, un bloque `verificado` y una fila de
// auditoría que decía verificado, con el archivo en otra carpeta. Eso bloquea ORGANIZAR,
// que es la mitad del sentido de esta capacidad.

test('CREAR en una carpeta y que Drive lo deje en otra → VERIFY_FAILED', async () => {
  const { escritura } = armar({ C: CARPETA }, { ubicaMal: true })
  await assert.rejects(
    () => escritura.crearNativo({ nombre: 'informe', tipo: 'doc', padre: 'C' }),
    (e) => e.codigo === CODIGO.VERIFY_FAILED && e.diff.parents.antes[0] === 'C',
  )
})

test('SUBIR a una carpeta y que Drive lo deje en otra → VERIFY_FAILED', async () => {
  const { escritura } = armar({ C: CARPETA }, { ubicaMal: true })
  await assert.rejects(
    () => escritura.subir({ nombre: 'r.pdf', contenido_base64: 'AA==', mime_type: 'application/pdf', padre: 'C' }),
    (e) => e.codigo === CODIGO.VERIFY_FAILED && 'parents' in e.diff,
  )
})

test('EXPORTAR a una carpeta con otro nombre o en otro lado → VERIFY_FAILED', async () => {
  const { escritura } = armar({ C: CARPETA, S: { id: 'S', name: 'CF', mimeType: SHEET, parents: ['C'], trashed: false, properties: {} } }, { ubicaMal: true })
  await assert.rejects(
    () => escritura.exportarADrive({ file_id: 'S', formato: 'pdf', destino: 'C' }),
    (e) => e.codigo === CODIGO.VERIFY_FAILED && 'parents' in e.diff && 'name' in e.diff,
  )
})

test('sin padre NO se inventa una expectativa de ubicación: Drive lo deja en la raíz', async () => {
  // Afirmar `parents: []` sería una expectativa que nunca se cumple (la raíz tiene id).
  const { escritura } = armar({})
  const r = await escritura.crearNativo({ nombre: 'suelto', tipo: 'doc' })
  assert.equal(r.ok, true)
  assert.ok(!r.verificado.campos.includes('parents'))
})

test('con padre, la respuesta DECLARA que verificó la ubicación', async () => {
  const { escritura } = armar({ C: CARPETA })
  const r = await escritura.crearNativo({ nombre: 'ubicado', tipo: 'doc', padre: 'C' })
  assert.ok(r.verificado.campos.includes('parents'))
  assert.deepEqual(r.referencia.parents, ['C'])
  const s = await escritura.subir({ nombre: 'x.pdf', contenido_base64: 'AA==', mime_type: 'application/pdf', padre: 'C' })
  assert.ok(s.verificado.campos.includes('parents'))
})

test('LA CUOTA DE DRIVE DEVUELVE QUÉ HACER, no sólo el código', async () => {
  // Las dos frases que las tools decían antes y que `clasificar()` se comió al convertir el 403
  // en un QUOTA genérico. El código sigue siendo QUOTA y el texto de Google sigue en `detalle`.
  const cuota = () => { const e = new Error("The user's storageQuota has been exceeded"); e.status = 403; throw e }
  const g = drive({ F: ARCHIVO, C: CARPETA })
  g.createFile = cuota; g.copyFile = cuota
  const escritura = crearEscritura({ google: g, lectura: crearLectura({ google: g }), esperaVerificacionMs: 1 })
  await assert.rejects(
    () => escritura.crearNativo({ nombre: 'x', tipo: 'doc', padre: 'C' }),
    (e) => e.codigo === CODIGO.QUOTA && /autorizado a actuar como tu cuenta/.test(e.message) && /storageQuota/.test(e.detalle),
  )
  await assert.rejects(
    () => escritura.copiar({ file_id: 'F', nombre: 'copia', destino: 'C' }),
    (e) => e.codigo === CODIGO.QUOTA && /Unidad Compartida/.test(e.message) && /duplicá vos el archivo/.test(e.message),
  )
})

test('la clave de idempotencia se busca DENTRO de la carpeta destino, no en todo el Drive', async () => {
  // Dos clientes que eligen la misma clave de negocio no pueden pisarse.
  const consultas = []
  const g = drive({ C: CARPETA, D: CARPETA2 })
  const apiOriginal = g.apiGetDrive
  g.apiGetDrive = async (url) => { consultas.push(decodeURIComponent(url)); return apiOriginal(url) }
  const escritura = crearEscritura({ google: g, lectura: crearLectura({ google: g }), esperaVerificacionMs: 1 })
  await escritura.crearNativo({ nombre: 'informe', tipo: 'doc', padre: 'C', clave_idempotencia: 'informe-2026-08' })
  assert.ok(consultas[0].includes("'C' in parents"), `no acotó por carpeta: ${consultas[0]}`)
})

// ───────────────────────── ESCRITURA SIN PERSISTENCIA ─────────────────────────

test('ESCRITURA SIN PERSISTENCIA: la API dice que sí y el archivo no cambió → VERIFY_FAILED', async () => {
  // El defecto que este repo ya pagó con un 204 de PostgREST tomado como prueba.
  const { escritura } = armar({ F: ARCHIVO }, { sordo: true })
  await assert.rejects(
    () => escritura.renombrar({ file_id: 'F', nombre: 'Presupuesto FIRMADO.pdf' }),
    (e) => e.codigo === CODIGO.VERIFY_FAILED && /Presupuesto\.pdf/.test(e.detalle),
  )
})

test('un MOVE que no persistió tampoco pasa: se verifica releyendo parents', async () => {
  const { escritura } = armar({ F: ARCHIVO, C: CARPETA, D: CARPETA2 }, { sordo: true })
  await assert.rejects(
    () => escritura.mover({ file_id: 'F', destino: 'D' }),
    (e) => e.codigo === CODIGO.VERIFY_FAILED && e.diff.parents.despues[0] === 'C',
  )
})

test('un ARCHIVAR que no persistió tampoco pasa', async () => {
  const { escritura } = armar({ F: ARCHIVO }, { sordo: true })
  await assert.rejects(() => escritura.archivar({ file_id: 'F' }), (e) => e.codigo === CODIGO.VERIFY_FAILED)
})

test('cuando SÍ persiste, la respuesta trae qué se verificó y contra qué', async () => {
  const { escritura } = armar({ F: ARCHIVO })
  const r = await escritura.renombrar({ file_id: 'F', nombre: 'Presupuesto FIRMADO.pdf' })
  assert.equal(r.ok, true)
  assert.equal(r.referencia.name, 'Presupuesto FIRMADO.pdf')
  assert.equal(r.antes.name, 'Presupuesto.pdf')
  assert.deepEqual(r.verificado.campos, ['name'])
  assert.equal(r.verificado.metodo, 'relectura del destino')
})

// ───────────────────────── RETRY DUPLICADO ─────────────────────────

test('RETRY DUPLICADO: dos creaciones con la misma clave dejan UN archivo, no "(1)"', async () => {
  const { escritura, google } = armar({ C: CARPETA })
  const a = await escritura.crearNativo({ nombre: 'Informe agosto', tipo: 'doc', padre: 'C', clave_idempotencia: 'informe-2026-08' })
  const b = await escritura.crearNativo({ nombre: 'Informe agosto', tipo: 'doc', padre: 'C', clave_idempotencia: 'informe-2026-08' })
  assert.equal(a.idempotente, false)
  assert.equal(b.idempotente, true)
  assert.equal(a.referencia.file_id, b.referencia.file_id)
  assert.equal(google.llamadas.filter(([m]) => m === 'createFile').length, 1)
  assert.equal(Object.values(google.archivos).filter((f) => f.name === 'Informe agosto').length, 1)
})

test('sin clave de idempotencia SÍ se crean dos: la capacidad no adivina la intención', async () => {
  const { escritura, google } = armar({ C: CARPETA })
  await escritura.crearNativo({ nombre: 'Nota', tipo: 'doc', padre: 'C' })
  await escritura.crearNativo({ nombre: 'Nota', tipo: 'doc', padre: 'C' })
  assert.equal(google.llamadas.filter(([m]) => m === 'createFile').length, 2)
})

test('la clave se escribe EN la creación, no en un PATCH posterior', async () => {
  const { escritura, google } = armar({ C: CARPETA })
  const r = await escritura.crearNativo({ nombre: 'X', tipo: 'sheet', clave_idempotencia: 'k1' })
  assert.equal(google.archivos[r.referencia.file_id].properties[PROP_IDEMPOTENCIA], 'k1')
})

test('subir también es idempotente por clave', async () => {
  const { escritura, google } = armar({ C: CARPETA })
  const a = await escritura.subir({ nombre: 'f.pdf', contenido_base64: 'AA==', mime_type: 'application/pdf', padre: 'C', clave_idempotencia: 'k2' })
  const b = await escritura.subir({ nombre: 'f.pdf', contenido_base64: 'AA==', mime_type: 'application/pdf', padre: 'C', clave_idempotencia: 'k2' })
  assert.equal(b.idempotente, true)
  assert.equal(a.referencia.file_id, b.referencia.file_id)
  assert.equal(google.llamadas.filter(([m]) => m === 'uploadFile').length, 1)
})

test('una COPIA no hereda la clave del original: si no, la copia fingiría ser esa operación', async () => {
  const marcado = { ...ARCHIVO, properties: { [PROP_IDEMPOTENCIA]: 'del-original' } }
  const { escritura, google } = armar({ F: marcado, C: CARPETA })
  const r = await escritura.copiar({ file_id: 'F', nombre: 'Presupuesto (copia).pdf', destino: 'C' })
  assert.equal(google.archivos[r.referencia.file_id].properties[PROP_IDEMPOTENCIA], undefined)
  // Y el original la conserva.
  assert.equal(google.archivos.F.properties[PROP_IDEMPOTENCIA], 'del-original')
})

// ───────────────────────── DESTINOS Y ARGUMENTOS EQUIVOCADOS ─────────────────────────

test('FILE INEXISTENTE / FILE_ID INCORRECTO: NOT_FOUND antes de tocar nada', async () => {
  const { escritura, google } = armar({ C: CARPETA })
  await assert.rejects(() => escritura.renombrar({ file_id: 'no-existe', nombre: 'x' }), (e) => e.codigo === CODIGO.NOT_FOUND)
  await assert.rejects(() => escritura.mover({ file_id: 'ID-MAL-COPIADO', destino: 'C' }), (e) => e.codigo === CODIGO.NOT_FOUND)
  assert.equal(google.llamadas.length, 0, 'no se llamó a ninguna mutación')
})

test('DESTINO EQUIVOCADO: mover a algo que no es carpeta se rechaza', async () => {
  const { escritura, google } = armar({ F: ARCHIVO, C: CARPETA })
  const otro = { id: 'G', name: 'otro.pdf', mimeType: 'application/pdf', parents: ['C'], trashed: false, properties: {} }
  google.archivos.G = otro
  await assert.rejects(() => escritura.mover({ file_id: 'F', destino: 'G' }), (e) => e.codigo === CODIGO.INVALID_ARGUMENT)
  assert.equal(google.llamadas.filter(([m]) => m === 'moveFile').length, 0)
})

test('CARPETA EQUIVOCADA: una carpeta en la papelera no es un destino ni un padre', async () => {
  const { escritura } = armar({ F: ARCHIVO, P: PAPELERA })
  await assert.rejects(() => escritura.mover({ file_id: 'F', destino: 'P' }), (e) => e.codigo === CODIGO.TRASHED)
  await assert.rejects(() => escritura.crearNativo({ nombre: 'x', tipo: 'doc', padre: 'P' }), (e) => e.codigo === CODIGO.TRASHED)
})

test('FORMATO NO SOPORTADO: se dice cuáles sí, no se manda un 400 a Drive', async () => {
  const { escritura, google } = armar({ S: { id: 'S', name: 'CF', mimeType: SHEET, parents: [], trashed: false, properties: {} } })
  await assert.rejects(() => escritura.crearNativo({ nombre: 'x', tipo: 'dwg' }), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION)
  await assert.rejects(() => escritura.exportarADrive({ file_id: 'S', formato: 'xlsx' }), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION)
  assert.equal(google.llamadas.length, 0)
  const ok = await escritura.exportarADrive({ file_id: 'S', formato: 'pdf' })
  assert.equal(ok.referencia.mime_type, 'application/pdf')
})

test('copiar una CARPETA se declara no soportado en vez de fallar raro', async () => {
  const { escritura } = armar({ C: CARPETA, D: CARPETA2 })
  await assert.rejects(() => escritura.copiar({ file_id: 'C', nombre: 'OBRAS 2', destino: 'D' }), (e) => e.codigo === CODIGO.UNSUPPORTED_OPERATION)
})

test('los argumentos faltantes se rechazan sin tocar Drive', async () => {
  const { escritura, google } = armar({ F: ARCHIVO })
  for (const fn of [
    () => escritura.renombrar({ file_id: 'F' }),
    () => escritura.mover({ file_id: 'F' }),
    () => escritura.copiar({ file_id: 'F' }),
    () => escritura.crearCarpeta({}),
    () => escritura.subir({ nombre: 'x', mime_type: 'application/pdf' }),
  ]) await assert.rejects(fn, (e) => e.codigo === CODIGO.INVALID_ARGUMENT)
  assert.equal(google.llamadas.length, 0)
})

// ───────────────────────── OPERACIONES SIN EFECTO ─────────────────────────

test('lo que ya estaba hecho se marca idempotente y NO se vuelve a pedir a Drive', async () => {
  const { escritura, google } = armar({ F: ARCHIVO, C: CARPETA })
  const r1 = await escritura.mover({ file_id: 'F', destino: 'C' })      // ya está en C
  assert.equal(r1.idempotente, true)
  const enPapelera = { ...ARCHIVO, id: 'T', trashed: true }
  google.archivos.T = enPapelera
  const r2 = await escritura.archivar({ file_id: 'T' })
  assert.equal(r2.idempotente, true)
  assert.equal(google.llamadas.length, 0)
})

test('el borrado definitivo es Nivel F y no se ejecuta nunca', async () => {
  const { escritura } = armar({ F: ARCHIVO })
  await assert.rejects(() => escritura.borrarDefinitivo({ file_id: 'F' }),
    (e) => e.codigo === CODIGO.FORBIDDEN && /Nivel F/.test(e.message))
})

// ───────────────────────── AUDITORÍA ─────────────────────────

test('toda mutación deja una fila con antes, después y QUÉ se verificó', async () => {
  const { escritura, auditor } = armar({ F: ARCHIVO, C: CARPETA, D: CARPETA2 })
  await escritura.renombrar({ file_id: 'F', nombre: 'Presupuesto v2.pdf' })
  await escritura.mover({ file_id: 'F', destino: 'D' })
  await escritura.archivar({ file_id: 'F' })
  assert.deepEqual(auditor.filas.map((f) => f.operacion), ['renombrar', 'mover', 'archivar'])
  const mover = auditor.filas[1]
  assert.equal(mover.file_id, 'F')
  assert.deepEqual(mover.antes.parents, ['C'])
  assert.deepEqual(mover.despues.parents, ['D'])
  assert.deepEqual(mover.verificado_campos, ['parents'])
  assert.ok(mover.ocurrido_en, 'sin cuándo no es auditoría')
})

test('una operación que FALLA la verificación no deja fila de éxito', async () => {
  const { escritura, auditor } = armar({ F: ARCHIVO }, { sordo: true })
  await escritura.renombrar({ file_id: 'F', nombre: 'z' }).catch(() => null)
  assert.equal(auditor.filas.length, 0)
})

test('si el auditor no puede escribir, la respuesta LO DICE en vez de callarse', async () => {
  const google = drive({ F: ARCHIVO })
  const lectura = crearLectura({ google })
  const auditorRoto = { async registrar() { throw new Error('relation "orq.drive_audit" does not exist') } }
  const escritura = crearEscritura({ google, lectura, auditor: auditorRoto, esperaVerificacionMs: 1 })
  const r = await escritura.renombrar({ file_id: 'F', nombre: 'y.pdf' })
  assert.equal(r.ok, true)                                  // el efecto ocurrió
  assert.equal(r.audit.registrado, false)                   // y se admite que no quedó registrado
  assert.equal(r.audit.motivo, CODIGO.AUDIT_UNAVAILABLE)
  assert.match(r.audit.detalle, /drive_audit/)
})

test('sin auditor la capacidad no finge haber auditado', async () => {
  const google = drive({ F: ARCHIVO })
  const lectura = crearLectura({ google })
  const escritura = crearEscritura({ google, lectura, esperaVerificacionMs: 1 })
  const r = await escritura.renombrar({ file_id: 'F', nombre: 'w.pdf' })
  assert.equal(r.audit.registrado, false)
  assert.equal(r.audit.motivo, CODIGO.AUDIT_UNAVAILABLE)
})

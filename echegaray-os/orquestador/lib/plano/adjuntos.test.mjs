// EL PLANO ADJUNTO ATERRIZA EN DRIVE + ÍNDICE ANTES DE COTIZAR — sin eso no hay genealogía.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mimeDeAdjunto, carpetaDelProyecto, subirPlanosAlProyecto } from './adjuntos.mjs'

test('mimeDeAdjunto: por extensión, y lo desconocido queda como binario declarado', () => {
  assert.equal(mimeDeAdjunto('planta.PDF'), 'application/pdf')
  assert.equal(mimeDeAdjunto('corte.jpeg'), 'image/jpeg')
  assert.equal(mimeDeAdjunto('modelo.dwg'), 'application/octet-stream')
})

const googleFalso = (subidas, creadas = []) => ({
  async uploadFile(name, b64, mime, { parentId } = {}) { subidas.push({ name, mime, parentId, bytes: Buffer.byteLength(b64, 'base64') }); return { id: `up-${subidas.length}` } },
  async createFile(meta) { creadas.push(meta); return { id: 'carpeta-nueva', name: meta.name } },
})

test('con carpeta existente: sube adentro y deja cada archivo en el índice con el path del proyecto', async () => {
  const sqls = []
  const query = async (sql, params) => {
    sqls.push({ sql, params })
    if (/select drive_file_id, name, path/.test(sql)) return { rows: [{ drive_file_id: 'carp-q', name: 'QUATTROPANI', path: 'PRESUPUESTOS - CLIENTES/QUATTROPANI' }] }
    return { rows: [] }
  }
  const subidas = []
  const r = await subirPlanosAlProyecto({ query, google: googleFalso(subidas) }, 'Quattropani', [
    { nombre: 'planta.pdf', contenido_base64: Buffer.from('plano').toString('base64') },
  ])
  assert.equal(r.carpetaId, 'carp-q')
  assert.equal(r.subidos.length, 1)
  assert.equal(r.errores.length, 0)
  assert.equal(subidas[0].parentId, 'carp-q')
  const upsert = sqls.find((s) => /insert into public\.drive_index/.test(s.sql))
  assert.ok(upsert, 'el archivo subido TIENE que quedar en drive_index — el pipeline lo busca ahí')
  assert.equal(upsert.params[0], 'up-1')
  assert.match(String(upsert.params[2]), /QUATTROPANI\/planta\.pdf$/, 'el path indexado cuelga de la carpeta del proyecto')
})

test('sin carpeta: la crea bajo la raíz, la indexa, y el término del proyecto queda en el path', async () => {
  const sqls = []
  const query = async (sql, params) => { sqls.push({ sql, params }); return { rows: [] } }
  const subidas = []
  const creadas = []
  const r = await subirPlanosAlProyecto({ query, google: googleFalso(subidas, creadas) }, 'Villa Krause', [
    { nombre: 'corte.pdf', contenido_base64: Buffer.from('x').toString('base64') },
  ])
  assert.equal(creadas.length, 1)
  assert.equal(creadas[0].mimeType, 'application/vnd.google-apps.folder')
  assert.match(creadas[0].name, /Villa Krause/)
  assert.equal(r.carpetaId, 'carpeta-nueva')
  const upserts = sqls.filter((s) => /insert into public\.drive_index/.test(s.sql))
  assert.equal(upserts.length, 2, 'carpeta nueva + archivo: los DOS van al índice')
})

test('un adjunto sin contenido NO se inventa: queda declarado en errores y no se sube', async () => {
  const query = async (sql) => (/select/.test(sql) ? { rows: [{ drive_file_id: 'c', name: 'X', path: 'X' }] } : { rows: [] })
  const subidas = []
  const r = await subirPlanosAlProyecto({ query, google: googleFalso(subidas) }, 'X', [{ nombre: 'vacio.pdf' }])
  assert.equal(subidas.length, 0)
  assert.equal(r.subidos.length, 0)
  assert.match(r.errores[0], /vacio\.pdf: sin contenido/)
})

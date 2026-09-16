// EL PAPEL DEL CHAT QUEDA EN LA APP EN EL MISMO ACTO QUE LA FILA (08/09/2026).
//
// Defecto medido ese día: los 8 archivos de los posts del 07/09 estaban en Compras y no en
// `compra_adjunto`, porque el bot nunca los guardaba — sólo un script manual. Estos tests prueban el
// paso nuevo con dobles: no tocan Mattermost, ni el bucket, ni Postgres.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  archivosDelFajo, respaldarArchivo, respaldarFajoCargado, avisoDeRespaldo, admisible, rutaDe, tipoDe,
  pendientesDeFajos, respaldosPendientes, reintentarRespaldos, crearRepescaDeRespaldos, REPESCA_INTERVALO_MS_DEFAULT,
} from './respaldo-adjunto.mjs'

const fajo = { id: 'f1', post_ids: ['post1'] }
const items = [
  { clave: 'c:1|0001-1', origen: { fileId: 'A', nombre: 'a.jpg' } },
  { clave: 'c:2|0001-2', origen: { fileId: 'B', nombre: 'b.HEIC' }, copias: [{ fileId: 'B2', nombre: 'b2.jpg' }] },
  { clave: null, origen: { fileId: null, nombre: null } },
]
const filas = [{ clave: 'c:1|0001-1', fila: 925 }, { clave: 'c:2|0001-2', fila: 926 }, { clave: null, fila: null }]

test('archivosDelFajo: cada foto cuelga de la fila de su ítem, las copias también, sin fileId no hay nada', () => {
  const a = archivosDelFajo({ fajo, items, filas })
  assert.deepEqual(a.map((x) => [x.file_id, x.fila, x.clave, x.post_id]), [
    ['A', 925, 'c:1|0001-1', 'post1'],
    ['B', 926, 'c:2|0001-2', 'post1'],
    ['B2', 926, 'c:2|0001-2', 'post1'],
  ])
})

function dobles({ bajar } = {}) {
  const inserts = []
  const subidas = []
  return {
    inserts, subidas,
    dep: {
      bajar: bajar ?? (async (id) => ({ ok: true, nombre: `${id}.jpg`, mediaType: 'image/jpeg', data: Buffer.from('foto').toString('base64') })),
      subir: async (o) => { subidas.push(o); return { ok: true, yaEstaba: false } },
      query: async (sql, params) => { inserts.push({ sql, params }); return { rows: [] } },
    },
  }
}

test('respaldarArchivo: sube tal cual llegó y anota clave, fila, ruta y «registro»', async () => {
  const { dep, inserts, subidas } = dobles()
  const r = await respaldarArchivo(dep, { file_id: 'A', nombre: 'a.jpg', post_id: 'post1', clave: 'c:1|0001-1', fila: 925 })
  assert.equal(r.ok, true)
  assert.equal(subidas[0].bucket, 'comprobantes')
  assert.equal(subidas[0].path, 'historico/post1/A.jpg')
  assert.equal(subidas[0].mediaType, 'image/jpeg')
  assert.equal(subidas[0].data.toString(), 'foto')
  const p = inserts[0].params
  assert.equal(p[0], 'c:1|0001-1'); assert.equal(p[1], 925); assert.equal(p[2], 'historico/post1/A.jpg')
  assert.equal(p[6], 'post1'); assert.equal(p[7], 'A'); assert.equal(p[8], 'registro'); assert.equal(p[9], 1)
  assert.match(inserts[0].sql, /on conflict \(origen_file_id\)/)
})

test('respaldarArchivo: el HEIC se guarda como HEIC (formato en que fue enviado), no convertido', async () => {
  const { dep, subidas, inserts } = dobles({
    bajar: async () => ({ ok: true, nombre: 'IMG_1.HEIC', mediaType: '', data: Buffer.from('heic').toString('base64') }),
  })
  const r = await respaldarArchivo(dep, { file_id: 'H', nombre: 'IMG_1.HEIC', post_id: 'p', clave: 'k', fila: 1 })
  assert.equal(r.ok, true)
  assert.equal(subidas[0].mediaType, 'image/heic')
  assert.equal(subidas[0].path, 'historico/p/H.heic')
  assert.equal(inserts[0].params[4], 'image/heic')
})

test('respaldarArchivo: lo que no entra al bucket se declara y no se anota', async () => {
  const { dep, inserts } = dobles({
    bajar: async () => ({ ok: true, nombre: 'mov.csv', mediaType: 'text/csv', data: Buffer.from('a;b').toString('base64') }),
  })
  const r = await respaldarArchivo(dep, { file_id: 'C', nombre: 'mov.csv', post_id: 'p' })
  assert.deepEqual(r, { ok: false, motivo: 'tipo text/csv' })
  assert.equal(inserts.length, 0)
})

test('respaldarArchivo: sin clave queda «sin_vincular», que es lo que la app lista como suelto', async () => {
  const { dep, inserts } = dobles()
  await respaldarArchivo(dep, { file_id: 'S', nombre: 's.jpg', post_id: 'p', clave: null, fila: null })
  assert.equal(inserts[0].params[8], 'sin_vincular')
  assert.equal(inserts[0].params[10], null)
})

test('respaldarFajoCargado: cuenta guardados y fallidos, y un bucket caído no lanza', async () => {
  const { dep } = dobles()
  let n = 0
  dep.subir = async () => (++n === 2 ? { ok: false, error: 'bucket 503' } : { ok: true, yaEstaba: n === 3 })
  const r = await respaldarFajoCargado(dep, { fajo, items, filas })
  assert.equal(r.guardados, 2)
  assert.equal(r.yaEstaban, 1)
  assert.deepEqual(r.fallidos, [{ nombre: 'b.HEIC', motivo: 'bucket 503' }])
  assert.match(avisoDeRespaldo(r), /1 archivo\(s\) no quedaron en la app: b\.HEIC \(bucket 503\)/)
})

test('respaldarFajoCargado: sin Mattermost se OMITE y se dice; sin archivos no dice nada', async () => {
  const r = await respaldarFajoCargado({ query: async () => ({ rows: [] }) }, { fajo, items, filas })
  assert.match(r.omitido, /sin Mattermost/)
  assert.match(avisoDeRespaldo(r), /No guardé los archivos en la app/)
  const vacio = await respaldarFajoCargado({}, { fajo, items: [{ origen: {} }], filas: [{}] })
  assert.equal(avisoDeRespaldo(vacio), null)
})

test('admisible / rutaDe / tipoDe: los puros', () => {
  assert.equal(admisible({ media_type: 'application/pdf', bytes: 10 }).ok, true)
  assert.equal(admisible({ media_type: 'image/jpeg', bytes: 30 * 1024 * 1024 }).motivo, 'pesa 30.0 MB')
  assert.equal(admisible({ media_type: 'image/jpeg', bytes: 0 }).motivo, 'tamaño cero')
  assert.equal(rutaDe(null, 'X', 'sin-extension'), 'historico/sin-post/X.sinextension')
  assert.equal(tipoDe('application/octet-stream', 'foto.JPG'), 'image/jpeg')
})

// ═══ LO OMITIDO SE REINTENTA (15/09/2026) ═══
//
// El escritor sin `MM_BASE_URL`/`MM_BOT_TOKEN` devolvía `omitido: 'sin Mattermost…'` y ahí terminaba:
// la fila quedaba en Compras y en la app sin papel, para siempre. Estos tests fijan que el pendiente
// se pueda CALCULAR (la diferencia entre lo que el fajo cargó y lo que `compra_adjunto` tiene) y que
// la repesca lo guarde. Si se revierte la repesca, el tercero se pone rojo.

test('EL DEFECTO: una fila cargada con archivo y sin `compra_adjunto` es un pendiente, y se ve', () => {
  const p = pendientesDeFajos([{ id: 'f1', post_ids: ['post1'], items, filas }])
  assert.deepEqual(p.map((x) => [x.file_id, x.fila]), [['A', 925], ['B', 926], ['B2', 926]])
  // Y lo que ya está guardado deja de ser pendiente.
  assert.deepEqual(pendientesDeFajos([{ id: 'f1', post_ids: ['post1'], items, filas }], new Set(['A', 'B', 'B2'])), [])
})

test('un adjunto sin fila y sin clave no es un respaldo faltante: es un comprobante que no se cargó', () => {
  // Esa ausencia la vigila `vigilancia.mjs` (el descalce), no la repesca del papel. Con CLAVE sí
  // entra aunque la fila no esté: el papel se cuelga de la clave, que es como la app lo encuentra.
  const sueltos = [{ clave: null, origen: { fileId: 'X', nombre: 'x.jpg' } }]
  assert.deepEqual(pendientesDeFajos([{ id: 'f1', post_ids: ['p'], items: sueltos, filas: [{ clave: null, fila: null }] }]), [])
  const conClave = [{ clave: 'c:9|0001-9', origen: { fileId: 'Y', nombre: 'y.jpg' } }]
  assert.equal(pendientesDeFajos([{ id: 'f1', post_ids: ['p'], items: conClave, filas: [{ fila: null }] }]).length, 1)
})

test('respaldosPendientes: es la DIFERENCIA contra `compra_adjunto`, no una tabla de pendientes', async () => {
  const consultas = []
  const query = async (sql, params) => {
    consultas.push(sql)
    if (/comprobante_fajos/.test(sql)) return { rows: [{ id: 'f1', post_ids: ['post1'], items, filas }] }
    assert.deepEqual(params[0], ['A', 'B', 'B2'])
    return { rows: [{ origen_file_id: 'A' }] }
  }
  const p = await respaldosPendientes({ query })
  assert.deepEqual(p.map((x) => x.file_id), ['B', 'B2'])
  assert.equal(consultas.length, 2)
})

test('la repesca baja y guarda lo que quedó pendiente, y sin Mattermost lo dice en vez de callarse', async () => {
  const { dep, inserts } = dobles()
  dep.query = async (sql) => {
    if (/comprobante_fajos/.test(sql)) return { rows: [{ id: 'f1', post_ids: ['post1'], items, filas }] }
    if (/compra_adjunto where origen_file_id/.test(sql)) return { rows: [{ origen_file_id: 'A' }] }
    inserts.push(sql)
    return { rows: [] }
  }
  const r = await reintentarRespaldos(dep)
  assert.equal(r.pendientes, 2, 'A ya estaba; B y B2 no')
  assert.equal(r.guardados, 2)
  assert.deepEqual(r.fallidos, [])
  assert.match((await reintentarRespaldos({ query: dep.query })).omitido, /sin Mattermost/)
})

test('la repesca tiene su propio intervalo y nunca voltea el worker', async () => {
  let t = 0
  const repescar = crearRepescaDeRespaldos({ bajar: async () => { throw new Error('mattermost caído') }, query: async () => { throw new Error('base caída') }, ahora: () => t })
  assert.equal((await repescar()).omitido.startsWith('no pude mirar'), true)
  assert.equal(await repescar(), null, 'dentro del intervalo no vuelve a barrer')
  t += REPESCA_INTERVALO_MS_DEFAULT + 1
  assert.ok(await repescar())
})

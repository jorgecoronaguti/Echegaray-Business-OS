// EL CAMINO COMPLETO: foto en el canal → mensaje con botones. Sin red, sin Postgres, sin modelo.
//
// Lo que se verifica no es que "no tire excepción": es QUÉ dice el mensaje y QUÉ quedó en el fajo.
// Un test que sólo comprobara que la función devuelve algo pasaría con el proveedor equivocado, con
// la obra inventada y con el comprobante duplicado.

import test from 'node:test'
import assert from 'node:assert/strict'
import { procesarPost, armarItem, bajarAdjunto, TEXTO } from './flujo.mjs'
import { repoMemoria, portGuarda, mmFalso, lecturaBarcelo, LISTAS } from './dobles.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

const URL = 'https://chat.ecsas.com.ar/comprobantes/accion?t=SECRETO'
const ACTOR = { plataforma_user_id: 'u_rodrigo', plataforma_username: 'rodrigo', channel_type: 'P', channel_id: 'c_comprobantes' }

/** Manda un post y deja el reloj del repositorio sincronizado con el del mensaje. */
async function mandar(d, repo, m) {
  repo.en(m.ahora)
  return procesarPost(d, m)
}

function armar({ repo = repoMemoria(), port = portGuarda(), lecturas = [lecturaBarcelo()], listas = LISTAS, archivos } = {}) {
  const mm = mmFalso({ archivos: archivos ?? { f1: { name: 'factura.jpg', mime: 'image/jpeg' }, f2: { name: 'otra.jpg', mime: 'image/jpeg' } } })
  let i = 0
  return {
    repo,
    mm,
    d: {
      port, repo, mattermost: mm, url: URL,
      leer: async () => { const c = lecturas[Math.min(i++, lecturas.length - 1)]; return c ? { ok: true, crudo: c } : { ok: false, error: 'ilegible' } },
      listas: async () => listas,
    },
  }
}

const post = (o = {}) => ({
  fileIds: ['f1'], actor: ACTOR, channelId: 'c_comprobantes', postId: 'p1', rootPostId: 'p1',
  ahora: new Date('2026-08-03T10:00:00Z'), ...o,
})

// ── El camino feliz ──────────────────────────────────────────────────────────

test('una foto en el canal abre un fajo y devuelve el mensaje con los tres botones', async () => {
  const { d, repo } = armar()
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'confirmar')
  assert.match(r.texto, /COMBUSTIBLES BARCELO|Combustibles Barcelo/)
  assert.match(r.texto, /total \$36\.460,30/)
  assert.match(r.texto, /obra: Estrella/)
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['confirmar', 'corregir', 'descartar'])
  const f = repo._fajos.get(r.fajoId)
  assert.equal(f.estado, ESTADO.ABIERTO)
  assert.equal(f.items.length, 1)
})

test('NO se escribe nada en el Sheet al recibir la foto: sólo se muestra', async () => {
  const { d, repo } = armar()
  await procesarPost(d, post())
  assert.equal(repo._cargados.size, 0, 'nada se dio por cargado sin un Confirmar')
})

// ── El agrupado de un fajo ───────────────────────────────────────────────────

test('varios adjuntos en UN post son un solo fajo con dos comprobantes', async () => {
  const { d, repo } = armar({
    lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490', total: '10.000,00' })],
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2'] }))
  assert.equal(repo._fajos.get(r.fajoId).items.length, 2)
  assert.match(r.texto, /Leí 2 comprobantes/)
})

test('dos posts seguidos del mismo usuario se SUMAN al mismo fajo: una sola confirmación', async () => {
  const { d, repo } = armar({
    lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490', total: '10.000,00' })],
  })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:02:00Z') }))
  assert.equal(r1.fajoId, r2.fajoId, 'el segundo post no abre una confirmación nueva')
  assert.equal(repo._fajos.size, 1)
  assert.equal(repo._fajos.get(r2.fajoId).items.length, 2)
  assert.deepEqual(repo._fajos.get(r2.fajoId).post_ids, ['p1', 'p2'])
})

test('la MISMA foto mandada dos veces en la tanda no duplica la línea', async () => {
  const { d, repo } = armar({ lecturas: [lecturaBarcelo(), lecturaBarcelo()] })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:01:00Z') }))
  assert.equal(repo._fajos.get(r1.fajoId).items.length, 1, 'mismo (CUIT, tipo, número) = un comprobante')
})

test('pasada la ventana, el fajo viejo se cierra y arranca uno nuevo', async () => {
  const { d, repo } = armar({ lecturas: [lecturaBarcelo(), lecturaBarcelo({ numero: '0113-00010490' })] })
  const r1 = await mandar(d, repo, post({ postId: 'p1' }))
  const r2 = await mandar(d, repo, post({ postId: 'p2', fileIds: ['f2'], ahora: new Date('2026-08-03T10:30:00Z') }))
  assert.notEqual(r1.fajoId, r2.fajoId)
  assert.equal(repo._fajos.get(r1.fajoId).estado, ESTADO.DESCARTADO)
})

// ── Proveedor desconocido ────────────────────────────────────────────────────

test('PROVEEDOR DESCONOCIDO: se pregunta, no se inventa, y no se ofrece Confirmar', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ emisor: 'FERRETERIA EL TORNILLO SRL' })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /no está en la lista de Compras/)
  assert.match(r.texto, /FERRETERIA EL TORNILLO SRL/, 'se nombra al proveedor, no un "hubo un problema"')
  assert.deepEqual(r.attachments[0].actions.map((a) => a.id), ['corregir', 'descartar'])
})

test('un proveedor con otra grafía SÍ matchea contra el desplegable estricto', () => {
  const it = armarItem({ lectura: lecturaBarcelo({ emisor: 'combustibles barcelo' }), listas: LISTAS })
  assert.equal(it.comprobante.proveedor, 'Combustibles Barcelo')
  assert.equal(it.proveedorNuevo, false)
})

test('si NO se pudieron leer las listas, no se acusa al proveedor de nuevo', () => {
  const it = armarItem({ lectura: lecturaBarcelo({ emisor: 'CUALQUIER COSA SA' }), listas: { ok: false, proveedores: [], obras: [] } })
  assert.equal(it.proveedorNuevo, false, '"no sé" no es lo mismo que "no está"')
  assert.equal(it.listasVerificadas, false, 'y queda declarado')
})

// ── Sin obra ─────────────────────────────────────────────────────────────────

test('sin anotación manuscrita, la obra se PREGUNTA y no se puede confirmar', async () => {
  const { d } = armar({ lecturas: [lecturaBarcelo({ anotacion_manuscrita: null })] })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /no dice a qué obra va/)
  assert.ok(!r.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

// ── Idempotencia ─────────────────────────────────────────────────────────────

test('un comprobante YA CARGADO se avisa con su fila, y no se ofrece cargarlo de nuevo', async () => {
  const repo = repoMemoria()
  repo._cargados.set('c:30712345678|A|0113-00010489', { clave: 'c:30712345678|A|0113-00010489', fila: 412, hoja: 'Compras' })
  const { d } = armar({ repo })
  const r = await procesarPost(d, post())
  assert.match(r.texto, /ya está cargado en la fila 412/)
  assert.ok(!r.attachments[0].actions.some((a) => a.id === 'confirmar'))
})

// ── La puerta ────────────────────────────────────────────────────────────────

test('desde un canal que NO es el oficial no se carga nada', async () => {
  const { d } = armar({ port: portGuarda({ canalOk: false }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_canal')
  assert.match(r.texto, /canal de comprobantes/)
})

test('estar en el canal NO habilita: sin grant de permiso se deniega', async () => {
  const { d } = armar({ port: portGuarda({ permisoOk: false }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_permiso')
  assert.match(r.texto, /No tenés habilitada/)
})

test('un DM se rechaza sin gastar una consulta', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ actor: { ...ACTOR, channel_type: 'D' } }))
  assert.equal(r.estado, 'rechazado_canal')
})

test('FAIL-CLOSED: si la base no responde, se deniega', async () => {
  const { d } = armar({ port: portGuarda({ explota: true }) })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'rechazado_canal')
  assert.match(r.texto, /no cargué nada/i)
})

test('sin identidad de plataforma no se ejecuta nada', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ actor: { ...ACTOR, plataforma_user_id: null } }))
  assert.equal(r.estado, 'rechazado_sin_identidad')
})

test('sin la migración aplicada se avisa y no se revienta', async () => {
  const { d } = armar({ repo: repoMemoria().sinEsquema() })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'sin_esquema')
  assert.equal(r.texto, TEXTO.SIN_ESQUEMA)
})

// ── Adjuntos que no sirven ───────────────────────────────────────────────────

test('un formato que no se puede mirar se reporta con nombre y motivo', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'audio.mp3', mime: 'audio/mpeg' } } })
  const r = await bajarAdjunto(mm, 'f1')
  assert.equal(r.ok, false)
  assert.match(r.error, /audio\/mpeg/)
})

test('un archivo enorme no se baja', async () => {
  const mm = mmFalso({ archivos: { f1: { name: 'foto.jpg', mime: 'image/jpeg', size: 50 * 1024 * 1024 } } })
  const r = await bajarAdjunto(mm, 'f1')
  assert.equal(r.ok, false)
  assert.match(r.error, /pesa demasiado/)
})

test('si ninguno se pudo leer se dice, con el detalle de cada uno', async () => {
  const { d } = armar({ archivos: { f1: { name: 'x.mp3', mime: 'audio/mpeg' } } })
  const r = await procesarPost(d, post())
  assert.equal(r.estado, 'ilegible')
  assert.match(r.texto, /x\.mp3/)
})

test('un adjunto ilegible no tumba a los otros del mismo post', async () => {
  const { d } = armar({
    archivos: { f1: { mime: 'image/jpeg', name: 'ok.jpg' }, f2: { mime: 'audio/mpeg', name: 'malo.mp3' } },
  })
  const r = await procesarPost(d, post({ fileIds: ['f1', 'f2'] }))
  assert.equal(r.estado, 'confirmar')
  assert.match(r.texto, /No pude con estos/)
  assert.match(r.texto, /malo\.mp3/)
})

test('un post sin adjuntos no dispara ningún trabajo', async () => {
  const { d } = armar()
  const r = await procesarPost(d, post({ fileIds: [] }))
  assert.equal(r.estado, 'sin_adjuntos')
})

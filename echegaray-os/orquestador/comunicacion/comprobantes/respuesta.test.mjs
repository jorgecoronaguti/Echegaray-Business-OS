// EL DEFECTO EN ROJO: el bot decía «escribime otra» y escribirla no hacía nada.
//
// Estos tests cubren el círculo entero de la respuesta escrita: que el especialista la RECLAME (si
// no, nunca llega), que aplique la opción a todo el fajo, que cargue cuando ya no falta nada, que
// repregunte lo ambiguo en vez de adivinar, y que no le robe mensajes a nadie.

import test from 'node:test'
import assert from 'node:assert/strict'
import { repoMemoria } from './dobles.mjs'
import { atenderRespuesta, loQueFalta } from './respuesta.mjs'
import { interpretarRespuesta } from '../../lib/comprobantes/respuesta-texto.mjs'
import { especialista } from '../especialistas/comprobantes.mjs'
import { ESTADO } from '../../lib/comprobantes/fajo.mjs'

const ACTOR = { plataforma_user_id: 'u1', plataforma_username: 'jorge', channel_id: 'c1', plataforma: 'mattermost' }

/** Un comprobante completo salvo la obra, con tres obras posibles contadas por el historial. */
function itemSinObra(n = 1) {
  return {
    comprobante: {
      proveedor: 'Combustibles Barcelo', cuit: '20-12345678-9', tipo: 'FA', numero: `0001-0000000${n}`,
      fecha: '01/08/2026', total: 100 + n, iva: 21, categoria: 'Combustible', unidad: 'Obras', detalleObra: 'Civil',
    },
    sugerencia: { obra: { sugerido: 'MESSINA', n: 126, opciones: [{ valor: 'MESSINA', n: 41 }, { valor: 'TALLER', n: 18 }] } },
  }
}

async function fajoConItems(repo, items) {
  return await repo.abrirFajo(null, { userId: ACTOR.plataforma_user_id, channelId: ACTOR.channel_id, items })
}

const mmFalso = () => {
  const posts = []
  return { posts, async actualizarPost(p) { posts.push(p); return p } }
}

// ── El reclamo: sin esto el mensaje nunca llega al especialista ──────────────

test('el especialista RECLAMA la respuesta a su propia pregunta', async () => {
  const repo = repoMemoria()
  await fajoConItems(repo, [itemSinObra()])
  const port = { query: async () => ({ rows: [] }) }
  const r = await especialista.reconoce('MESSINA', { port: portConRepo(repo, port), actor: ACTOR, fileIds: [] })
  assert.equal(r?.destino, 'responder')
  assert.equal(r.respuesta.valor, 'MESSINA')
})

test('sin fajo abierto NO reclama nada: el mensaje sigue su camino', async () => {
  const repo = repoMemoria()
  const r = await especialista.reconoce('MESSINA', { port: portConRepo(repo, { query: async () => ({ rows: [] }) }), actor: ACTOR, fileIds: [] })
  assert.equal(r, null)
})

test('con fajo abierto, un mensaje que no contesta la pregunta NO se reclama', async () => {
  const repo = repoMemoria()
  await fajoConItems(repo, [itemSinObra()])
  const r = await especialista.reconoce('che, cuánto le debemos a Barcelo', { port: portConRepo(repo, { query: async () => ({ rows: [] }) }), actor: ACTOR, fileIds: [] })
  assert.equal(r, null)
})

test('si la base no contesta, no se reclama (falla hacia afuera, no secuestra el mensaje)', async () => {
  const port = { query: async () => { throw new Error('base caída') } }
  const r = await especialista.reconoce('MESSINA', { port, actor: ACTOR, fileIds: [] })
  assert.equal(r, null)
})

/** El especialista consulta la base por `repositorio.mjs`; acá se le da un port que devuelve el fajo del doble. */
function portConRepo(repo, base) {
  return {
    ...base,
    async query(sql, params) {
      if (/comprobante_fajos/.test(sql) && /estado = \$4/.test(sql)) {
        const f = await repo.fajoAbierto(null, { plataforma: params[0], userId: params[1], channelId: params[2] })
        return { rows: f ? [f] : [] }
      }
      return base.query(sql, params)
    },
  }
}

// ── Aplicar: una respuesta vale para todo el fajo ───────────────────────────

test('una sola respuesta imputa los tres comprobantes y los carga', async () => {
  const repo = repoMemoria()
  const fajo = await fajoConItems(repo, [itemSinObra(1), itemSinObra(2), itemSinObra(3)])
  const mm = mmFalso()
  const escrito = []
  const r = await atenderRespuesta(
    { port: null, mattermost: mm, repo, escribir: async (_d, f) => { escrito.push(f); return { texto: '✔ Cargado — Compras filas 811-813.', estado: ESTADO.CARGADO } } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'MESSINA') },
  )
  assert.match(r.texto, /Anotado/)
  assert.match(r.texto, /en los 3 comprobantes/)
  assert.match(r.texto, /filas 811-813/)
  assert.equal(escrito.length, 1)
  assert.equal(escrito[0].items.every((it) => it.comprobante.obra === 'MESSINA'), true)
})

test('si todavía falta algo, se dice QUÉ falta y no se carga', async () => {
  const repo = repoMemoria()
  const it = itemSinObra()
  delete it.comprobante.categoria
  it.sugerencia.categoria = { sugerido: 'Combustible', n: 9, opciones: [{ valor: 'Combustible', n: 9 }] }
  const fajo = await fajoConItems(repo, [it])
  let escribio = false
  const r = await atenderRespuesta(
    { port: null, mattermost: mmFalso(), repo, escribir: async () => { escribio = true; return {} } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'MESSINA') },
  )
  assert.equal(escribio, false, 'no puede cargar con la categoría sin decidir')
  assert.match(r.texto, /Me falta todavía/)
  assert.match(r.texto, /Categoría/)
  assert.equal(r.estado, 'anotado')
})

test('lo ambiguo se repregunta nombrando las dos: no se adivina ni se escribe', async () => {
  const repo = repoMemoria()
  const it = itemSinObra()
  it.sugerencia.obra = { sugerido: 'MESSINA 1', n: 20, opciones: [{ valor: 'MESSINA 1', n: 12 }, { valor: 'MESSINA 2', n: 8 }] }
  const fajo = await fajoConItems(repo, [it])
  let escribio = false
  const r = await atenderRespuesta(
    { port: null, mattermost: mmFalso(), repo, escribir: async () => { escribio = true; return {} } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'messina') },
  )
  assert.equal(escribio, false)
  assert.equal(r.estado, 'ambiguo')
  assert.match(r.texto, /MESSINA 1/)
  assert.match(r.texto, /MESSINA 2/)
})

test('descartar por escrito cierra el fajo y lo dice sin ambigüedad', async () => {
  const repo = repoMemoria()
  const fajo = await fajoConItems(repo, [itemSinObra()])
  const r = await atenderRespuesta(
    { port: null, mattermost: mmFalso(), repo },
    { fajo, respuesta: interpretarRespuesta(fajo, 'descartalo') },
  )
  assert.match(r.texto, /No cargué nada/)
  const despues = await repo.fajoPorId(null, fajo.id)
  assert.equal(despues.estado, ESTADO.DESCARTADO)
})

test('contestar un fajo ya cerrado no escribe nada y se explica', async () => {
  const repo = repoMemoria()
  const fajo = await fajoConItems(repo, [itemSinObra()])
  await repo.cerrarFajo(null, { id: fajo.id, estado: ESTADO.CARGADO })
  let escribio = false
  const r = await atenderRespuesta(
    { port: null, mattermost: mmFalso(), repo, escribir: async () => { escribio = true; return {} } },
    { fajo, respuesta: interpretarRespuesta(fajo, 'MESSINA') },
  )
  assert.equal(escribio, false)
  assert.match(r.texto, /ya se cerró/)
})

test('la tarjeta del bot se reescribe: la pregunta contestada no se vuelve a pedir', async () => {
  const repo = repoMemoria()
  const it = itemSinObra()
  delete it.comprobante.unidad
  it.sugerencia.unidad = { sugerido: 'Obras', n: 5, opciones: [{ valor: 'Obras', n: 5 }] }
  const fajo = await fajoConItems(repo, [it])
  await repo.guardarAvisoPost(null, { id: fajo.id, avisoPostId: 'post_bot_1' })
  const conAviso = await repo.fajoPorId(null, fajo.id)
  const mm = mmFalso()
  await atenderRespuesta({ port: null, mattermost: mm, repo, escribir: async () => ({}) },
    { fajo: conAviso, respuesta: interpretarRespuesta(conAviso, 'MESSINA') })
  assert.equal(mm.posts.length, 1)
  assert.equal(mm.posts[0].id, 'post_bot_1')
  assert.doesNotMatch(mm.posts[0].message, /¿A qué obra va\?/)
})

test('loQueFalta nombra las columnas reales de Compras, no las claves internas', () => {
  const it = itemSinObra()
  delete it.comprobante.detalleObra
  it.opciones = { detalle: { MESSINA: ['Civil'] } }
  it.comprobante.obra = 'MESSINA'
  assert.deepEqual(loQueFalta({ items: [it] }), ['Detalles / Obra'])
})

// TRES POSTS SEGUIDOS, UN SOLO MENSAJE. Sin Postgres, sin red y sin modelo.
//
// El defecto que se está arreglando es de PRODUCTO, no de código: el dueño manda doce fotos en tres
// posts y el bot le contesta tres veces. Por eso lo que se verifica acá es la CUENTA DE POSTS del
// bot —cuántos `crearPost` hubo— y no que "no tire excepción".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conLaTanda, TEXTO_MUDADO } from './tanda.mjs'
import { parteVacia } from '../../lib/comprobantes/parte.mjs'

/** El repositorio de tandas, en memoria. Misma interfaz que el real, cero SQL. */
function repoFalso({ hayTablas = true } = {}) {
  const tandas = []
  const partes = []
  return {
    tandas,
    partes,
    async tablasListas() { return hayTablas },
    async tandaViva(_p, { userId, channelId }) {
      return tandas.find((t) => t.estado === 'abierta' && t.plataforma_user_id === userId && t.channel_id === channelId) ?? null
    },
    async cerrarVencidas() {},
    async abrirTanda(_p, { userId, channelId, rootPostId }) {
      const t = { id: `t${tandas.length + 1}`, plataforma_user_id: userId, channel_id: channelId, root_post_id: rootPostId, aviso_post_id: null, estado: 'abierta' }
      tandas.push(t)
      return t
    },
    async abrirParte(_p, { tandaId, postId, recibidos }) {
      const ya = partes.find((x) => x.tanda_id === tandaId && x.post_id === String(postId))
      if (ya) return { nueva: false, parte: ya }
      const p = { tanda_id: tandaId, post_id: String(postId), estado: 'en_curso', parte: { ...parteVacia(), recibidos } }
      partes.push(p)
      return { nueva: true, parte: p }
    },
    async cerrarParte(_p, { tandaId, postId, parte }) {
      const p = partes.find((x) => x.tanda_id === tandaId && x.post_id === String(postId))
      if (p) { p.estado = 'listo'; p.parte = parte }
    },
    async estadoDeLaTanda(_p, tandaId) {
      const mias = partes.filter((x) => x.tanda_id === tandaId)
      const suma = mias.reduce((a, x) => ({
        ...a,
        recibidos: a.recibidos + (x.parte?.recibidos ?? 0),
        cargados: a.cargados + (x.parte?.cargados ?? 0),
        yaEstaban: a.yaEstaban + (x.parte?.yaEstaban ?? 0),
        ilegibles: [...a.ilegibles, ...(x.parte?.ilegibles ?? [])],
        sinImputar: [...a.sinImputar, ...(x.parte?.sinImputar ?? [])],
      }), parteVacia())
      return { parte: suma, enVuelo: mias.filter((x) => x.estado === 'en_curso').length }
    },
    async guardarAviso(_p, { id, avisoPostId }) {
      const t = tandas.find((x) => x.id === id)
      if (t && !t.aviso_post_id) t.aviso_post_id = avisoPostId
      return t?.aviso_post_id ?? null
    },
    async moverAviso(_p, { id, avisoPostId }) {
      const t = tandas.find((x) => x.id === id)
      if (t) t.aviso_post_id = avisoPostId
      return t?.aviso_post_id ?? null
    },
    async cerrarTanda(_p, { id }) {
      const t = tandas.find((x) => x.id === id)
      if (t) t.estado = 'cerrada'
    },
  }
}

/** Mattermost de mentira. Anota cada post creado y cada edición. */
function mmFalso() {
  const creados = []
  const editados = []
  return {
    creados,
    editados,
    async crearPost(p) { const post = { id: `post${creados.length + 1}`, ...p }; creados.push(post); return post },
    async actualizarPost(p) { editados.push(p); return p },
  }
}

const port = { query: async () => ({ rows: [] }) }

test('TRES POSTS SEGUIDOS: UN SOLO RESUMEN VIVO, y siempre en el ÚLTIMO mensaje', async () => {
  // ═══ POR QUÉ ESTE TEST CAMBIÓ (31/08) ═══
  //
  // Antes exigía `creados === 1`: un solo post del bot, reescrito. Cumplía la letra —el dueño pidió
  // "un mensaje, no una cascada"— y fallaba el efecto: Mattermost no notifica ni reordena un post
  // editado, así que la respuesta a las fotos de las 15:13 quedaba escrita ARRIBA, en el post de las
  // 15:08, y el dueño la leía como que el bot se colgó. Pasó en producción con 11 comprobantes ya
  // cargados en Compras que él nunca vio.
  //
  // El invariante que de verdad importa NO es cuántos posts hay: es que haya UN SOLO RESUMEN VIVO y
  // que esté ABAJO DE TODO. Los anteriores quedan como una línea que apunta al nuevo.
  const repo = repoFalso()
  const mm = mmFalso()
  const base = { plataforma: 'mattermost', userId: 'u1', channelId: 'c1', recibidos: 4 }

  for (const [i, postId] of ['p1', 'p2', 'p3'].entries()) {
    await conLaTanda({ port, mattermost: mm, repo }, { ...base, postId }, async () => ({
      texto: 'ignorado', estado: 'cargado',
      parte: { ...parteVacia(), recibidos: 4, cargados: 4 - (i === 2 ? 1 : 0), yaEstaban: i === 2 ? 1 : 0 },
    }))
  }

  assert.equal(repo.tandas.length, 1, 'se abrió más de una tanda')
  assert.equal(mm.creados.length, 3, 'el resumen tiene que bajar una vez por cada post del dueño')

  // El resumen vivo es el ÚLTIMO post publicado, y dice el total de los tres.
  const vivo = mm.creados.at(-1).id
  assert.equal(repo.tandas[0].aviso_post_id, vivo, 'la tanda quedó apuntando a un mensaje que no es el último')
  const ultimaEdicion = mm.editados.filter((e) => e.id === vivo).at(-1)
  assert.match(ultimaEdicion.message, /termin/i)
  assert.match(ultimaEdicion.message, /11 comprobantes/)
  assert.match(ultimaEdicion.message, /1 ya estaba cargado/)

  // Y NINGUNO de los anteriores quedó con un resumen compitiendo: los dos apuntan abajo.
  for (const viejo of mm.creados.slice(0, -1)) {
    const final = mm.editados.filter((e) => e.id === viejo.id).at(-1)
    assert.equal(final.message, TEXTO_MUDADO, `el mensaje ${viejo.id} quedó con un resumen viejo vivo`)
  }
})

test('si NO se puede publicar abajo, se reescribe arriba: peor lugar, nunca silencio', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  const base = { userId: 'u1', channelId: 'c1', recibidos: 4 }
  const trabajo = async () => ({ estado: 'cargado', parte: { ...parteVacia(), recibidos: 4, cargados: 4 } })

  await conLaTanda({ port, mattermost: mm, repo }, { ...base, postId: 'p1' }, trabajo)
  const primero = mm.creados[0].id
  mm.crearPost = async () => { throw new Error('mattermost no contesta') }
  await conLaTanda({ port, mattermost: mm, repo }, { ...base, postId: 'p2' }, trabajo)

  assert.equal(mm.creados.length, 1, 'publicó un mensaje que había fallado')
  const final = mm.editados.filter((e) => e.id === primero).at(-1)
  assert.match(final.message, /8 comprobantes/, 'el total de los dos posts no llegó a ningún lado')
  assert.notEqual(final.message, TEXTO_MUDADO, 'dejó un puntero apuntando a un mensaje que no existe')
})

test('el primer post publica el ⏳ ANTES de trabajar: el canal no se queda mudo dos minutos', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  let alEmpezar = null
  await conLaTanda({ port, mattermost: mm, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 8 }, async () => {
    alEmpezar = mm.creados[0]?.message ?? null
    return { estado: 'cargado', parte: { ...parteVacia(), recibidos: 8, cargados: 8 } }
  })
  assert.match(alEmpezar ?? '', /Recibí \*\*8 comprobantes\*\*/)
  assert.match(alEmpezar ?? '', /leyendo/)
})

test('mientras un post sigue en curso, el mensaje NO dice que terminó', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  let dentro = null
  // Se abre la parte del post 2 a mano: simula el post que llegó y todavía se está leyendo.
  const t = await repo.abrirTanda(port, { userId: 'u1', channelId: 'c1', rootPostId: 'p1' })
  await repo.abrirParte(port, { tandaId: t.id, postId: 'p2', recibidos: 4 })

  await conLaTanda({ port, mattermost: mm, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 4 }, async () => ({
    estado: 'cargado', parte: { ...parteVacia(), recibidos: 4, cargados: 4 },
  }))
  dentro = mm.editados.at(-1)?.message ?? mm.creados.at(-1)?.message
  assert.doesNotMatch(dentro ?? '', /termin/i)
  assert.match(dentro ?? '', /leyendo/)
  assert.equal(repo.tandas[0].estado, 'abierta', 'la tanda se cerró con un post todavía en curso')
})

test('un post REPETIDO (la tarea se reejecutó) no se cuenta dos veces ni vuelve a trabajar', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  let corridas = 0
  const trabajo = async () => {
    corridas += 1
    return { estado: 'cargado', parte: { ...parteVacia(), recibidos: 4, cargados: 4 } }
  }
  const m = { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 4 }
  await conLaTanda({ port, mattermost: mm, repo }, m, trabajo)
  const r = await conLaTanda({ port, mattermost: mm, repo }, m, trabajo)

  assert.equal(corridas, 1, 'la reejecución volvió a leer y a escribir')
  assert.equal(r.estado, 'repetido')
  assert.match(mm.editados.at(-1).message, /4 comprobantes/)
  assert.doesNotMatch(mm.editados.at(-1).message, /8 comprobantes/)
})

test('sin la migración aplicada NO se rompe nada: se responde como siempre', async () => {
  const repo = repoFalso({ hayTablas: false })
  const mm = mmFalso()
  const r = await conLaTanda({ port, mattermost: mm, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 1 }, async () => ({
    texto: 'el mensaje de siempre', estado: 'cargado', parte: parteVacia(),
  }))
  assert.equal(r.texto, 'el mensaje de siempre')
  assert.equal(r.silencioso, undefined)
  assert.equal(mm.creados.length, 0)
})

test('si el trabajo revienta, la parte se CIERRA igual: si no, la tanda nunca podría decir que terminó', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  await assert.rejects(() => conLaTanda({ port, mattermost: mm, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 2 }, async () => {
    throw new Error('google se cayó')
  }))
  assert.equal(repo.partes[0].estado, 'listo')
  // Y el mensaje puede decir que terminó: no quedó nada colgado en curso.
  assert.match(mm.editados.at(-1).message, /termin/i)
})

test('sin Mattermost no se pierde el mensaje: sale por el camino normal', async () => {
  const repo = repoFalso()
  const r = await conLaTanda({ port, mattermost: {}, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 1 }, async () => ({
    texto: 'x', estado: 'cargado', parte: { ...parteVacia(), recibidos: 1, cargados: 1 },
  }))
  assert.equal(r.silencioso, undefined)
  assert.match(r.texto, /termin/i)
})

test('NINGÚN post de la tanda lleva una tarjeta interactiva', async () => {
  const repo = repoFalso()
  const mm = mmFalso()
  await conLaTanda({ port, mattermost: mm, repo }, { userId: 'u1', channelId: 'c1', postId: 'p1', recibidos: 1 }, async () => ({
    estado: 'cargado', parte: { ...parteVacia(), recibidos: 1, cargados: 1 },
  }))
  for (const p of [...mm.creados, ...mm.editados]) {
    assert.deepEqual(p.props?.attachments ?? [], [], 'se publicó una tarjeta')
  }
})

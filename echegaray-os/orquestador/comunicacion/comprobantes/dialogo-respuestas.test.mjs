// EL DIÁLOGO: cuando el bot pregunta, la respuesta del dueño llega, se interpreta CONTRA la pregunta
// y se resuelve — o se repregunta nombrando lo que falta. Nunca silencio.
//
// CASO REAL (29/09/2026): fajo d939d408 (póliza Zurich, sin fecha). El bot preguntó por la fecha
// (aviso y1qekewxj3d4dnsx8ptkwt8cqe, hilo tcetsjrgniyqzxdukwigwwcpxr) y el dueño contestó «fecha de
// ayer» (y5nu85wbobd85kb7feoybodi9h). El consumer descartó el post ("ignorado por guarda": sólo dejaba
// pasar respuestas a iniciales de efectivo) y, aun si llegaba, el intérprete sólo entendía obras.

import test from 'node:test'
import assert from 'node:assert/strict'
import { repoMemoria } from './dobles.mjs'
import { atenderRespuesta } from './respuesta.mjs'
import { interpretarRespuesta, RESPUESTA } from '../../lib/comprobantes/respuesta-texto.mjs'
import { especialista } from '../especialistas/comprobantes.mjs'
import { esRespuestaDePregunta, crearHiloConPregunta } from '../mattermost-ws-consumer.mjs'

const AHORA = new Date('2026-09-29T15:00:00-03:00')
const ROOT = 'tcetsjrgniyqzxdukwigwwcpxr'
const ACTOR = { plataforma_user_id: 'u1', plataforma_username: 'jorge', channel_id: 'c1', plataforma: 'mattermost', root_post_id: ROOT }

function itemZurich() {
  return {
    comprobante: {
      proveedor: 'ZURICH ARGENTINA Compañia de Seguros S.A.', cuit: '30500049770', tipo: 'FA', numero: '0904-01367735',
      fecha: null, total: 3331599.98, neto: 2389066.25, iva: 501703.91, otrosTributos: 440829.82,
      categoria: 'N', obra: 'Vehiculos / Maquinas', unidad: 'Obras', detalleObra: 'Póliza', concepto: 'Póliza de seguro',
    },
    sugerencia: {},
  }
}
async function fajoZurich(repo) {
  const f = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', rootPostId: ROOT, postId: ROOT, items: [itemZurich()] })
  return f
}
function portConRepo(repo) {
  return {
    async query(sql, params) {
      if (/comprobante_fajos/.test(sql) && /estado = \$4/.test(sql)) {
        const f = await repo.fajoAbierto(null, { plataforma: params[0], userId: params[1], channelId: params[2] })
        return { rows: f ? [f] : [] }
      }
      return { rows: [] }
    },
  }
}

test('«fecha de ayer» se interpreta como la fecha faltante (28/09/2026)', async () => {
  const fajo = await fajoZurich(repoMemoria())
  const r = interpretarRespuesta(fajo, 'fecha de ayer', { ahora: AHORA })
  assert.equal(r?.que, RESPUESTA.FECHA)
  assert.equal(r.valor, '28/09/2026')
  assert.deepEqual(r.indices, [0])
})

test('otras formas de decir la fecha', async () => {
  const fajo = await fajoZurich(repoMemoria())
  const v = (t) => interpretarRespuesta(fajo, t, { ahora: AHORA })?.valor
  assert.equal(v('hoy'), '29/09/2026')
  assert.equal(v('ayer'), '28/09/2026')
  assert.equal(v('anteayer'), '27/09/2026')
  assert.equal(v('28/09'), '28/09/2026')
  assert.equal(v('es del 15/09/2026'), '15/09/2026')
  assert.equal(v('el 25 de septiembre'), '25/09/2026')
  assert.equal(v('12-9-26'), '12/09/2026')
})

test('una fecha imposible o futura NO se aplica', async () => {
  const fajo = await fajoZurich(repoMemoria())
  assert.notEqual(interpretarRespuesta(fajo, '31/02/2026', { ahora: AHORA })?.que, RESPUESTA.FECHA)
  assert.notEqual(interpretarRespuesta(fajo, '15/12/2026', { ahora: AHORA })?.que, RESPUESTA.FECHA)
})

test('sin pregunta de fecha abierta, «ayer» no se toma por fecha', async () => {
  const repo = repoMemoria()
  const it = itemZurich(); it.comprobante.fecha = '10/09/2026'
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', rootPostId: ROOT, items: [it] })
  assert.equal(interpretarRespuesta(fajo, 'ayer', { ahora: AHORA }), null)
})

test('el consumer deja pasar la respuesta en el hilo de un fajo abierto (antes: «ignorado por guarda»)', async () => {
  const repo = repoMemoria()
  await fajoZurich(repo)
  const hiloConPregunta = crearHiloConPregunta({
    port: { async query(sql, params) {
      if (/comprobante_fajos/.test(sql)) return { rows: (await repo.fajoAbierto(null, { userId: 'u1', channelId: 'c1' }))?.root_post_id === params[0] ? [{ 1: 1 }] : [] }
      return { rows: [] }
    } },
  })
  const info = { channelName: 'comprobantes-gastos', post: { id: 'y5nu85wbobd85kb7feoybodi9h', root_id: ROOT, user_id: 'u1', message: 'fecha de ayer', channel_id: 'c1' } }
  assert.equal(await esRespuestaDePregunta(info, { botUserId: 'bot', canales: new Set(['comprobantes-gastos']), hiloConPregunta }), true)
  const otro = { ...info, post: { ...info.post, root_id: 'otrohilo' } }
  assert.equal(await esRespuestaDePregunta(otro, { botUserId: 'bot', canales: new Set(['comprobantes-gastos']), hiloConPregunta }), false)
})

test('el especialista reclama «fecha de ayer» y la resuelve; carga cuando ya no falta nada', async () => {
  const repo = repoMemoria()
  await fajoZurich(repo)
  const ruta = await especialista.reconoce('fecha de ayer', { port: portConRepo(repo), actor: ACTOR, fileIds: [], ahora: AHORA })
  assert.equal(ruta?.destino, 'responder')
  assert.equal(ruta.respuesta.que, RESPUESTA.FECHA)
  const escrito = []
  const r = await atenderRespuesta(
    { port: null, mattermost: { async actualizarPost() {} }, repo, escribir: async (_d, f) => { escrito.push(f); return { texto: '✔ Cargado — Compras fila 1030.', estado: 'cargado' } } },
    { fajo: ruta.fajo, respuesta: ruta.respuesta })
  assert.match(r.texto, /28\/09\/2026/)
  assert.equal(escrito.length, 1)
  assert.equal(escrito[0].items[0].comprobante.fecha, '28/09/2026')
})

test('una respuesta que no se entiende, DENTRO del hilo de la pregunta, se repregunta nombrando lo que falta', async () => {
  const repo = repoMemoria()
  await fajoZurich(repo)
  const ruta = await especialista.reconoce('no sé, mirala vos', { port: portConRepo(repo), actor: ACTOR, fileIds: [], ahora: AHORA })
  assert.equal(ruta?.destino, 'responder')
  assert.equal(ruta.respuesta.que, RESPUESTA.NO_ENTENDIDA)
  const r = await atenderRespuesta({ port: null, mattermost: { async actualizarPost() {} }, repo }, { fajo: ruta.fajo, respuesta: ruta.respuesta })
  assert.match(r.texto, /fecha/i)
  assert.match(r.texto, /ayer|dd\/mm/i)
  assert.equal(r.estado, 'no_entendida')
})

test('fuera del hilo de la pregunta, lo que no se entiende NO se reclama', async () => {
  const repo = repoMemoria()
  await fajoZurich(repo)
  const ruta = await especialista.reconoce('no sé, mirala vos', { port: portConRepo(repo), actor: { ...ACTOR, root_post_id: 'otro' }, fileIds: [] })
  assert.equal(ruta, null)
})

test('un número contesta la opción de esa posición', async () => {
  const repo = repoMemoria()
  const it = itemZurich(); it.comprobante.fecha = '10/09/2026'; delete it.comprobante.obra
  it.sugerencia = { obra: { sugerido: 'MESSINA', n: 20, opciones: [{ valor: 'MESSINA', n: 12 }, { valor: 'TALLER', n: 8 }] } }
  const fajo = await repo.abrirFajo(null, { userId: 'u1', channelId: 'c1', rootPostId: ROOT, items: [it] })
  for (const t of ['2', 'la 2', 'la segunda', 'opcion 2']) {
    const r = interpretarRespuesta(fajo, t, { ahora: AHORA })
    assert.equal(r?.valor, 'TALLER', t)
  }
  assert.equal(interpretarRespuesta(fajo, '5', { ahora: AHORA })?.que !== RESPUESTA.OPCION, true)
})

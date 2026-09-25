// LA LECTURA EN PAUSA NO ES UN COMPROBANTE RECHAZADO (25/09/2026).
//
// Ese día la cuenta de la API se quedó sin crédito y la cola web marcó RECHAZADAS dos fotos buenas de la
// ER-0023, como si el papel estuviera mal. Lo que estas pruebas impiden: que una falla de la API (saldo,
// credencial, proveedor caído, red, fusible de gasto) se lea como un defecto del comprobante — en la
// pantalla, en la cola web y en el chat. Sin red y sin base: `fetchImpl` y el port son de mentira, y la
// telemetría de IA está apagada (ORQ_IA_SIN_REGISTRO) para no ensuciar `orq.chat_cost`.
process.env.ORQ_IA_SIN_REGISTRO = '1'

import test from 'node:test'
import assert from 'node:assert/strict'
import { leerAdjunto, motivoDePausa } from '../../lib/comprobantes/vision.mjs'
import { DESTINO, rendicionDeAdjuntos, textoRendicion } from '../../lib/comprobantes/rendicion.mjs'
import { parteDeRendicion, parteVacia, sumarPartes, textoTanda } from '../../lib/comprobantes/parte.mjs'
import {
  ENTRADA, PAUSA_MINUTOS, PREFIJO_PAUSA, aplicarReintento, estadoDeEntrada, repartirVeredicto,
} from '../../lib/comprobantes/entrada-web.mjs'
import { procesarUnLote, tomarLote } from './cola-web.mjs'
import { cierreDeImputacion } from './imputacion-a-entrega.mjs'

const SIN_CREDITO = 'lectura en pausa: sin crédito de la API'

test('qué es pausa: saldo, credencial, saturación, caída, red y fusible; un pedido mal armado NO', () => {
  assert.equal(motivoDePausa('credit'), SIN_CREDITO)
  assert.match(motivoDePausa('auth'), /credencial/)
  assert.match(motivoDePausa('permission'), /credencial/)
  assert.match(motivoDePausa('rate_limit'), /saturada/)
  assert.match(motivoDePausa('server'), /no responde/)
  assert.match(motivoDePausa('network'), /conexión/)
  assert.match(motivoDePausa('fusible_hora'), /tope de gasto/)
  assert.equal(motivoDePausa('client'), null, 'un 400 nuestro es un defecto, no una pausa')
  assert.equal(motivoDePausa('unknown'), null)
})

test('la API caída (500 en las dos llamadas) devuelve pausa, no «no pude leer»', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '' })
  const r = await leerAdjunto({ data: 'AAAA', mediaType: 'image/jpeg', nombre: 'f.jpg' }, { apiKey: 'k', fetchImpl })
  assert.equal(r.ok, false)
  assert.equal(r.pausa, 'lectura en pausa: la API no responde')
})

test('sin credencial configurada tampoco es el papel', async () => {
  const r = await leerAdjunto({ data: 'AAAA', mediaType: 'image/jpeg', nombre: 'f.jpg' }, { apiKey: '', fetchImpl: async () => ({}) })
  assert.match(r.pausa ?? '', /^lectura en pausa/)
})

// ── lo que dice la rendición y el mensaje del chat ─────────────────────────────────────────────────

const PROBLEMAS = [
  { fileId: 'f1', nombre: 'IMG_1.jpg', error: 'la lectura del comprobante falló (400): Your credit balance is too low', pausa: SIN_CREDITO },
  { fileId: 'f2', nombre: 'IMG_2.jpg', error: 'la lectura del comprobante falló (400): Your credit balance is too low', pausa: SIN_CREDITO },
]

test('en pausa el adjunto queda EN ESPERA: ni «ilegible» ni «no pude leer ni el importe»', () => {
  const rend = rendicionDeAdjuntos({ fileIds: ['f1', 'f2'], items: [], problemas: PROBLEMAS })
  assert.deepEqual(rend.porAdjunto.map((a) => a.destino), [DESTINO.EN_PAUSA, DESTINO.EN_PAUSA])
  assert.equal(rend.cuadra, true)
  const t = textoRendicion(rend)
  assert.match(t, /2 en espera \(lectura en pausa\)/)
  assert.doesNotMatch(t, /no pude leer/)
  const p = parteDeRendicion(rend)
  assert.deepEqual(p.ilegibles, [])
  assert.deepEqual(p.pausados.map((x) => x.nombre), ['IMG_1.jpg', 'IMG_2.jpg'])
})

test('el chat contesta que quedaron en espera, nunca que falló el comprobante', () => {
  // La tanda suma las partes de cada post: con una parte vacía delante tiene que salir igual.
  const p = sumarPartes(parteVacia(), parteDeRendicion(rendicionDeAdjuntos({ fileIds: ['f1', 'f2'], problemas: PROBLEMAS })))
  assert.equal(p.recibidos, 2)
  const t = textoTanda(p)
  assert.match(t.split('\n')[0], /^⏸ \*\*Quedaron en espera: lectura en pausa: sin crédito de la API\.\*\*/)
  assert.match(t, /No es un problema de los comprobantes/)
  assert.doesNotMatch(t, /no (lo|los) pude leer|Terminé, pero no cargué ninguno|Mandámelos de nuevo\./)
})

test('mezclado: los que entraron se dicen, y los en pausa aparte, sin culpar al papel', () => {
  const p = { ...parteVacia(), recibidos: 3, cargados: 1, suma: 1000, pausados: [{ nombre: 'IMG_2.jpg', motivo: SIN_CREDITO }] }
  const t = textoTanda(p)
  assert.match(t, /Cargué \*\*1 comprobante\*\*/)
  assert.match(t, /⏸ 1 quedó en espera \(lectura en pausa: sin crédito de la API\): `IMG_2\.jpg`/)
})

test('el ticket con número de entrega en pausa: se dice la pausa, no «no quedó ningún comprobante»', () => {
  const r = cierreDeImputacion({ entrega: { codigo: 'ER-0023', persona: 'Rodrigo Echegaray' }, parte: { pausados: [{ nombre: 'a.jpg', motivo: SIN_CREDITO }] } })
  assert.match(r.linea, /todavía: lectura en pausa: sin crédito de la API\. No es el comprobante/)
})

// ── la cola web ────────────────────────────────────────────────────────────────────────────────────

const SALIDA_PAUSA = {
  estado: 'en_pausa', texto: `⏸ **No los leí todavía: ${SIN_CREDITO}.**`,
  parte: { ...parteVacia(), pausados: [{ nombre: 'image.jpg', motivo: SIN_CREDITO }] },
}

test('web: en pausa vuelve a PENDIENTE con el motivo claro, y el reintento no la convierte en error', () => {
  const v = estadoDeEntrada(SALIDA_PAUSA)
  assert.equal(v.estado, ENTRADA.PENDIENTE)
  assert.equal(v.pausa, true)
  assert.equal(v.motivo, 'lectura en pausa: sin crédito de la API, se reintenta sola')
  assert.ok(v.motivo.startsWith(PREFIJO_PAUSA), 'el SQL de tomarLote reconoce la pausa por este prefijo')
  // Aunque se hayan gastado todos los intentos, una pausa no es un error técnico.
  assert.equal(aplicarReintento(v, 99).estado, ENTRADA.PENDIENTE)
})

test('web: en un lote mezclado, sólo el archivo en pausa vuelve a la cola', () => {
  const filas = [{ id: 'a', nombre_archivo: 'bien.jpg' }, { id: 'b', nombre_archivo: 'pausa.jpg' }]
  const r = repartirVeredicto(filas, { estado: ENTRADA.CARGADO, motivo: 'Cargado en Compras' }, { pausados: [{ nombre: 'pausa.jpg', motivo: SIN_CREDITO }] })
  assert.deepEqual(r.map((x) => [x.id, x.estado, x.pausa === true]), [['a', ENTRADA.CARGADO, false], ['b', ENTRADA.PENDIENTE, true]])
  assert.match(r[1].motivo, /^lectura en pausa: sin crédito de la API, se reintenta sola$/)
})

function portCola(filas) {
  const q = []
  return {
    q,
    async query(sql, args = []) {
      q.push({ sql, args })
      if (/with siguiente/.test(sql)) return { rows: filas }
      if (/from public\.perfiles/.test(sql)) return { rows: [{ rol: 'administracion', nombre: 'Quien Sea' }] }
      return { rows: [] }
    },
  }
}

test('web: tomarLote no retoma lo pausado hasta que pasen los minutos de espera', async () => {
  const port = portCola([])
  await tomarLote(port)
  const { sql, args } = port.q[0]
  assert.deepEqual(args, [PREFIJO_PAUSA, PAUSA_MINUTOS])
  assert.match(sql, /coalesce\(motivo, ''\) like \$1 \|\| '%' and tomado_at > now\(\) - make_interval\(mins => \$2::int\)/)
})

test('web: el lote en pausa se guarda PENDIENTE, con su motivo, y devuelve el intento gastado', async () => {
  const fila = { id: 'e1', lote: '11111111-1111-1111-1111-111111111111', storage_path: 'u/e1.jpg', nombre_archivo: 'image.jpg', media_type: 'image/jpeg', subido_por: '22222222-2222-2222-2222-222222222222', intentos: 3 }
  const port = portCola([fila])
  const r = await procesarUnLote({ port, procesar: async () => SALIDA_PAUSA })
  assert.equal(r.estado, ENTRADA.PENDIENTE)
  const up = port.q.find((x) => /^\s*update public\.comprobante_entrada\s+set estado = \$2/.test(x.sql))
  assert.equal(up.args[1], ENTRADA.PENDIENTE, 'no RECHAZADO')
  assert.equal(up.args[2], 'lectura en pausa: sin crédito de la API, se reintenta sola')
  assert.equal(up.args[5], true, 'el intento no cuenta')
  assert.match(up.sql, /intentos = case when \$6::boolean then greatest\(intentos - 1, 0\) else intentos end/)
})

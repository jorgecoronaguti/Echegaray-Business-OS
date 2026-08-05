#!/usr/bin/env node
// PROBARLO EN VIVO SIN DEPENDER DEL DUEÑO — el bucle de verificación que faltaba.
//
// ═══ POR QUÉ ═══
//
// Hasta hoy la única evidencia posible de que la carga por Mattermost funciona era que el dueño
// mandara una foto y sacara una captura. Eso no es un bucle de verificación: es un humano haciendo
// de test, y encima uno que sólo se puede correr cuando él está disponible. Todo lo demás estaba
// probado contra un Mattermost falso, y un Mattermost falso nunca devolvió `Invalid RootId
// parameter` ni se tragó un mensaje por un canal que no existía.
//
// ═══ EL BOT NO ES ADMIN ═══
//
// No puede publicar en nombre de una persona, así que NO se puede simular por WebSocket un mensaje
// tuyo. Lo que sí se puede —y cubre todo el camino menos el frame WS, que casi nunca es el problema—
// es inyectar en el BORDE DE INGESTA, con un post REAL:
//
//   1. se sube el archivo y se crea un post de verdad en el canal, con el token del bot;
//   2. se llama `conector.recibir(...)` con el id REAL de ese post y el user_id de una persona real
//      (con un id inventado, Mattermost rechaza la respuesta con `Invalid RootId parameter` y el
//      evento se va a dead-letter: eso sería el arnés fallando, no el producto);
//   3. se espera al worker DE PRODUCCIÓN y se LEE del servidor lo que quedó publicado en el hilo.
//
// LA EVIDENCIA ES EL EFECTO: lo que se imprime al final es el mensaje releído de Mattermost, no lo
// que devolvió una función.
//
// ═══ DÓNDE CORRERLO ═══
//
// Por default en `os-pruebas`, que es un canal privado del equipo. Correrlo contra `compras` publica
// de verdad en el canal donde trabaja la gente: hay que pedirlo con `--canal compras`, y encima
// escribir en Compras es efecto económico, así que ahí conviene usar `--texto` con una obra que no
// exista para que frene en la pregunta.
//
// Uso:
//   node orquestador/scripts/probar-archivo-en-vivo.mjs --archivo /ruta/factura.jpg
//   node orquestador/scripts/probar-archivo-en-vivo.mjs --archivo x.csv --canal administracion
//   node orquestador/scripts/probar-archivo-en-vivo.mjs --texto "MESSINA"          # sin archivo: prueba la respuesta escrita
//   node orquestador/scripts/probar-archivo-en-vivo.mjs --archivo x.jpg --como jorge --esperar 180
//
// Entorno: set -a; . ~/.config/echegaray-orq/comunicacion.env; set +a

import fs from 'node:fs'
import path from 'node:path'
import { query, closePool } from '../lib/db.mjs'
import { crearConector } from '../comunicacion/conector.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'

function arg(nombre, def = null) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : def
}
const tiene = (n) => process.argv.includes(`--${n}`)

const ARCHIVO = arg('archivo')
const CANAL = arg('canal', 'os-pruebas')
const COMO = arg('como', 'jorge')
const TEXTO = arg('texto', '')
const ESPERAR_S = Number(arg('esperar', 120))

const MIMES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.csv': 'text/csv', '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.txt': 'text/plain',
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function mmGet(mm, ruta) {
  const base = String(process.env.MM_BASE_URL ?? '').replace(/\/+$/, '')
  const r = await fetch(base + ruta, { headers: { Authorization: `Bearer ${process.env.MM_BOT_TOKEN}` } })
  if (!r.ok) throw new Error(`GET ${ruta} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

/** El canal, resuelto POR NOMBRE contra la API. Nunca un id escrito a mano. */
async function resolverCanal(mm, nombre) {
  const equipos = await mmGet(mm, '/api/v4/users/me/teams')
  for (const t of equipos) {
    try {
      const c = await mmGet(mm, `/api/v4/teams/${t.id}/channels/name/${encodeURIComponent(nombre)}`)
      if (c?.id) return c
    } catch { /* en este equipo no está: se sigue */ }
  }
  throw new Error(`no existe el canal "${nombre}" en ningún equipo del bot (o el bot no es miembro)`)
}

async function resolverUsuario(mm, username) {
  return await mmGet(mm, `/api/v4/users/username/${encodeURIComponent(username)}`)
}

/** Los posts del hilo, RELEÍDOS DEL SERVIDOR. Es la única evidencia que vale. */
async function hilo(mm, rootId) {
  const j = await mmGet(mm, `/api/v4/posts/${rootId}/thread`)
  return Object.values(j?.posts ?? {})
    .filter((p) => p.id !== rootId)
    .sort((a, b) => a.create_at - b.create_at)
}

async function main() {
  const mm = mattermostDelOs()
  if (!mm) throw new Error('sin MM_BASE_URL / MM_BOT_TOKEN: el cliente real es fail-closed, no hay fallback')

  const canal = await resolverCanal(mm, CANAL)
  const persona = await resolverUsuario(mm, COMO)
  console.log(`\ncanal   : ${canal.display_name} (${canal.name} · ${canal.id}) tipo ${canal.type}`)
  console.log(`como    : @${persona.username} (${persona.id})`)

  // 1) El archivo, subido de verdad.
  const fileIds = []
  if (ARCHIVO) {
    const abs = path.resolve(ARCHIVO)
    const datos = fs.readFileSync(abs)
    const nombre = path.basename(abs)
    const mime = MIMES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream'
    const info = await mm.subirArchivo({ channel_id: canal.id, nombre, datos, mime })
    fileIds.push(info.id)
    console.log(`archivo : ${nombre} · ${datos.length} bytes · ${mime} → file_id ${info.id}`)
  } else if (!TEXTO) {
    throw new Error('hace falta --archivo o --texto: sin ninguno de los dos no hay nada que probar')
  }

  // 2) El post REAL. Su id es el que se usa como post_id y root_id: uno inventado hace que
  //    Mattermost rechace la respuesta con `Invalid RootId parameter` y el evento muera en
  //    dead-letter, que es el arnés fallando y no el producto.
  const post = await mm.crearPost({
    channel_id: canal.id,
    message: TEXTO || `(prueba en vivo del OS · ${new Date().toISOString()})`,
    file_ids: fileIds.length ? fileIds : undefined,
  })
  console.log(`post    : ${post.id}`)

  // 3) La inyección en el borde de ingesta, con la identidad de una persona real.
  // `verificador: null` = MISMA construcción que usa el consumidor WS de producción
  // (`mattermost-ws-consumer.mjs`). Ese verificador defiende el webhook ENTRANTE por HTTP, que ya
  // no existe: la autenticidad la da la conexión WS autenticada del bot. Armarlo desde el entorno
  // acá haría que el arnés se rechazara a sí mismo por `secreto_faltante` y pareciera un defecto del
  // producto. `botUserId` va para que el anti-eco funcione igual que en producción.
  const con = crearConector({ port: { query }, verificador: null, botUserId: process.env.MM_BOT_USER_ID ?? null })
  const ev = await con.recibir({
    user_id: persona.id,
    user_name: persona.username,
    channel_id: canal.id,
    channel_name: canal.name,
    channel_type: canal.type,
    post_id: post.id,
    root_id: post.id,
    text: TEXTO,
    file_ids: fileIds,
  }, { plataforma: 'mattermost' })
  // Un rechazo devuelve `{rechazado, motivo}` y NO un evento: sin esta distinción el arnés seguía
  // adelante imprimiendo `correlation undefined` y esperando en vano una respuesta que nunca se
  // encoló. Un arnés que no sabe que falló es peor que no tener arnés.
  if (!ev || ev.rechazado || !ev.correlation_id) {
    throw new Error(`conector.recibir no creó evento (${ev?.motivo ?? 'lo filtró una guarda del communication-service'})`)
  }
  console.log(`evento  : ${ev.type} · correlation ${ev.correlation_id}`)

  // 4) Esperar al worker DE PRODUCCIÓN y leer del servidor. No se mira lo que devolvió una función:
  //    se mira lo que quedó publicado.
  console.log(`\nesperando la respuesta publicada (hasta ${ESPERAR_S}s)…`)
  const hasta = Date.now() + ESPERAR_S * 1000
  let respuestas = []
  while (Date.now() < hasta) {
    await dormir(3000)
    respuestas = await hilo(mm, post.id)
    if (respuestas.length) break
    process.stdout.write('.')
  }
  console.log('')

  if (!respuestas.length) {
    console.log('\n✗ NO HUBO RESPUESTA. Dónde mirar, en este orden:')
    console.log('   · comunicacion.outbox   → select estado, dead, error from comunicacion.outbox order by creado_at desc limit 5;')
    console.log('   · el worker             → journalctl --user -u echegaray-comunicacion-worker -n 80 --no-pager')
    console.log('   · el cableado           → node orquestador/scripts/auditar-cableado-chat.mjs')
    process.exitCode = 1
  } else {
    console.log('═══ RESPUESTA PUBLICADA (releída de Mattermost) ═══\n')
    for (const p of respuestas) {
      console.log(`── post ${p.id} · ${new Date(p.create_at).toISOString().slice(11, 19)} ──`)
      console.log(p.message)
      const att = p.props?.attachments ?? []
      for (const a of att) {
        const acciones = (a.actions ?? []).map((x) => `[${x.name}]`).join(' ')
        if (acciones) console.log(`   botones: ${acciones}`)
      }
      console.log('')
    }
  }

  // 5) Lo que quedó en la base, que es donde se ve si algo murió sin decirlo.
  const outbox = await query(
    `select estado, dead, coalesce(error,'') as error from comunicacion.outbox
      where correlation_id = $1 order by creado_at`, [ev.correlation_id]).catch(() => ({ rows: [] }))
  if (outbox.rows.length) {
    console.log('outbox  :', outbox.rows.map((r) => `${r.estado}${r.dead ? ' DEAD' : ''}${r.error ? ` (${r.error.slice(0, 80)})` : ''}`).join(' · '))
  }
  const arch = await query(
    `select nombre, familia, formato, destino, estado, coalesce(error,'') as error
       from comunicacion.archivos_recibidos where post_id = $1`, [post.id]).catch(() => ({ rows: [] }))
  for (const r of arch.rows) console.log(`archivo : ${r.nombre} · ${r.familia}/${r.formato} → ${r.destino} · ${r.estado}${r.error ? ` (${r.error})` : ''}`)
  const fajos = await query(
    `select id, estado, jsonb_array_length(items) as n from comunicacion.comprobante_fajos where $1 = any(post_ids)`,
    [post.id]).catch(() => ({ rows: [] }))
  for (const r of fajos.rows) console.log(`fajo    : ${r.id} · ${r.estado} · ${r.n} comprobante(s)`)

  if (tiene('--limpiar')) {
    // El post de prueba se puede borrar; la respuesta del bot cuelga de él y se va con él.
    const base = String(process.env.MM_BASE_URL ?? '').replace(/\/+$/, '')
    await fetch(`${base}/api/v4/posts/${post.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${process.env.MM_BOT_TOKEN}` } })
    console.log('\n(post de prueba borrado)')
  }
  console.log('')
}

main()
  .catch((e) => { console.error('\n✗ probar-archivo-en-vivo:', e?.message ?? e); process.exitCode = 2 })
  .finally(() => closePool().catch(() => {}))

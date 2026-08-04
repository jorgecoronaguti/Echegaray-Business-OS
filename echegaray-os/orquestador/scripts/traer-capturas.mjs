#!/usr/bin/env node
// TRAER LAS CAPTURAS QUE EL DUEÑO MANDA A MATTERMOST, Y DEJARLAS EN UN TAMAÑO QUE SE PUEDA MIRAR.
//
// ═══ EL PROBLEMA QUE RESUELVE (04/08) ═══
//
// El dueño mandó seis capturas de certificaciones al chat y la API las rechazó: «At least one of the
// image dimensions exceed max allowed size for many-image requests: 2000 pixels». Le pedí tres veces
// que las reenviara más chicas, y tres veces me contestó —con razón— que él ya las había mandado.
//
// Lo que YO había prometido —"las busco en disco y las achico"— era imposible por ese camino: una
// imagen pegada en el chat viaja de su Mac a la API y NUNCA toca esta VM. No hay nada que buscar.
//
// Este script abre el camino que sí existe: la manda al canal de Mattermost —donde ya las manda para
// los comprobantes—, el OS las baja acá, las redimensiona y las deja en disco. Desde ese momento son
// un archivo local y se leen sin límite de tamaño.
//
//   node orquestador/scripts/traer-capturas.mjs --dm jorge             # el privado con el bot ← lo normal
//   node orquestador/scripts/traer-capturas.mjs --canal obras --n 10
//   node orquestador/scripts/traer-capturas.mjs --lado 1600            # techo del lado mayor
//
// EL PRIVADO CON EL BOT ES LA VÍA POR DEFECTO, y no es una preferencia de implementación: una
// certificación de avance no va al canal de gastos ni mezclada con los comprobantes. El dueño lo dijo
// mejor que yo — "eso está pésimo, es una práctica errónea". Mandarle una captura al bot es la forma
// natural de pasarle algo al OS sin ensuciar el canal de nadie.
//
// NO BORRA NADA y no escribe en ningún Sheet: baja, redimensiona y guarda.

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const arg = (n, d = null) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }

const BASE = (process.env.MM_BASE_URL || '').replace(/\/$/, '')
const TOKEN = process.env.MM_BOT_TOKEN || ''
const CANAL = arg('canal', null)
const DM = arg('dm', null)
const CUANTOS = Number(arg('n', 8))
// 2000 px es el techo de la API cuando van VARIAS imágenes juntas. Se deja margen: el costo de una
// imagen más chica es nada comparado con el de una que no se puede mirar.
const LADO = Number(arg('lado', 1600))
const DESTINO = arg('destino', join(process.env.TMPDIR || '/tmp', 'capturas-os'))

async function mm(ruta) {
  const r = await fetch(`${BASE}/api/v4${ruta}`, { headers: { authorization: `Bearer ${TOKEN}` } })
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${await r.text().catch(() => '')}`.slice(0, 200))
  return r
}

async function main() {
  if (!BASE || !TOKEN) throw new Error('faltan MM_BASE_URL / MM_BOT_TOKEN')
  let canal = null
  if (DM || !CANAL) {
    // EL CANAL DIRECTO CON EL BOT. Su id lo arma Mattermost con los dos user_id ordenados; se pide
    // con `POST /channels/direct` y los dos ids, que además lo crea si todavía no existía.
    const quien = DM || 'jorge'
    const u = await (await mm(`/users/username/${encodeURIComponent(quien)}`)).json()
    const yo = process.env.MM_BOT_USER_ID
    if (!yo) throw new Error('falta MM_BOT_USER_ID para abrir el privado')
    const r = await fetch(`${BASE}/api/v4/channels/direct`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify([yo, u.id]),
    })
    if (!r.ok) throw new Error(`no pude abrir el privado con ${quien}: ${r.status}`)
    canal = await r.json()
  } else {
    const equipos = await (await mm('/teams')).json()
    for (const t of equipos) {
      try { canal = await (await mm(`/teams/${t.id}/channels/name/${encodeURIComponent(CANAL)}`)).json(); break } catch { /* probamos el siguiente equipo */ }
    }
    if (!canal?.id) throw new Error(`no encontré el canal "${CANAL}"`)
  }

  const posts = await (await mm(`/channels/${canal.id}/posts?per_page=60`)).json()
  const orden = (posts.order || []).map((id) => posts.posts[id]).filter(Boolean)
    .sort((a, b) => b.create_at - a.create_at)

  const archivos = []
  for (const p of orden) for (const fid of p.file_ids || []) archivos.push({ fid, at: p.create_at, user: p.user_id })
  const donde = DM || !CANAL ? `el privado con ${DM || 'jorge'}` : `#${CANAL}`
  if (!archivos.length) { console.log(`sin adjuntos en ${donde}`); return }

  await mkdir(DESTINO, { recursive: true })
  const salida = []
  for (const a of archivos.slice(0, CUANTOS)) {
    const info = await (await mm(`/files/${a.fid}/info`)).json()
    if (!/^image\//.test(info.mime_type || '')) continue
    const buf = Buffer.from(await (await mm(`/files/${a.fid}`)).arrayBuffer())
    const meta = await sharp(buf).metadata()
    // EL ID DEL ARCHIVO VA EN EL NOMBRE. Seis capturas pegadas en el mismo post llegan las seis como
    // `image.png` y con el mismo timestamp: sin el id se pisaban entre sí y quedaba UNA. Pasó en la
    // primera corrida real — el script dijo "6 capturas listas" y había un solo archivo escrito seis
    // veces. Un contador de lo que se bajó no vale nada si no cuenta lo que quedó.
    const ruta = join(DESTINO, `${new Date(a.at).toISOString().slice(0, 19).replace(/[:T]/g, '')}-${a.fid.slice(0, 8)}-${info.name.replace(/[^\w.-]/g, '_')}.jpg`)
    // `withoutEnlargement`: una captura que ya entra NO se agranda. Reescalar hacia arriba no agrega
    // información y sí agrega peso y borrosidad.
    await sharp(buf).rotate().resize({ width: LADO, height: LADO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 }).toFile(ruta)
    const fin = await sharp(ruta).metadata()
    salida.push({ ruta, de: `${meta.width}×${meta.height}`, a: `${fin.width}×${fin.height}` })
  }

  if (!salida.length) { console.log(`los últimos adjuntos de ${donde} no son imágenes`); return }
  console.log(`${salida.length} captura(s) listas para leer:\n`)
  for (const s of salida) console.log(`  ${s.ruta}\n     ${s.de} → ${s.a}`)
}

main().catch((e) => { console.error('✗', e.message); process.exitCode = 1 })

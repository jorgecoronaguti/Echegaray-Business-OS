#!/usr/bin/env node
// REPROCESAR POSTS DEL CANAL EFECTIVO QUE EL BOT DESCARTÓ POR «SIN ENTREGA» (queja del dueño, 02/10/2026).
//
// Antes del 02/10, una foto mandada al canal Efectivo por quien no tenía entrega abierta se contestaba
// «no cargué el ticket» y se descartaba (estado `rechazado_sin_entrega`). Ahora entra como compra común.
// Esto vuelve a pasar los posts perdidos por el MISMO camino (`especialista.atender` de Rendiciones):
// mismo fajo, misma lectura, mismas preguntas, misma escritura, respuesta en el hilo del post original.
//
// No usa `conector.recibir`: su dedup es por post.id y los posts ya están en el inbox.
//
//   ENSAYO (default: no escribe, no sube, no publica):
//     node --env-file=~/.config/echegaray-orq/comunicacion.env orquestador/scripts/reprocesar-posts-efectivo.mjs --desde 2026-10-01 --hasta 2026-10-02
//   REAL (escribe Compras y publica la respuesta en el hilo; requiere el OK del dueño):
//     ... mismo comando + --aplicar
//   Opcional: --post <id> (repetible) para limitar a posts concretos; --usuario <username>.
//
// Idempotente: un archivo ya guardado en `compra_adjunto` (origen_file_id) se omite.
import { query, withTx, closePool } from '../lib/db.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'
import { googleDelOs } from '../lib/google-os.mjs'
import { especialista } from '../comunicacion/especialistas/rendiciones.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null }
const todos = (n) => process.argv.flatMap((a, i) => (a === n ? [process.argv[i + 1]] : []))
const APLICAR = process.argv.includes('--aplicar')
const desde = Date.parse(`${arg('--desde') ?? '2026-10-01'}T00:00:00-03:00`)
const hasta = Date.parse(`${arg('--hasta') ?? '2026-10-02'}T00:00:00-03:00`)
const SOLO_POSTS = new Set(todos('--post'))
const USUARIO = arg('--usuario')

async function main() {
  const mm = mattermostDelOs()
  if (!mm) throw new Error('sin cliente de Mattermost (MM_BASE_URL/MM_BOT_TOKEN)')
  const { rows: canales } = await query(
    `select channel_id, canal_nombre from comunicacion.canales_area
      where plataforma='mattermost' and area_clave='rendicion' and activo`)
  if (!canales.length) throw new Error('no hay canal de rendicion en comunicacion.canales_area')
  const { rows: guardados } = await query('select origen_file_id from public.compra_adjunto where origen_file_id is not null')
  const yaEstan = new Set(guardados.map((r) => r.origen_file_id))

  const pendientes = []
  for (const c of canales) {
    for (let page = 0; ; page++) {
      const d = await mm.postsDelCanal({ channel_id: c.channel_id, page, per_page: 200 })
      const orden = d?.order ?? []
      if (!orden.length) break
      for (const id of orden) {
        const p = d.posts[id]
        if (!p || p.delete_at || p.create_at < desde || p.create_at >= hasta) continue
        if (SOLO_POSTS.size && !SOLO_POSTS.has(id)) continue
        const archivos = (p.metadata?.files ?? []).map((f) => f.id)
        if (!archivos.length) continue
        const nuevos = archivos.filter((f) => !yaEstan.has(f))
        if (!nuevos.length) continue
        const u = await mm.usuario(p.user_id).catch(() => null)
        if (USUARIO && u?.username !== USUARIO) continue
        pendientes.push({ canal: c, post: p, usuario: u?.username ?? p.user_id, fileIds: nuevos })
      }
    }
  }
  console.log(`${APLICAR ? 'REAL' : 'ENSAYO (no escribe)'} — posts con archivos sin guardar: ${pendientes.length}`)
  for (const x of pendientes) {
    console.log(`  post ${x.post.id.slice(0, 8)}… ${new Date(x.post.create_at).toISOString()} @${x.usuario} archivos=${x.fileIds.length}`)
    if (!APLICAR) continue
    const actor = { plataforma_user_id: x.post.user_id, plataforma_username: x.usuario, channel_id: x.canal.channel_id, root_post_id: x.post.root_id || x.post.id }
    const r = await especialista.atender({
      texto: x.post.message ?? '', port: { query, withTx }, actor, google: googleDelOs({}), fileIds: x.fileIds,
      postId: x.post.id, mattermost: mm, intencion: { destino: 'rendir', confianza: 1 },
    })
    await mm.crearPost({ channel_id: x.canal.channel_id, root_id: x.post.root_id || x.post.id, message: r.texto })
    console.log(`    → ${r.estado}`)
  }
  if (!APLICAR) console.log('Ensayo: nada escrito. Para reprocesar de verdad, agregar --aplicar (con el OK del dueño).')
}
main().catch((e) => { console.error('ERROR:', String(e?.message ?? e).slice(0, 200)); process.exitCode = 1 }).finally(() => closePool?.())

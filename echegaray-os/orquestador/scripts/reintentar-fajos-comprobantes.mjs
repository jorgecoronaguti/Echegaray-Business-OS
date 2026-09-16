#!/usr/bin/env node
// REINTENTAR A MANO LOS FAJOS QUE GOOGLE DEJÓ SIN CARGAR.
//
// El worker de comunicación lo hace solo cada minuto (`comprobantes/reintento.mjs`). Esto existe para
// no esperar al turno, para ver qué hay en la cola sin tocar nada, y para correrlo desde una terminal
// con `comunicacion.env` cargado el día en que el worker esté caído.
//
//   node orquestador/scripts/reintentar-fajos-comprobantes.mjs --listar     # qué hay en `reintento`
//   node orquestador/scripts/reintentar-fajos-comprobantes.mjs --ahora      # ignora el turno: los toma todos
//   node orquestador/scripts/reintentar-fajos-comprobantes.mjs [--json]     # sólo los que ya tienen turno
//
// ESCRIBE EN EL SHEET (por el cargador, con su freno de mano) y PUBLICA en Mattermost. No tiene
// `--dry`: el ensayo del cargador es `ORQ_COMPROBANTES_ENSAYO=1`, como en el bot.

import { reintentarFajos } from '../comunicacion/comprobantes/reintento.mjs'
import * as repo from '../comunicacion/comprobantes/repositorio.mjs'
import { ESTADO } from '../lib/comprobantes/fajo.mjs'
import { hayMattermost, mattermostDelOs } from '../lib/mattermost-os.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')

async function main() {
  if (!process.env.DATABASE_URL) { console.error('✖ falta DATABASE_URL'); process.exitCode = 1; return }
  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }
  const log = {
    info: (m, o) => process.stdout.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
    warn: (m, o) => process.stderr.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
    error: (m, o) => process.stderr.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
  }
  try {
    if (args.includes('--listar')) {
      const { rows } = await port.query(
        `select id, plataforma, plataforma_username, channel_id, intentos, proximo_intento_at, error,
                jsonb_array_length(items) as comprobantes, creado_at
           from comunicacion.comprobante_fajos where estado = $1 order by proximo_intento_at asc nulls first`,
        [ESTADO.REINTENTO])
      if (json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
      else if (!rows.length) process.stdout.write('· no hay fajos en reintento\n')
      else for (const r of rows) process.stdout.write(`· ${r.id} ${r.plataforma}/${r.plataforma_username ?? '?'} ${r.comprobantes} comprobante(s) · intentos ${r.intentos} · turno ${r.proximo_intento_at?.toISOString?.() ?? r.proximo_intento_at} · ${String(r.error ?? '').slice(0, 80)}\n`)
      return
    }
    if (args.includes('--ahora')) {
      const { rowCount } = await port.query(
        'update comunicacion.comprobante_fajos set proximo_intento_at = now() where estado = $1', [ESTADO.REINTENTO])
      log.info(`↻ ${rowCount} fajo(s) con turno adelantado`)
    }
    let publicar = null
    if (hayMattermost()) {
      const mm = mattermostDelOs({ log })
      publicar = ({ channelId, rootPostId, texto }) => mm.crearPost({ channel_id: channelId, message: texto, ...(rootPostId ? { root_id: rootPostId } : {}) })
    } else {
      log.warn('sin MM_BASE_URL/MM_BOT_TOKEN: cargo pero NO puedo avisar en el hilo')
    }
    const r = await reintentarFajos({ port, publicar, repo, log })
    process.stdout.write(json ? `${JSON.stringify(r, null, 2)}\n` : `✔ ${JSON.stringify(r)}\n`)
  } finally {
    await db.closePool?.().catch?.(() => {})
  }
}

// Guarda de import: importarlo desde un test no corre nada contra la base real.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`✖ ${String(e?.message ?? e)}`); process.exitCode = 1 })
}

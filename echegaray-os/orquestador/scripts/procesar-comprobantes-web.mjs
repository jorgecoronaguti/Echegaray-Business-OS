#!/usr/bin/env node
// EL WORKER DE LA COLA DE COMPROBANTES DE LA PANTALLA 24.
//
// La app deja el archivo en Storage y una fila en `public.comprobante_entrada`. Esto la vacía,
// pasando cada lote por el MISMO circuito que el bot de Mattermost. Corre por systemd cada minuto
// (`echegaray-comprobantes-web.timer`), no como daemon: una corrida que termina no puede quedarse
// con un cliente de Google viejo ni con una conexión colgada, y el arranque cuesta menos de lo que
// costó cualquiera de los timers que este repo ya tuvo que investigar.
//
//   node orquestador/scripts/procesar-comprobantes-web.mjs           # vacía la cola
//   node orquestador/scripts/procesar-comprobantes-web.mjs --json
//   node orquestador/scripts/procesar-comprobantes-web.mjs --health  # ¿está todo lo que hace falta?
//
// NO TIENE `--dry`: no hay nada que ensayar acá. Lo que decide qué se escribe es el cargador, que
// tiene el suyo, y el freno de mano de Sheets sigue mandando aguas abajo. Un `--dry` en este nivel
// daría la falsa impresión de haber probado la escritura sin haberla tocado.

import { accesoAStorage } from '../lib/storage-supabase.mjs'
import { drenarCola } from '../comunicacion/comprobantes/cola-web.mjs'

const args = process.argv.slice(2)
const json = args.includes('--json')

/** Qué falta para poder trabajar. Se dice ANTES de tomar una fila: tomarla y no poder bajar el
 *  archivo gastaría un intento por una variable de entorno que nadie puso. */
function faltantes() {
  const falta = []
  if (!process.env.DATABASE_URL) falta.push('DATABASE_URL')
  // Sin la llave de visión el worker toma la fila y la rechaza con «no hay lectura disponible»:
  // eso no es «listo», es ciego. Se exige acá, antes de tomar nada (prueba real 25/08).
  if (!process.env.ANTHROPIC_API_KEY) falta.push('ANTHROPIC_API_KEY (anthropic.env)')
  const s = accesoAStorage(process.env)
  if (!s.ok) falta.push(s.falta)
  return falta
}

async function main() {
  const falta = faltantes()
  if (args.includes('--health')) {
    const salida = { ok: falta.length === 0, falta }
    process.stdout.write(json ? `${JSON.stringify(salida, null, 2)}\n` : (salida.ok ? '✔ listo\n' : `✖ falta: ${falta.join(' · ')}\n`))
    process.exitCode = salida.ok ? 0 : 1
    return
  }
  if (falta.length) {
    // Salir 0 A PROPÓSITO: que la VM todavía no tenga la clave de Storage no es una falla del
    // servicio, es una configuración pendiente. Marcarlo `failed` cada minuto llenaría el journal
    // de rojo que en dos días nadie mira — y el que importa se perdería ahí adentro.
    process.stdout.write(`↷ no proceso nada: falta ${falta.join(' · ')} en esta máquina\n`)
    return
  }

  const db = await import('../lib/db.mjs')
  const port = { query: (...a) => db.query(...a) }
  const { makeGoogleClient } = await import('../lib/google.mjs')
  const google = await makeGoogleClient()
  const log = {
    info: (m, o) => process.stdout.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
    error: (m, o) => process.stderr.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
    warn: (m, o) => process.stderr.write(`${m}${o ? ` ${JSON.stringify(o)}` : ''}\n`),
  }

  try {
    const r = await drenarCola({ port, google, log })
    if (json) process.stdout.write(`${JSON.stringify(r, null, 2)}\n`)
    else if (r.lotes.length || r.reciclados) {
      process.stdout.write(`✔ ${r.lotes.length} lote(s) procesado(s)${r.reciclados ? `, ${r.reciclados} fila(s) recicladas` : ''}\n`)
    }
  } finally {
    await db.closePool?.().catch?.(() => {})
  }
}

main().catch((e) => {
  process.stderr.write(`✖ ${String(e?.message ?? e)}\n`)
  process.exitCode = 1
})

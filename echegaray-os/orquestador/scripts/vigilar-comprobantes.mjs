#!/usr/bin/env node
// EL AUDITOR DE COMPROBANTES, CORRIDO SOLO — SÓLO LECTURA. NO ESCRIBE NI UNA CELDA.
//
// `auditar-comprobantes-cargados.mjs` sabe encontrar el descalce entre el registro de cargas y la
// pestaña Compras. Lo que le faltaba era que alguien lo llamara: hasta el 14/08 el único disparo era
// una persona acordándose. Ahora hay dos, y los dos usan la misma lib (`lib/comprobantes/vigilancia.mjs`):
//
//   1. el bot, al CERRAR cada carga — ahí nacen los descalces del propio bot;
//   2. este script, por timer — para los que nacen sin que el bot cargue nada: el dueño borrando una
//      fila a mano, o el cargador de Claude Code, que escribe en Compras y NO anota en el registro.
//
// LO QUE ENCUENTRA QUEDA CONSULTABLE en `public.backlog_autonomo` (origen_tabla =
// 'comunicacion.comprobantes_cargados'), que es de donde la vigilancia autónoma y el Director levantan
// lo que el OS detecta solo. Idempotente por título: correrlo diez veces no produce diez ítems.
//
//   node orquestador/scripts/vigilar-comprobantes.mjs         # informe + anota lo nuevo
//   node orquestador/scripts/vigilar-comprobantes.mjs --dry   # informe, NO anota nada
//   node orquestador/scripts/vigilar-comprobantes.mjs --json

import { auditar } from './auditar-comprobantes-cargados.mjs'
import { descalces, avisoDescalces, anotarDescalces, fajosMudos, avisoFajosMudos } from '../lib/comprobantes/vigilancia.mjs'
import { fajosSinAviso } from '../comunicacion/comprobantes/repositorio.mjs'

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const json = args.includes('--json')

  const { makeGoogleClient } = await import('../lib/google.mjs')
  const google = await makeGoogleClient()
  let db = null
  try { db = await import('../lib/db.mjs') } catch { db = null }
  const port = db ? { query: (...a) => db.query(...a) } : null

  const resultado = await auditar({ google, port })
  const d = descalces(resultado)

  // ═══ LA SEGUNDA RED, POR SI EL WORKER ESTUVO CAÍDO (25/08) ═══
  //
  // Quien salva la conversación es el barrido del propio worker (`comprobantes/vigia-mudos.mjs`):
  // avisa a los minutos, no al día siguiente. Pero un fajo queda mudo justo cuando el worker no
  // pudo publicar, y a veces la razón es que el worker no estaba. Acá no se publica nada —este
  // script no habla por Mattermost— : se INFORMA, que es lo que un timer de auditoría puede hacer
  // sin abrir un segundo camino de publicación.
  const mudos = port ? await fajosSinAviso(port, { minutos: 30, limite: 50 }).then((f) => fajosMudos(f, { minutos: 30 })).catch(() => null) : null

  if (!d.disponible) {
    // NO PODER LEER EL REGISTRO NO ES "NO HAY DESCALCES". Confundirlos haría que un Postgres caído
    // se leyera como un archivo sano, que es la peor forma de que un control mienta: callado y verde.
    const salida = { ok: false, motivo: 'no se pudo leer el registro del bot: no afirmo que no haya descalces' }
    process.stdout.write(json ? `${JSON.stringify(salida, null, 2)}\n` : `⚠ ${salida.motivo}\n`)
    process.exitCode = 1
    await db?.closePool?.().catch?.(() => {})
    return
  }

  const todos = [...d.sinGasto, ...d.sinRastro]
  const anotado = dry || !todos.length ? { anotados: 0, yaEstaban: 0 } : await anotarDescalces(port, todos)
  const aviso = avisoDescalces(d, { nuevos: dry ? null : anotado.anotados })

  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: true, ...d, ...anotado, mudos, dry }, null, 2)}\n`)
  } else if (!todos.length) {
    process.stdout.write('✓ El registro de cargas y la pestaña Compras coinciden: ningún descalce.\n')
  } else {
    process.stdout.write(`${aviso}\n`)
    for (const x of todos) process.stdout.write(`   · ${x.estado} — ${x.proveedor ?? '?'} ${x.numero ?? ''} (clave ${x.clave ?? '?'})\n`)
    if (dry) process.stdout.write('\n(--dry) No anoté nada en el backlog.\n')
    else process.stdout.write(`\n${anotado.anotados ?? '?'} anotado(s) en public.backlog_autonomo, ${anotado.yaEstaban} ya estaban.\n`)
    // Salir distinto de 0 es lo que hace que un timer de systemd deje rastro en el journal cuando hay
    // algo: un control que siempre sale 0 obliga a leer la salida para saber si encontró algo.
    process.exitCode = d.sinGasto.length ? 2 : 0
  }
  // NO PODER MIRAR NO ES «NO HAY»: `mudos === null` significa que la consulta no se pudo hacer, y se
  // dice. Callarlo haría que una base caída se leyera igual que un canal sano.
  if (!json) {
    if (mudos === null) process.stdout.write('⚠ No pude revisar si quedaron cargas trabadas sin avisar.\n')
    else if (mudos.length) { process.stdout.write(`\n${avisoFajosMudos(mudos)}\n`); process.exitCode = 2 }
  }
  await db?.closePool?.().catch?.(() => {})
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.stack ?? e); process.exitCode = 1 })
}

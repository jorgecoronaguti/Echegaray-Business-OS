#!/usr/bin/env node
// CICLO DEL TESORERO INVERSOR IA — el entrypoint que corre el timer del OS.
//
//   node orquestador/scripts/ciclo-tesorero.mjs            # corrida normal
//   node orquestador/scripts/ciclo-tesorero.mjs --dry      # no publica, no escribe el ledger
//   node orquestador/scripts/ciclo-tesorero.mjs --forzar   # publica aunque no haya cambio material
//
// NO depende de Claude Code, de una terminal ni de una conversación abierta. Toda la aritmética es
// determinística: en una corrida normal este proceso hace CERO llamadas a la API de Anthropic.
//
// Balanz: si no hay una sesión de Chrome que reusar, el ciclo NO intenta entrar — publica
// SESSION_REQUIRED y termina bien. Que falte el mercado no invalida el análisis de caja, que es la
// mitad que más decide.

import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { query, closePool } from '../lib/db.mjs'
import { correrCiclo } from '../lib/tesoreria/ciclo.mjs'
import { relevar } from '../lib/tesoreria/balanz-navegador.mjs'
import {
  abrirCorrida, cerrarCorrida, guardarPosicion, guardarVentanas, guardarInstrumentos,
  guardarRecomendaciones, guardarBloqueos, resumenAnterior, vencerPropuestas, politicaVigente,
} from '../lib/tesoreria/ledger.mjs'

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry')
const FORZAR = args.has('--forzar')
const CANAL = process.env.ORQ_TESORERIA_CANAL || process.env.MM_CANAL_DIRECCION || null

/** Publicador. En seco imprime; en real usa el MISMO cliente del resto del OS, nunca un Fake. */
async function hacerPublicador() {
  if (DRY || !CANAL) return async (t) => { console.log('\n--- (no publicado) ---\n' + t + '\n') }
  const { resolverCliente } = await import('../comunicacion/conector.mjs')
  const { cliente, tipoCliente } = resolverCliente({})
  if (tipoCliente !== 'real') throw new Error('sin cliente real de Mattermost: no se publica contra un Fake')
  return async (texto) => { await cliente.crearPost({ channel_id: CANAL, message: texto }) }
}

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
  const publicar = await hacerPublicador()

  // La política vive en la base, no en el código: la reserva mínima es una decisión del dueño.
  const politica = DRY ? {} : {
    reserva_minima: await politicaVigente(query, 'reserva_minima').catch(() => null),
    caja_restringida: await politicaVigente(query, 'caja_restringida').catch(() => null),
  }
  const anterior = DRY ? null : await resumenAnterior(query).catch(() => null)

  let runId = null
  if (!DRY) {
    await vencerPropuestas(query).catch(() => 0)
    runId = await abrirCorrida(query, { spreadsheetId: null })
  }

  let r
  try {
    r = await correrCiclo(
      { google, query: DRY ? null : query, relevar, publicar },
      { politica, anterior, publicarSiempre: FORZAR, dias: 90 },
    )
  } catch (e) {
    if (runId) await cerrarCorrida(query, runId, { estado: 'error', motivo: String(e?.message ?? e).slice(0, 300) })
    throw e
  }

  console.log(`[tesorero] estado=${r.estado} publicado=${r.publicado ?? false} motivo="${r.motivo_publicacion ?? r.motivo ?? ''}"`)
  for (const p of r.traza ?? []) console.log(`  · ${p.paso}: ${p.estado}${p.detalle ? ` — ${p.detalle}` : ''}`)

  if (runId) {
    await guardarPosicion(query, runId, r.posicion)
    await guardarVentanas(query, runId, r.excedente?.ventanas ?? [])
    await guardarInstrumentos(query, runId, r.instrumentos ?? [])
    await guardarRecomendaciones(query, runId, r.recomendaciones ?? [], r.validaciones ?? [])
    await guardarBloqueos(query, runId, r.bloqueos ?? [])
    await cerrarCorrida(query, runId, {
      estado: r.estado === 'omitida' ? 'omitida' : r.estado,
      motivo: r.motivo ?? r.motivo_publicacion ?? null,
      publicado: Boolean(r.publicado),
      sesion: r.estado === 'session_required' ? 'requerida' : 'ok',
      payload: { resumen: r.resumen, traza: r.traza, sin_propuesta: r.sin_propuesta, rechazadas: r.rechazadas },
    })
  }
}

main()
  .catch((e) => { console.error('[tesorero] error:', e.message); process.exitCode = 1 })
  .finally(() => closePool())

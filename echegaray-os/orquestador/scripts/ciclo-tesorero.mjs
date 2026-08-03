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
import { configRuntime, tomarCerrojo, soltarCerrojo } from '../lib/tesoreria/navegador-runtime.mjs'
import { prepararNavegador } from '../lib/tesoreria/preparar-navegador.mjs'
import { enlaceRemoto } from './balanz-runtime.mjs'
import {
  abrirCorrida, cerrarCorrida, guardarPosicion, guardarVentanas, guardarInstrumentos,
  guardarRecomendaciones, guardarBloqueos, resumenAnterior, vencerPropuestas, politicaVigente,
  filaCajaRestringida, composicionAnterior,
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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES })
  const publicar = await hacerPublicador()

  // EL CERROJO DEL NAVEGADOR. Es distinto del lock de la base (ese evita dos corridas): éste le
  // avisa al VIGÍA que hay una corrida en curso, para que no reinicie el navegador en mitad de un
  // relevamiento. Una corrida interrumpida a la mitad no falla: devuelve medio mercado, que es peor.
  const cfgNav = configRuntime()
  await tomarCerrojo(cfgNav)

  // Las políticas viven en la base, no en el código: la reserva mínima es una decisión del dueño.
  // Se lee la FILA entera —no sólo el valor— porque el aprobador vive en la fila, y sin aprobador
  // una política guardada sigue siendo una propuesta.
  const filaReserva = DRY ? null : await politicaVigente(query, 'reserva_minima').catch(() => null)
  const filaRestringida = DRY ? null : await filaCajaRestringida(query).catch(() => ({ error: 'no se pudo leer la política de caja restringida' }))
  const anterior = DRY ? null : await resumenAnterior(query).catch(() => null)
  const compAnterior = DRY ? null : await composicionAnterior(query).catch(() => null)

  let runId = null
  if (!DRY) {
    await vencerPropuestas(query).catch(() => 0)
    runId = await abrirCorrida(query, { spreadsheetId: null })
  }

  let r
  try {
    r = await correrCiclo(
      {
        google, query: DRY ? null : query, relevar, publicar,
        // EL NAVEGADOR ES DE LA CASA. Antes esto dependía del Chrome de la Mac del dueño y de un
        // túnel SSH: si él cerraba la notebook, el agente se quedaba sin mercado y el aviso decía
        // "no hay sesión", que era falso — no había navegador. Ahora el ciclo lo levanta si hace
        // falta, espera a que abra, repone la pestaña si se perdió, y sólo pide una persona cuando
        // lo único que falta es el login.
        prepararNavegador: () => prepararNavegador(configRuntime(), { dormirImpl: dormir }),
        // El enlace se genera SÓLO si se lo pide el ciclo, y sólo cuando la sesión venció.
        enlaceRemoto: async () => enlaceRemoto().url,
      },
      {
        filaReserva, filaRestringida, anterior, composicionAnterior: compAnterior,
        publicarSiempre: FORZAR, dias: 90,
        // La validación del extractor contra la pantalla real es un HECHO que se declara por entorno,
        // no algo que el agente pueda afirmar de sí mismo. Sin ella, todo sale NO_ACCIONABLE.
        // La frescura NO entra por acá: la mide el ciclo con los instrumentos relevados, después de
        // mirar el mercado. Cablearla en false hacía que nada fuera nunca accionable.
        extractorValidado: process.env.ORQ_BALANZ_EXTRACTOR_VALIDADO === '1',
      },
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
  // El cerrojo se suelta SIEMPRE, incluso si la corrida explotó: si no, el vigía se queda creyendo
  // que hay una corrida en curso y deja de supervisar hasta que el cerrojo vence solo.
  .finally(async () => { await soltarCerrojo(configRuntime()).catch(() => {}); await closePool() })

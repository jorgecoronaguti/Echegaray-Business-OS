// VIGÍA DEL NAVEGADOR — supervisión independiente del ciclo financiero.
//
// ═══ POR QUÉ SEPARADO DEL CICLO ═══
//
// El ciclo corre dos veces por día hábil. Si el navegador se cae un lunes a las 10, con sólo el
// ciclo nadie se entera hasta las 15:30 — y el aviso llega junto con "no pude ver el mercado", o sea
// cuando ya se perdió una corrida. El vigía mira seguido y barato: ni abre pestañas, ni releva, ni
// gasta un solo crédito de API.
//
// ═══ LAS DOS MANERAS DE MOLESTAR, Y CÓMO SE EVITAN ═══
//
// Avisar de más: una alerta cada quince minutos se aprende a ignorar, y entonces el día que dice
// algo nuevo tampoco se lee. Se avisa UNA vez por incidente.
//
// Avisar de menos: si el incidente se cierra sin avisar, el dueño no sabe que ya puede volver a
// confiar en el agente. Cuando la sesión vuelve, se dice.
//
// ═══ LO QUE NUNCA HACE ═══
//
// No reinicia el navegador por una sesión vencida (la sesión vive en la pestaña: reiniciar la borra
// y no recupera nada). No inicia sesión. No toca el navegador durante una corrida — el cerrojo.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ESTADO, configRuntime, diagnosticar, rutaCerrojo, CERROJO_VENCE_MS } from './navegador-runtime.mjs'
import { recuperarNavegador, mensajeNecesitaAutenticacion, mensajeNavegadorRoto, mensajeSesionRestaurada } from './preparar-navegador.mjs'

/** Cada cuánto se puede repetir un aviso del MISMO incidente. Un día: no es una alerta urgente. */
export const REPETIR_AVISO_MS = Number(process.env.ORQ_BALANZ_REPETIR_AVISO_MS || 24 * 60 * 60 * 1000)

const rutaMemoria = (cfg) => join(cfg.base, 'estado', 'vigia.json')

export async function leerMemoria(cfg) {
  try { return JSON.parse(await readFile(rutaMemoria(cfg), 'utf8')) } catch { return { estado: null, avisado_en: null } }
}

export async function guardarMemoria(cfg, m) {
  await mkdir(join(cfg.base, 'estado'), { recursive: true }).catch(() => {})
  await writeFile(rutaMemoria(cfg), JSON.stringify(m), 'utf8')
}

/** ¿Hay una corrida en curso? Se lee el cerrojo del runtime: el vigía no interrumpe una corrida. */
export async function hayCorrida(cfg, ahora = Date.now()) {
  try {
    const c = JSON.parse(await readFile(rutaCerrojo(cfg), 'utf8'))
    return ahora - Number(c.tomado_en || 0) < CERROJO_VENCE_MS
  } catch { return false }
}

/**
 * ¿Corresponde avisar? Sí cuando el estado CAMBIÓ, o cuando pasó el tiempo de repetición. Es lo que
 * separa "te aviso que se rompió" de "te recuerdo cada cuarto de hora que sigue roto".
 */
export function correspondeAvisar(estado, memoria = {}, ahora = Date.now()) {
  if (estado === memoria.estado) {
    const desde = Number(memoria.avisado_en || 0)
    return ahora - desde > REPETIR_AVISO_MS
  }
  return true
}

const NECESITA_AVISO = new Set([ESTADO.SESSION_REQUIRED, ESTADO.BROWSER_ERROR, ESTADO.BALANZ_TARGET_MISSING])

/**
 * UNA RONDA. Devuelve qué encontró y qué hizo; no lanza.
 *
 * @param {object} o
 * @param {Function} [o.publicar] async (texto) => void — si falta, el vigía observa y no habla
 * @param {Function} [o.enlace]   () => {url} — el enlace a la pantalla remota, sólo si hace falta
 */
export async function rondaVigia({ cfg = configRuntime(), publicar = null, enlace = null, deps = {}, ahora = Date.now() } = {}) {
  if (await hayCorrida(cfg, ahora)) {
    return { estado: 'omitida', motivo: 'hay una corrida en curso: no se toca el navegador' }
  }

  const d = await diagnosticar(cfg, deps)
  const memoria = await leerMemoria(cfg)
  const acciones = []

  // ARRANCANDO no es un incidente: es un navegador que todavía no terminó de abrir. Ni se recupera
  // ni se avisa — si en la próxima ronda sigue así, ahí sí será BROWSER_ERROR.
  if (d.estado === ESTADO.BROWSER_STARTING) {
    return { estado: d.estado, aviso: false, motivo: 'el navegador está arrancando', acciones }
  }

  // RECUPERACIÓN: sólo lo roto.
  if (d.estado === ESTADO.BROWSER_ERROR) {
    const r = await recuperarNavegador(cfg, deps).catch((e) => ({ recuperado: false, motivo: String(e?.message ?? e) }))
    if (r.recuperado) acciones.push('se reinició el navegador')
  }

  const avisar = NECESITA_AVISO.has(d.estado) && correspondeAvisar(d.estado, memoria, ahora)
  let texto = null

  if (avisar) {
    if (d.estado === ESTADO.SESSION_REQUIRED) {
      const url = enlace ? await Promise.resolve(enlace()).then((x) => x?.url ?? x).catch(() => null) : null
      texto = mensajeNecesitaAutenticacion({ enlace: url, detalle: d.detalle, ahora: new Date(ahora) })
    } else {
      texto = mensajeNavegadorRoto({ detalle: d.detalle, acciones, ahora: new Date(ahora) })
    }
  }

  // EL CIERRE DEL INCIDENTE. Si el estado anterior pedía a una persona y ahora hay sesión, se avisa
  // que volvió: sin esto, el dueño se queda sin saber si su login sirvió.
  if (d.estado === ESTADO.SESSION_ACTIVE && NECESITA_AVISO.has(memoria.estado)) {
    texto = mensajeSesionRestaurada({ ahora: new Date(ahora) })
  }

  if (texto && publicar) await publicar(texto)
  await guardarMemoria(cfg, { estado: d.estado, avisado_en: texto ? ahora : (memoria.avisado_en ?? null) })

  return { estado: d.estado, aviso: Boolean(texto), texto, acciones, detalle: d.detalle }
}

export const VERSION = '1.0.0'

// CUÁNDO SE VUELVE A PEDIR LA PÁGINA — la lógica pura del tiempo real, sin React ni navegador.
//
// Llega un aviso «cambió `registros_hh`» (ver la migración 20260915T2100). La pantalla no lo pinta:
// hace `router.refresh()` y el servidor vuelve a leer con la RLS de siempre. Lo que decide este
// archivo es CUÁNDO, porque cada refresco es una lectura completa de la página contra una base Small
// que ya se cayó por carga:
//
//   · SILENCIO: se espera 1 s sin avisos nuevos. El importador de horas escribe en ráfagas; diez
//     avisos seguidos son un solo refresco.
//   · ESPERA MÁXIMA: una ráfaga que no para (un importador de un minuto) no puede postergar el
//     refresco para siempre. A los 5 s del primer aviso se refresca igual.
//   · INTERVALO MÍNIMO: nunca dos refrescos de la misma pestaña a menos de 5 s.
//   · DESFASE: diez pestañas abiertas que reciben el mismo aviso no le piden la página a la base en
//     el mismo milisegundo. Cada ráfaga suma un desfase al azar de hasta 1,5 s (lo sortea quien llama:
//     acá entra como número, para que el test sea determinístico).
//
// Y LA REGLA DEL DUEÑO: «la interfaz no se mueve mientras se trabaja». Con el foco en un campo o una
// celda marcada en edición no se refresca: el aviso queda pendiente y se atiende al salir del foco.
// Con la pestaña oculta tampoco: se atiende al volver.

import { z } from 'zod'
import { destinoEditable } from '../lib/pilaDeDeshacer.ts'

export interface ConfigDeRefresco {
  silencioMs: number
  esperaMaximaMs: number
  intervaloMinimoMs: number
  desfaseMaximoMs: number
}

export const CONFIG_DE_REFRESCO: ConfigDeRefresco = {
  silencioMs: 1000,
  esperaMaximaMs: 5000,
  intervaloMinimoMs: 5000,
  desfaseMaximoMs: 1500,
}

export interface EstadoDeRefresco {
  /** Primer aviso de la ráfaga que todavía no se atendió. `null` = nada pendiente. */
  primerAviso: number | null
  ultimoAviso: number | null
  desfase: number
  ultimoRefresco: number | null
}

export const ESTADO_INICIAL: EstadoDeRefresco = { primerAviso: null, ultimoAviso: null, desfase: 0, ultimoRefresco: null }

export type Decision =
  | { tipo: 'nada' }
  | { tipo: 'diferir' }
  | { tipo: 'esperar'; ms: number }
  | { tipo: 'refrescar' }

export interface Entorno {
  editando: boolean
  oculta: boolean
}

const AVISO = z.object({ tabla: z.string().min(1), op: z.string().optional() })

/**
 * La tabla del aviso, si le importa a esta pantalla. El payload viene de la red: se valida y lo que no
 * tiene forma de aviso se ignora sin romper.
 */
export function tablaQueImporta(payload: unknown, tablas: ReadonlySet<string>): string | null {
  const r = AVISO.safeParse(payload)
  if (!r.success) return null
  return tablas.has(r.data.tabla) ? r.data.tabla : null
}

/** Anota un aviso que importa. El desfase se fija con el PRIMER aviso de la ráfaga y no se vuelve a sortear. */
export function registrarAviso(e: EstadoDeRefresco, ahora: number, desfase: number): EstadoDeRefresco {
  if (e.primerAviso == null) return { ...e, primerAviso: ahora, ultimoAviso: ahora, desfase }
  return { ...e, ultimoAviso: ahora }
}

/** El instante en que corresponde refrescar lo pendiente, o `null` si no hay nada pendiente. */
export function momentoDeRefresco(e: EstadoDeRefresco, cfg: ConfigDeRefresco = CONFIG_DE_REFRESCO): number | null {
  if (e.primerAviso == null || e.ultimoAviso == null) return null
  let t = Math.min(e.ultimoAviso + cfg.silencioMs, e.primerAviso + cfg.esperaMaximaMs) + e.desfase
  if (e.ultimoRefresco != null) t = Math.max(t, e.ultimoRefresco + cfg.intervaloMinimoMs)
  return t
}

export function decidir(
  e: EstadoDeRefresco, ahora: number, entorno: Entorno, cfg: ConfigDeRefresco = CONFIG_DE_REFRESCO,
): Decision {
  const t = momentoDeRefresco(e, cfg)
  if (t == null) return { tipo: 'nada' }
  // PRIMERO LA REGLA DEL DUEÑO: aunque ya sea la hora, con alguien escribiendo no se mueve nada.
  if (entorno.editando || entorno.oculta) return { tipo: 'diferir' }
  if (ahora >= t) return { tipo: 'refrescar' }
  return { tipo: 'esperar', ms: t - ahora }
}

export function trasRefrescar(e: EstadoDeRefresco, ahora: number): EstadoDeRefresco {
  return { primerAviso: null, ultimoAviso: null, desfase: 0, ultimoRefresco: ahora }
}

/**
 * UN CAMPO CON FOCO QUE NADIE TOCA NO ES UNA EDICIÓN (16/09/2026). Medido en producción: la regla
 * «foco en un input = no refrescar» dejaba la pantalla congelada para siempre con el cursor olvidado en
 * un buscador, y el dueño marcaba en el celular sin verlo en la compu. Se protege a quien está
 * ESCRIBIENDO: pasados estos milisegundos desde la última tecla, el foco solo ya no frena.
 */
export const EDICION_INACTIVA_MS = 15_000

/** Hay edición en curso si alguna celda se declaró en edición, o si el foco está en un campo editable
 *  y la última tecla fue hace menos de `EDICION_INACTIVA_MS` (sin dato de tecla, cuenta el foco). */
export function hayEdicionEnCurso(p: {
  activo: { tagName?: string; isContentEditable?: boolean } | null | undefined
  celdaMarcada: boolean
  msDesdeUltimaTecla?: number
}): boolean {
  if (p.celdaMarcada) return true
  // EL MISMO CRITERIO QUE CMD/CTRL+Z: lo que el deshacer considera «el navegador está editando texto» es
  // exactamente lo que no se puede mover debajo del cursor.
  if (!destinoEditable(p.activo)) return false
  return p.msDesdeUltimaTecla == null || p.msDesdeUltimaTecla < EDICION_INACTIVA_MS
}

/** Selector de la marca opcional para celdas que editan sin tener el foco en un campo (un menú abierto). */
export const SELECTOR_EN_EDICION = '[data-en-edicion="1"]'

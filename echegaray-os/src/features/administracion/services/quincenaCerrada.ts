// ¿SE PUEDEN CAMBIAR LAS HORAS DE ESTOS DÍAS? — la quincena cerrada, una sola regla para todas las
// puertas que escriben `registros_hh`.
//
// ═══ POR QUÉ SALIÓ DE LIQUIDACIÓN ═══
//
// `quincenaCerrada` vivía duplicada y privada en `liquidacionDiaActions.ts` y en
// `horasDeLaCeldaActions.ts`, y las puertas de Personal → Horas —`guardarJornada`, `corregirJornada`,
// la jornada por defecto de la presencia— no la tenían. Desde que vaciar una celda borra la fila
// (15/09/2026), bastaba borrar el contenido de una celda para quitar horas de una quincena pagada.
// Una función privada de un archivo `'use server'` no se puede importar desde otra puerta ni probar
// sin Supabase: por eso la decisión vive acá, pura, y la lectura en `quincenaCerradaService.ts`.
//
// ═══ UN TRAMO PUEDE CRUZAR QUINCENAS ═══
//
// Una licencia del 10/08 al 03/09 toca tres quincenas. Mirar sólo la del primer día dejaría asentar
// días dentro de una quincena ya cerrada. Se miran todas y se nombra la primera cerrada.

import { correrQuincena, quincenaDe, type Quincena } from './quincena.ts'

export interface FilaDeCierre { desde: string; hasta: string; estado: string }

/** Un año de quincenas. Ningún tramo real llega; recorrer uno sin tope sería un bucle a pedido. */
export const TOPE_DE_QUINCENAS = 24

/**
 * Las quincenas que toca el rango, en orden. `null` si pasa el tope: quien llama falla cerrado.
 * El rango se ordena acá aunque la regla del tramo rechace uno invertido más adelante: la guarda no
 * puede depender de que otra validación corra después.
 */
export function quincenasDelTramo(desde: string, hasta: string = desde): Quincena[] | null {
  const [primero, ultimo] = desde <= hasta ? [desde, hasta] : [hasta, desde]
  const quincenas: Quincena[] = []
  for (let q = quincenaDe(primero); q.desde <= ultimo; q = correrQuincena(q, 1)) {
    if (quincenas.length === TOPE_DE_QUINCENAS) return null
    quincenas.push(q)
  }
  return quincenas
}

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Dice QUÉ quincena y QUÉ hacer: sin el camino, «está cerrada» sólo enseña a insistir. */
export const mensajeDeQuincenaCerrada = (q: Quincena): string =>
  `La quincena ${diaMes(q.desde)}–${diaMes(q.hasta)} está cerrada: para cambiar horas hay que reabrirla en Liquidación.`

export const MENSAJE_TRAMO_SIN_VERIFICAR =
  'Ese tramo abarca más de un año de quincenas: no puedo verificar si alguna está cerrada. No guardé nada.'

export const mensajeSinLectura = (detalle: string): string =>
  `No pude verificar si la quincena está cerrada: ${detalle}. No guardé nada.`

/**
 * El mensaje de la primera quincena cerrada del tramo, o `null` si todas están abiertas.
 *
 * DESDE Y HASTA, LOS DOS, Y BASTA UNA FILA CERRADA: es exactamente la lectura que ya hacía
 * Liquidación. `liquidacion_quincena` tiene una fila por grupo; si un grupo cerró, esas horas ya se
 * pagaron para alguien y la quincena no se reescribe por la puerta de otro grupo.
 */
export function veredictoDeCierre(
  quincenas: readonly Quincena[], filas: readonly FilaDeCierre[],
): string | null {
  const cerrada = quincenas.find((q) => filas.some(
    (f) => f.estado === 'cerrada' && f.desde === q.desde && f.hasta === q.hasta,
  ))
  return cerrada ? mensajeDeQuincenaCerrada(cerrada) : null
}

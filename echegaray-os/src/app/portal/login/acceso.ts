// LA LÓGICA DE LA PUERTA — pura, para poder probarla sin base ni navegador.
//
// Todo lo que decide si alguien entra vive acá: normalizar el mail, generar el código, guardarlo
// hasheado, y decir si el que llegó sirve. Nada de esto toca Next ni Postgres a propósito: la puerta
// es lo único del portal que un error convierte en un agujero, y un agujero se prueba, no se mira.

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/** Minutos que vive un código. Corto: es de un solo uso y se pide de nuevo en dos clics. */
export const VIDA_CODIGO_MIN = 15
/** Intentos por código antes de quemarlo. Seis dígitos se adivinan si nadie cuenta. */
export const INTENTOS_MAX = 5

/**
 * El mail, como se guarda y se compara.
 *
 * SIEMPRE en minúsculas y sin espacios. `Marta@X.com` y `marta@x.com` son la misma persona para
 * cualquier servidor de correo del mundo; si acá fueran dos, el administrador cargaría uno y el
 * cliente escribiría el otro, y el portal diría «no está habilitado» teniéndolo habilitado.
 */
export function normalizarMail(crudo: string): string {
  return crudo.trim().toLowerCase()
}

/** Forma mínima de un mail. No valida que exista — eso lo dice el código que llega o no llega. */
export function pareceMail(mail: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)
}

/** Seis dígitos, con `randomInt` (CSPRNG). `Math.random()` es predecible y acá eso es la puerta. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * El hash que se guarda. Nunca el código.
 *
 * Va salado con el mail: sin sal, dos personas con el mismo código tienen el mismo hash y una tabla
 * de un millón de entradas los revierte todos de una vez.
 */
export function hashearCodigo(mail: string, codigo: string): string {
  return createHash('sha256').update(`${normalizarMail(mail)}:${codigo}`).digest('hex')
}

/** Comparación en tiempo constante: comparar hashes con `===` filtra por dónde se cortó. */
export function codigoCoincide(mail: string, codigo: string, hash: string): boolean {
  const a = Buffer.from(hashearCodigo(mail, codigo))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type EstadoCodigo = { ok: true } | { ok: false; motivo: 'vencido' | 'usado' | 'quemado' | 'no_coincide' }

/** NÚCLEO PURO: ¿este código sirve? Recibe la fila tal como está guardada. */
export function evaluarCodigo(
  fila: { hash: string; vence_en: string | Date; usado_en: string | Date | null; intentos: number } | null,
  mail: string,
  codigo: string,
  ahora = new Date(),
): EstadoCodigo {
  if (!fila) return { ok: false, motivo: 'vencido' }
  if (fila.usado_en) return { ok: false, motivo: 'usado' }
  // El tope se mira ANTES de comparar: si no, cada intento fallido sigue dando una comparación gratis.
  if (fila.intentos >= INTENTOS_MAX) return { ok: false, motivo: 'quemado' }
  if (new Date(fila.vence_en).getTime() < ahora.getTime()) return { ok: false, motivo: 'vencido' }
  if (!codigoCoincide(mail, codigo, fila.hash)) return { ok: false, motivo: 'no_coincide' }
  return { ok: true }
}

export function venceEn(desde = new Date()): Date {
  return new Date(desde.getTime() + VIDA_CODIGO_MIN * 60_000)
}

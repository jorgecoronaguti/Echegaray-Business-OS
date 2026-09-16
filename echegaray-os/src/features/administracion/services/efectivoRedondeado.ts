// EL EFECTIVO REDONDEADO: VIENE SUGERIDO, EL DUEÑO LO SOBRESCRIBE, Y NO ENTRA EN NINGUNA CUENTA.
//
// Dueño, 14/09/2026: *«la columna de "efectivo redondeado" tiene q traer un valor de lo q corresponde
// en efectivo ya predeterminado con el redondeo en 0 y me tiene q permitir editar»*. Hasta hoy la
// celda arrancaba vacía cuando `liquidacion_linea.efectivo_redondeado` era null, y no había NINGUNA
// fila guardada: la columna estaba en blanco para todo el plantel.
//
// ═══ UN SUGERIDO NO ES UNA DECISIÓN ═══
//
// El sugerido se MUESTRA (en gris) y no se guarda. Sólo se escribe lo que alguien tecleó distinto: un
// sugerido guardado al perder el foco sería una cifra de billetes que nadie decidió, con la misma
// cara que la del dueño. Vaciar el campo borra lo guardado y vuelve el sugerido.
//
// Sigue sin participar de ninguna cuenta (R5): es la columna de los billetes, no parte de la cadena.

import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'

/**
 * EL CRITERIO, EN UNA LÍNEA. Al $1.000 más cercano. No hay datos guardados de los que inferirlo: lo
 * eligió el coordinador el 14/09/2026, y cambiarlo es cambiar esta constante.
 */
export const PASO_DEL_REDONDEO = 1000

/** El efectivo al $1.000 más cercano, sin centavos. `null` sin efectivo que pagar (null, 0 o negativo). */
export function efectivoSugerido(enEfectivo: number | null | undefined): number | null {
  if (enEfectivo == null || !Number.isFinite(enEfectivo) || enEfectivo <= 0) return null
  const redondeado = Math.round(enEfectivo / PASO_DEL_REDONDEO) * PASO_DEL_REDONDEO
  return redondeado > 0 ? redondeado : null
}

export interface EfectivoMostrado {
  /** Lo que la celda muestra: el guardado, o el sugerido si no hay guardado. */
  valor: number | null
  /** `true` = lo mostrado es el sugerido (gris), no una cifra guardada. */
  sugerido: boolean
  /** El sugerido del momento, para avisar en el `title` cuando difiere del guardado. */
  sugeridoAhora: number | null
}

export function efectivoMostrado(l: { efectivoRedondeado: number | null; enEfectivo: number | null }): EfectivoMostrado {
  const sugeridoAhora = efectivoSugerido(l.enEfectivo)
  if (l.efectivoRedondeado != null) return { valor: l.efectivoRedondeado, sugerido: false, sugeridoAhora }
  return { valor: sugeridoAhora, sugerido: sugeridoAhora != null, sugeridoAhora }
}

/** «$ 326.000» / «326000» / «326.000,50» → número. `null` si no es un importe. */
export function importeDelTexto(texto: string): number | null {
  // EL PARSER ÚNICO (`leerNumeroEsAR`): «266.000», «$ 266.000», «266.000,50». Vacío o inválido → null.
  const leido = leerNumeroEsAR(texto)
  return leido.ok ? leido.valor : null
}

export type AccionDelRedondeo = { accion: 'nada' } | { accion: 'guardar'; importe: number } | { accion: 'borrar' }

/**
 * QUÉ HACER AL SALIR DEL CAMPO.
 *
 *   vacío con guardado          → borrar (vuelve el sugerido)
 *   vacío sin guardado          → nada
 *   igual a lo que se mostraba  → nada (no se guarda un sugerido que nadie tocó)
 *   distinto                    → guardar
 */
export function accionDelRedondeo(e: { texto: string; guardado: number | null; sugerido: number | null }): AccionDelRedondeo {
  if (e.texto.trim() === '') return e.guardado != null ? { accion: 'borrar' } : { accion: 'nada' }
  const importe = importeDelTexto(e.texto)
  if (importe == null) return { accion: 'nada' }
  const mostrado = e.guardado ?? e.sugerido
  if (mostrado != null && importe === mostrado) return { accion: 'nada' }
  return { accion: 'guardar', importe }
}

// ═══ «DEJA COSAS PEGADAS» (QA, 15/09/2026) ═══
//
// La celda no tenía `onKeyDown`: Escape no cancelaba y el primer clic afuera guardaba lo tecleado. Y el guardado
// fallaba SIEMPRE sobre una línea no materializada, sin que se viera: el upsert con la sesión es un INSERT … ON
// CONFLICT DO UPDATE SET liquidacion_id, persona_id, efectivo_redondeado, y `authenticated` no tiene UPDATE sobre
// las dos llaves (42501). Lo que decide cada tecla y la relectura viven acá, puros, para poder probarlos.

export type TeclaDelRedondeo = 'guardar' | 'revertir' | 'guardar-y-pasar' | null

/** Enter guarda, Escape revierte sin guardar, Tab guarda y deja que el navegador pase al siguiente campo. */
export function teclaDelRedondeo(key: string): TeclaDelRedondeo {
  if (key === 'Enter') return 'guardar'
  if (key === 'Escape') return 'revertir'
  if (key === 'Tab') return 'guardar-y-pasar'
  return null
}

/**
 * ¿SALIR DEL CAMPO GUARDA? Sólo si se tecleó algo y no se canceló. `cancelado` llega por una ref: Escape saca el
 * foco en el mismo evento, y el `onBlur` todavía ve el estado de antes de revertir.
 */
export function debeGuardarAlSalir(e: { tocado: boolean; cancelado: boolean }): boolean {
  return e.tocado && !e.cancelado
}

export interface FilaDelRedondeo { liquidacion_id: string; persona_id: string; efectivo_redondeado: number | null }

/**
 * LA FILA QUE SE ESCRIBE. Sólo las dos llaves y el redondeo: si la línea no existe, `cobra`, `total`, `por_banco`
 * y los demás importes toman su default 0 (el CHECK `total = por_banco + en_efectivo` cierra con ceros) y el
 * cierre la reescribe entera con la foto; si existe, no se pisa ninguna otra columna.
 */
export function filaDelRedondeo(e: { liquidacionId: string; personaId: string; valor: number | null }): FilaDelRedondeo {
  return { liquidacion_id: e.liquidacionId, persona_id: e.personaId, efectivo_redondeado: e.valor }
}

/** LA RELECTURA MANDA. Cero filas devueltas es un rechazo en silencio; un valor distinto, un CHECK que corrigió. */
export function verificarGuardadoDelRedondeo(
  filas: readonly { efectivo_redondeado?: unknown }[], valor: number | null,
): { ok: true } | { ok: false; error: string } {
  const fila = filas[0]
  if (!fila) return { ok: false, error: 'La base no guardó la fila.' }
  const leido = fila.efectivo_redondeado == null ? null : Number(fila.efectivo_redondeado)
  if (leido !== valor) return { ok: false, error: `La base guardó ${leido ?? '—'} y yo mandé ${valor ?? '—'}.` }
  return { ok: true }
}

export type UpsertDelRedondeo = (fila: FilaDelRedondeo) => PromiseLike<{
  data: readonly { efectivo_redondeado?: unknown }[] | null; error: { message: string } | null
}>

/** Escribe y relee. El cliente llega inyectado: la acción pasa el de la clave de servicio, el test uno falso. */
export async function escribirRedondeo(
  upsert: UpsertDelRedondeo, e: { liquidacionId: string; personaId: string; valor: number | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await upsert(filaDelRedondeo(e))
  if (error) return { ok: false, error: `No se guardó: ${error.message}` }
  return verificarGuardadoDelRedondeo(data ?? [], e.valor)
}

/** El pie de la columna: la suma de lo que muestran las filas, guardado o sugerido. */
export function sumaDelRedondeo(filas: readonly { efectivoRedondeado: number | null; enEfectivo: number | null }[]): number {
  return filas.reduce((s, f) => s + (efectivoMostrado(f).valor ?? 0), 0)
}

// ═══ SALDO REDONDEADO — LO QUE RESTA PAGAR, SI SALIERA TODO EN BILLETES (dueño, 16/09/2026) ═══
//
// *«dame una columna más al lado de saldo en donde diga saldo redondeado como si lo que resta pagar se
// pagara en efectivo»*. No es la columna «Efect. red.»: aquélla redondea lo que corresponde por el lado
// negro y el dueño la edita; ésta es DERIVADA del saldo total —cuánto falta pagarle, sin importar por qué
// canal— llevado al mismo paso de $1.000 con que se cuentan los billetes.
//
// NO SE GUARDA Y NO ENTRA EN NINGUNA CUENTA: es lectura. El saldo real sigue siendo el de al lado, y la
// diferencia entre los dos se dice en el `title` para que nadie crea que el cuadro perdió o regaló plata.

export interface SaldoRedondeado {
  /** El saldo al $1.000 más cercano. `null` cuando no hay saldo que afirmar o no hay nada que entregar. */
  valor: number | null
  /** Redondeado − saldo: lo que se entrega de más (positivo) o de menos (negativo). 0 cuando cae justo. */
  diferencia: number
}

/**
 * El saldo llevado al paso del redondeo. Devuelve `null` con saldo nulo (sin negro no hay saldo que
 * afirmar), con saldo ≤ 0 (no hay nada que entregar: cero, o pagado de más, que es una devolución y no se
 * redondea) y cuando el redondeo da cero (un saldo de $400 no se entrega como $0: se entrega o no se entrega).
 */
export function saldoRedondeado(saldo: number | null | undefined): SaldoRedondeado {
  if (saldo == null || !Number.isFinite(saldo) || saldo <= 0) return { valor: null, diferencia: 0 }
  const valor = Math.round(saldo / PASO_DEL_REDONDEO) * PASO_DEL_REDONDEO
  if (valor <= 0) return { valor: null, diferencia: 0 }
  return { valor, diferencia: Math.round((valor - saldo) * 100) / 100 }
}

/** El pie de la columna: la suma de los saldos YA redondeados uno por uno, que es lo que sale en billetes. */
export function sumaDelSaldoRedondeado(saldos: readonly (number | null | undefined)[]): number {
  return saldos.reduce<number>((s, v) => s + (saldoRedondeado(v).valor ?? 0), 0)
}

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
  const limpio = texto.trim().replace(/[$\s.]/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
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

/** El pie de la columna: la suma de lo que muestran las filas, guardado o sugerido. */
export function sumaDelRedondeo(filas: readonly { efectivoRedondeado: number | null; enEfectivo: number | null }[]): number {
  return filas.reduce((s, f) => s + (efectivoMostrado(f).valor ?? 0), 0)
}

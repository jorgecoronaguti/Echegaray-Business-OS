// EL NÚMERO DE UN RECIBO, ESCRITO — una sola regla para todo lo que la app imprime o lista.
//
// Dueño, 02/10/2026: *«necesito q los recibos de pago tengan una numeracion q se vaya siguiendo, una
// codificacion, todos los recibos»*. El número lo DA la base (`recibo_serie` + `tomar_numero_de_recibo`,
// migración 20261002T1200), dentro de la transacción que guarda el recibo: la app nunca lo calcula ni lo
// prevé. Acá sólo se escribe y se lee, con la MISMA regla que `public.codigo_de_recibo`: si las dos se
// separan, un papel dice RP-000012 y el legajo otra cosa.
//
// Sin JSX, sin base, sin `'use client'`: lo usan el papel, el PDF, la ficha y el teléfono, y se prueba con
// `node --test`.

/** RP = recibos de pago (quincena y gasto manual de efectivo: un solo correlativo). RC = cobro a clientes. */
export type SerieDeRecibo = 'RP' | 'RC'

/** Seis dígitos son relleno, no tope: el 1.000.000 se escribe entero (la base hace lo mismo). */
const DIGITOS = 6

const esNumeroDeRecibo = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1

/** `RP-000123`. `null` si el número no es un entero positivo: un código inventado es peor que ninguno. */
export function codigoDeRecibo(serie: SerieDeRecibo, numero: unknown): string | null {
  if (!esNumeroDeRecibo(numero)) return null
  return `${serie}-${String(numero).padStart(DIGITOS, '0')}`
}

const CODIGO = /^(RP|RC)-(\d{6,})$/

/** Lee un código de vuelta. `null` si no es uno de esta numeración (p. ej. los «REC-2026-0003» anteriores). */
export function leerCodigoDeRecibo(texto: unknown): { serie: SerieDeRecibo; numero: number } | null {
  if (typeof texto !== 'string') return null
  const m = CODIGO.exec(texto.trim())
  if (!m) return null
  const numero = Number(m[2])
  return esNumeroDeRecibo(numero) ? { serie: m[1] as SerieDeRecibo, numero } : null
}

/**
 * Lo que dice el papel al lado del título. Sin código el recibo todavía no se guardó —la vista previa del lote,
 * el panel antes de «Guardar e imprimir»—: se dice que el número sale al guardar, nunca uno previsto, porque
 * otro recibo puede guardarse antes y el previsto sería mentira.
 */
export function rotuloDelNumero(codigo: string | null | undefined): string {
  const c = typeof codigo === 'string' ? codigo.trim() : ''
  return c ? `Recibo N° ${c}` : 'N° al guardar'
}


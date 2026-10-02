// EL RECIBO DE PAGO EN EFECTIVO A UN TERCERO — lo puro (dueño, 02/10/2026: «emitir un recibo para que me firmen»).
//
// Lo usan el panel (qué se valida antes de mandar y qué se precarga), la acción del servidor (la misma
// validación, porque el formulario no es de fiar) y el PDF (la frase). La frase vive una sola vez: lo que el
// panel promete y lo que sale impreso no pueden decir cosas distintas. Sin base, sin React, sin PDF.

import { importeEnLetras } from '../../administracion/services/importeEnLetras.ts'
import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'
import { RAZON_SOCIAL_RECIBO, montoComoSeImprime } from './recibo.ts'

/** Cuántos días para atrás se ofrecen filas de Compras pagadas en efectivo para precargar (pedido del dueño). */
export const DIAS_DE_COMPRAS = 15

/**
 * EL IMPORTE EN LETRAS COMO VA DENTRO DE LA FRASE: «la suma de pesos novecientos cincuenta mil». En minúscula
 * (es el medio de una oración, no el renglón «Son Pesos …» del recibo del estudio) y sin «con 00/100» cuando no
 * hay centavos: «novecientos cincuenta mil con 00/100» es ruido en un pago redondo. `null` si no es > 0.
 */
export function letrasDelImporte(importe: number): string | null {
  if (!Number.isFinite(importe) || importe <= 0) return null
  const t = importeEnLetras(importe)
  if (!t) return null
  const l = t.replace(/^Son Pesos /, '').toLowerCase()
  return l.replace(/ con 00\/100$/, '')
}

/** Lo que el panel tiene escrito. Todo texto, como llega del formulario. */
export interface BorradorReciboPago {
  aNombreDe: string
  documento: string
  importe: string
  fecha: string
  concepto: string
  obra: string
}

export interface ReciboPagoValido {
  aNombreDe: string
  /** Sólo dígitos; `null` = no se escribió (el papel deja el renglón para que lo complete quien firma). */
  documento: string | null
  importe: number
  fecha: string
  concepto: string
  obra: string | null
}

export type ValidacionRecibo = { ok: true; dato: ReciboPagoValido } | { ok: false; error: string }

const limpio = (t: string): string => t.replace(/\s+/g, ' ').trim()

/**
 * LA MISMA REGLA QUE `emitir_recibo_pago_efectivo`. La base la vuelve a hacer cumplir; esto evita tomar el viaje
 * con un formulario que se sabe que rebota. `hoy` es el día de San Juan (aaaa-mm-dd): no se emite a futuro.
 */
export function validarReciboPago(b: BorradorReciboPago, hoy: string): ValidacionRecibo {
  const aNombreDe = limpio(b.aNombreDe)
  if (aNombreDe.length < 3) return { ok: false, error: 'Escribí quién recibe la plata.' }
  const documento = b.documento.replace(/\D/g, '') || null
  if (documento && (documento.length < 7 || documento.length > 11)) {
    return { ok: false, error: 'El DNI o CUIT tiene que tener entre 7 y 11 dígitos (o dejalo vacío).' }
  }
  const l = leerNumeroEsAR(b.importe)
  if (!l.ok || l.valor == null || l.valor <= 0) return { ok: false, error: 'Escribí el importe, por ejemplo 950.000.' }
  const importe = Math.round(l.valor * 100) / 100
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.fecha) || Number.isNaN(Date.parse(`${b.fecha}T12:00:00Z`))) {
    return { ok: false, error: 'Elegí la fecha del pago.' }
  }
  if (b.fecha > hoy) return { ok: false, error: 'La fecha del recibo no puede ser futura.' }
  const concepto = limpio(b.concepto)
  if (concepto.length < 3) return { ok: false, error: 'Escribí en concepto de qué se paga.' }
  return { ok: true, dato: { aNombreDe, documento, importe, fecha: b.fecha, concepto, obra: limpio(b.obra) || null } }
}

/** aaaa-mm-dd → dd/mm/aaaa. Lo que no es una fecha vuelve tal cual. */
export function fechaImpresa(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** Lo que el papel dice. Es la foto guardada en `recibo_pago_efectivo`, no el formulario. */
export interface ReciboPagoImpreso {
  codigo: string
  fecha: string
  aNombreDe: string
  documento: string | null
  importe: number
  concepto: string
  obra: string | null
  anulado: boolean
}

/**
 * «Recibí de ECHEGARAY CONSTRUCCIONES S.A.S. la suma de pesos … ($ …) en concepto de ….» El signo y la cifra van
 * unidos por un espacio duro: el corte de renglón del PDF dejaba «($» al final de una línea y la cifra en la otra.
 */
export function fraseDelReciboPago(r: Pick<ReciboPagoImpreso, 'importe' | 'concepto'>): string {
  const letras = letrasDelImporte(r.importe) ?? ''
  const concepto = limpio(r.concepto).replace(/[.\s]+$/, '')
  return `Recibí de ${RAZON_SOCIAL_RECIBO} la suma de pesos ${letras} ($\u00a0${montoComoSeImprime(r.importe)}) en concepto de ${concepto}.`
}

/** Una fila de Compras pagada en efectivo, como se ofrece para precargar. */
export interface CompraParaRecibo {
  fila: number
  fecha: string | null
  proveedor: string | null
  concepto: string | null
  total: number | null
  obra: string | null
  /** La obra del catálogo que el espejo de Compras resolvió para la fila. Con ella el panel elige la obra, no el texto. */
  obraId?: string | null
  cuit: string | null
}

/**
 * TOMAR DE UNA COMPRA: lo que la fila sabe va al formulario. El concepto es el de la fila; si la fila no tiene,
 * queda vacío para escribirlo (no se inventa «pago»). El importe sale como se escribe acá (950.000 / 1.500,50).
 */
export function borradorDesdeCompra(c: CompraParaRecibo, hoy: string): BorradorReciboPago {
  const total = c.total != null && c.total > 0 ? c.total : null
  return {
    aNombreDe: limpio(c.proveedor ?? ''),
    documento: (c.cuit ?? '').replace(/\D/g, ''),
    importe: total == null ? '' : total.toLocaleString('es-AR', { maximumFractionDigits: 2 }),
    fecha: c.fecha && /^\d{4}-\d{2}-\d{2}/.test(c.fecha) && c.fecha.slice(0, 10) <= hoy ? c.fecha.slice(0, 10) : hoy,
    concepto: limpio(c.concepto ?? ''),
    obra: limpio(c.obra ?? ''),
  }
}

/** ¿La fila se pagó en efectivo? «Tipo pago» del Sheet llega con espacios y mayúsculas sueltas. */
export function pagadaEnEfectivo(tipoPago: string | null | undefined): boolean {
  return limpio(tipoPago ?? '').toLowerCase() === 'efectivo'
}

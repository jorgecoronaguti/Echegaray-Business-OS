// LO QUE LA PANTALLA MUESTRA DE LOS PAGOS DE UNA COMPRA — puro, sin red y sin React.
//
// Vive separado de `comprasPagoActions.ts` por dos motivos, y los dos importan: un archivo
// `'use server'` sólo puede exportar funciones asíncronas (una constante exportada ahí rompe el
// build, no el typecheck), y esto se prueba con `node --test`.
//
// La ARITMÉTICA no está acá: es la del Sheet y vive en `orquestador/lib/pagos-de-compra.mjs`. Acá
// sólo se decide QUÉ se dibuja y CON QUÉ palabras.

/**
 * Los medios que se pueden ELEGIR al registrar un pago en la app. «A rendir» NO está, a propósito
 * (auditoría 22/09/2026): ese medio dice «esta plata salió de una entrega de efectivo», y sólo lo puede
 * poner la rendición (canal de Rendiciones o la cola con origen `rendicion`), que además la vincula a la
 * entrega. Elegido a mano acá, el gasto quedaría en neto cero en el Cash Flow, fuera del cajón y sin
 * bajar el saldo de nadie: plata que sale sin rastro.
 */
export const MEDIOS_DE_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Tarjeta Crédito', 'Echeq', 'Cheque'] as const
/** Los siete que puede tener la columna (`carga-comprobantes.mjs · TIPOS_PAGO`): para LEER y filtrar. */
export const MEDIOS_DEL_LIBRO = [...MEDIOS_DE_PAGO, 'A rendir'] as const
export type MedioDePago = (typeof MEDIOS_DE_PAGO)[number]

/**
 * ¿Este cambio de la cola es la imputación de la fila a una entrega de efectivo (o su deshacer)? Lo escribe
 * la base en `valor_nuevo` (`imputar <ER-nnnn>` / `desimputar`, migración 20260924T2300). No se deshace
 * como un pago: se deshace desde la ficha de la entrega.
 */
export function esCambioDeImputacion(valorNuevo: string | null | undefined): boolean {
  return /^(imputar\b|desimputar$)/.test(String(valorNuevo ?? '').trim())
}

/** En qué punto del viaje está lo que se marcó en la app. */
export type EstadoEnSheet = 'sin_pedido' | 'pendiente' | 'procesando' | 'en_sheet' | 'rechazado'

export interface PagoDeFila {
  total: number | null
  monto_pagado: number | null
  monto_parcial_2: number | null
  pago_total_o_parcial: string | null
  tipo_pago: string | null
  estado: string | null
  fecha_prevista_2: string | null
  saldo_pendiente: number | null
  anulada?: boolean
}

/** Un peso de tolerancia: es la misma que usa la fórmula `Estado` de la planilla. */
export const TOL = 1

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Lo pagado: los DOS tramos. «Monto Parcial 1» es `=T-O` y sumarlo contaría el pago dos veces. */
export const pagadoDe = (f: PagoDeFila): number => num(f.monto_pagado) + num(f.monto_parcial_2)

/** El saldo por aritmética pura, `O − T − W`. No es el «Saldo pendiente (OS)», que además filtra. */
export const saldoDe = (f: PagoDeFila): number => Math.round((num(f.total) - pagadoDe(f)) * 100) / 100

/** ¿Se le puede registrar un pago desde la app? */
export function sePuedePagar(f: PagoDeFila): boolean {
  return !f.anulada && num(f.total) > 0 && saldoDe(f) > TOL
}

/** ¿Los dos tramos del Sheet ya están usados? Entonces el resto se completa allá, no acá. */
export const sinTramoLibre = (f: PagoDeFila): boolean =>
  num(f.monto_pagado) > TOL && num(f.monto_parcial_2) > TOL

export type Tono = 'ok' | 'falta' | 'apagado' | undefined

/**
 * EL ESTADO DEL PAGO EN UNA FRASE CORTA, con su tono.
 *
 * No es un párrafo explicativo: es el rótulo de una fila. Las tres frases son las tres situaciones
 * reales y ninguna afirma más de lo que se sabe — «Pagado» sólo cuando los tramos cubren el total,
 * no cuando la columna «Estado» lo dice, porque en 114 filas el texto tipeado contradice la cuenta.
 */
export function frasePago(f: PagoDeFila): { texto: string; tono: Tono } {
  if (f.anulada) return { texto: 'anulada', tono: 'apagado' }
  if (num(f.total) <= 0) return { texto: 'sin total', tono: 'apagado' }
  const saldo = saldoDe(f)
  if (saldo <= TOL) return { texto: 'Pagado', tono: 'ok' }
  if (pagadoDe(f) > TOL) return { texto: 'Parcial', tono: 'falta' }
  return { texto: 'Sin pagar', tono: 'falta' }
}

/**
 * LA LEYENDA DEL VIAJE AL SHEET. Es lo que impide que la pantalla afirme un efecto que no ocurrió.
 *
 * `null` cuando no hay nada que decir: una fila que nadie tocó desde la app no lleva ninguna marca.
 */
export function leyendaDeSheet(estado: EstadoEnSheet, motivo?: string | null): { texto: string; tono: Tono } | null {
  if (estado === 'sin_pedido') return null
  if (estado === 'pendiente') return { texto: 'pendiente de Sheet', tono: 'apagado' }
  if (estado === 'procesando') return { texto: 'escribiéndose en el Sheet', tono: 'apagado' }
  if (estado === 'en_sheet') return { texto: '✓ en Sheet', tono: 'ok' }
  return { texto: motivo?.trim() || 'el Sheet no aceptó el cambio', tono: 'falta' }
}

/** El estado de la cola, traducido. Lo que la base llama `aplicado` acá es `en_sheet`. */
export function estadoEnSheet(fila: { estado?: string | null } | null | undefined): EstadoEnSheet {
  const e = String(fila?.estado ?? '').trim()
  if (e === 'pendiente') return 'pendiente'
  if (e === 'procesando') return 'procesando'
  if (e === 'aplicado') return 'en_sheet'
  if (e === 'rechazado' || e === 'error') return 'rechazado'
  return 'sin_pedido'
}

// QUÉ RECIBOS DEL ESTUDIO CORRESPONDEN A UNA PERSONA EN LA QUINCENA QUE SE LIQUIDA. Una sola respuesta.
//
// Dueño, 02/10/2026: «hiciste mal lo de los mensualizados porque sólo me consideraste la 2da quincena, ellos tienen
// dos recibos pero se les paga por mes». El estudio emite DOS recibos por mes a todos (1ª y 2ª quincena), pero al
// mensualizado (jefes de obra, oficina) la empresa le paga UNA vez, por el mes entero: lo que se deposita es la suma
// de los dos netos. Hasta hoy cada punto del código elegía `nomina_recibo_neto` por el período de la quincena
// liquidada (`Q2-09/2026`) y el mensual quedaba con la mitad. Cuadro, saldos, recibo de pago, control contra el
// estudio y reimpresión piden acá los recibos: si cada uno eligiera por su cuenta, volverían a discrepar.
//
// NUNCA SE ASUME CERO. Si de los dos recibos del mes falta uno, `total` es `null` y `faltan` dice cuál: un banco
// armado con la mitad del mes es exactamente el error que esta función existe para impedir.

import { mismoCuil } from './cuil.ts'

export type ModalidadDeCobro = 'quincenal' | 'mensual'

export interface FilaDeRecibo { cuil: string | null; periodo: string; neto: number | string }

export interface ReciboDelEstudio { periodo: string; neto: number }

export interface RecibosDelEstudio {
  modalidad: ModalidadDeCobro
  /** Los períodos que corresponden (uno si es quincenal, los dos del mes si es mensual), en orden. */
  periodos: string[]
  /** Los que el estudio ya cargó, en el orden de `periodos`. */
  recibos: ReciboDelEstudio[]
  /** Los períodos que corresponden y el estudio todavía no cargó. */
  faltan: string[]
  /** Suma de los netos; `null` si falta alguno (no se asume cero). */
  total: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** `2026-09-16` → `Q2-09/2026`, la clave de período de `nomina_recibo_neto`. */
export const periodoDeLaQuincena = (desde: string): string =>
  `Q${Number(desde.slice(8, 10)) === 1 ? 1 : 2}-${desde.slice(5, 7)}/${desde.slice(0, 4)}`

/** Quincenal: la de esa quincena. Mensual: las dos del mes de esa quincena. */
export function periodosQueCorresponden(modalidad: ModalidadDeCobro, desde: string): string[] {
  if (modalidad === 'quincenal') return [periodoDeLaQuincena(desde)]
  const mes = `${desde.slice(5, 7)}/${desde.slice(0, 4)}`
  return [`Q1-${mes}`, `Q2-${mes}`]
}

export function recibosDelEstudio(d: {
  cuil: string | null; modalidad: ModalidadDeCobro; desde: string; filas: readonly FilaDeRecibo[]
}): RecibosDelEstudio {
  const periodos = periodosQueCorresponden(d.modalidad, d.desde)
  const recibos: ReciboDelEstudio[] = []
  const faltan: string[] = []
  for (const periodo of periodos) {
    // `find`: la primera carga, como siempre. Dos cargas del mismo período no se suman (serían el mismo recibo).
    const f = d.cuil ? d.filas.find((x) => x.periodo === periodo && mismoCuil(x.cuil, d.cuil)) : undefined
    const neto = f == null ? NaN : Number(f.neto)
    if (Number.isFinite(neto)) recibos.push({ periodo, neto }); else faltan.push(periodo)
  }
  const total = faltan.length === 0 ? r2(recibos.reduce((s, r) => s + r.neto, 0)) : null
  return { modalidad: d.modalidad, periodos, recibos, faltan, total }
}

/**
 * ¿Esta resta de `liquidacion_arrastre` es el neto de un recibo que el banco ya trae entero? Al mensual el recibo de la
 * 1ª quincena ya está sumado en su banco: sumarle además «Saldo 1ª quincena» lo contaría dos veces. Un origen mezclado
 * («Q1-09/2026, Q2-08/2026») no se descarta entero: trae plata de otro recibo que sí falta.
 */
export function arrastreYaIncluido(periodoOrigen: string, periodosDelBanco: readonly string[]): boolean {
  const origenes = periodoOrigen.split(',').map((p) => p.trim()).filter(Boolean)
  return origenes.length > 0 && origenes.every((o) => periodosDelBanco.includes(o))
}

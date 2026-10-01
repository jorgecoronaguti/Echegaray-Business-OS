// EL RECIBO PARA FIRMAR DE UN GASTO MANUAL — de la rendición y su entrega salen los campos; nada más.
//
// Caso real: se le pagó en efectivo a un proveedor de servicios sin factura (contenedor, máquina, flete,
// subcontratista) y hoy el recibo se escribe a mano en un talonario genérico. Esto lo arma completo.
// REGLA: lo que la rendición no sabe queda como renglón en blanco (`null`) para completar a mano. El OS no
// inventa un CUIT, un domicilio ni un número de recibo (la numeración correlativa está fuera de alcance).
// Puro: sin base, sin PDF — el PDF sólo dibuja lo que acá se arma.

import { importeEnLetras } from '../../administracion/services/importeEnLetras.ts'
import { diaAR } from './entregas.ts'

export const RAZON_SOCIAL_RECIBO = 'ECHEGARAY CONSTRUCCIONES S.A.S.'

export interface EntradaRecibo {
  rendicion: { monto: number; fecha?: string | null; imputada_en: string; concepto?: string | null; proveedor?: string | null }
  entrega: { codigo: string; obra: string | null; estructura: boolean }
  /** OB-0012; `null` si la obra no tiene código legible. */
  codigoObra: string | null
  /** Quien tenía la plata y pagó (nombre para mostrar). */
  pagador: string | null
}

export interface ReciboParaFirmar {
  /** dd/mm/aaaa; `null` si no hay fecha legible (se deja renglón). */
  fecha: string | null
  monto: number
  montoTexto: string
  /** «Ciento Setenta Mil Con 00/100»; sin «Son Pesos»: la frase ya dice «la suma de pesos». */
  montoEnLetras: string
  /** `null` = renglón en blanco. */
  concepto: string | null
  obra: string
  proveedor: string | null
  entrega: string
  pagador: string | null
}

const limpio = (t: string | null | undefined): string | null => {
  const s = (t ?? '').replace(/\s+/g, ' ').trim()
  return s || null
}

export const montoComoSeImprime = (n: number): string => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `null` si el monto no es un número positivo: un recibo por $0 o negativo no se arma. */
export function armarRecibo(i: EntradaRecibo): ReciboParaFirmar | null {
  const m = i.rendicion.monto
  if (!Number.isFinite(m) || m <= 0) return null
  const letras = importeEnLetras(m)
  if (!letras) return null
  const dia = diaAR(i.rendicion.fecha ?? i.rendicion.imputada_en)
  const obra = i.entrega.estructura
    ? 'Estructura'
    : [i.codigoObra, limpio(i.entrega.obra)].filter(Boolean).join(' · ') || 'sin obra'
  return {
    fecha: dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : null,
    monto: m,
    montoTexto: montoComoSeImprime(m),
    montoEnLetras: letras.replace(/^Son Pesos /, ''),
    concepto: limpio(i.rendicion.concepto),
    obra,
    proveedor: limpio(i.rendicion.proveedor),
    entrega: i.entrega.codigo,
    pagador: limpio(i.pagador),
  }
}

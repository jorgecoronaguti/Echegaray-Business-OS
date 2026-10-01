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
  /** La fila de Compras que rinde este gasto, si ya existe: de ahí sale a qué obra se imputó. */
  gasto?: ObraDelGasto | null
}

/** Lo que se lee de `compra_sheet` para saber a dónde se imputó el gasto. */
export interface ObraDelGasto { destino: string | null; obraCelda: string | null }

/**
 * A QUÉ SE IMPUTÓ EL GASTO, SEGÚN SU FILA DE COMPRAS (01/10/2026). La entrega dice a quién se le dio la plata y para
 * qué; el gasto se imputa después, y puede ir a otra obra: ER-0021 es una entrega de Estructura y su telgopor está
 * en Compras como OB-0011. El recibo que firma el proveedor dice lo del gasto. `null` = la fila no lo dice: manda la entrega.
 */
export function obraDelGasto(g: ObraDelGasto | null | undefined): string | null {
  if (!g) return null
  if ((g.destino ?? '').startsWith('estructura')) return 'Estructura'
  return g.destino === 'obra' ? limpio(g.obraCelda) : null
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
  const obra = obraDelGasto(i.gasto) ?? (i.entrega.estructura
    ? 'Estructura'
    : [i.codigoObra, limpio(i.entrega.obra)].filter(Boolean).join(' · ') || 'sin obra')
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

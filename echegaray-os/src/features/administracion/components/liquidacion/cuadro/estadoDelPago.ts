// ¿CÓMO SE PAGA LA FILA, Y CIERRA? — lo que deciden las columnas de banco y efectivo del cuadro.
//
// Puro para poder ejecutarlo en `node --test`: el rojo de banco/efectivo es un control, y un control que
// sólo se prueba leyendo JSX no puede demostrar que alguna vez da rojo. La cuenta la hace
// `cierreDeLaFila` (cobra − adelanto − ya transferido = banco + efectivo); esto sólo arma lo que se ve.

import { horas, pesos } from '../formato.ts'
import { cierreDeLaFila, type CadenaParaCerrar } from '../../../services/cuadroDeJornales.ts'
import type { ReferenciaDeJornales } from '../../../services/liquidacionOverrides.ts'

/**
 * LA MARCA DE JORNALES CUANDO LA PLANILLA NO DICE LO MISMO QUE EL CUADRO. `null` = no hay marca.
 *
 * Dueño, 14/09/2026: las horas y el cobra salen de las celdas del cuadro; la planilla queda como
 * referencia. Si coincide no se marca nada: una marca permanente deja de leerse.
 */
export function referenciaDeJornales(l: { referenciaJornales?: ReferenciaDeJornales | null }): {
  titulo: string; tituloEfectivo: string | null
} | null {
  const r = l.referenciaJornales
  if (!r || !r.difiere) return null
  const partes = [r.horas == null ? null : `${horas(r.horas)} h`, r.cobra == null ? null : pesos(r.cobra)]
  return {
    titulo: `JORNALES: ${partes.filter(Boolean).join(' · ')}`,
    tituloEfectivo: r.enEfectivo == null ? null : `JORNALES: efectivo ${pesos(r.enEfectivo)}`,
  }
}

/**
 * LO QUE DIJO LA PLANILLA, ENTERO: cobra, banco y efectivo. Va en el `title` del total con blanco + negro
 * (dueño, 14/09/2026): referencia, nunca manda. `null` sin espejo.
 */
export function tituloDeJornales(l: { referenciaJornales?: ReferenciaDeJornales | null }): string | null {
  const r = l.referenciaJornales
  if (!r) return null
  const partes = [
    r.horas == null ? null : `${horas(r.horas)} h`,
    r.cobra == null ? null : `cobra ${pesos(r.cobra)}`,
    r.porBanco == null ? null : `banco ${pesos(r.porBanco)}`,
    r.enEfectivo == null ? null : `efectivo ${pesos(r.enEfectivo)}`,
  ].filter(Boolean)
  return partes.length === 0 ? null : `JORNALES (referencia): ${partes.join(' · ')}`
}

/**
 * EL EFECTIVO QUEDA NEGATIVO: el adelanto y lo transferido superan lo que le corresponde en efectivo.
 * No se esconde ni se pone en cero (coordinador, 14/09/2026): se marca en ámbar y el pie lo suma igual.
 * `null` = no hay nada que marcar.
 */
export function efectivoSuperado(l: { enEfectivo: number | null }): string | null {
  return l.enEfectivo != null && l.enEfectivo < 0
    ? 'el adelanto y lo transferido superan lo que le corresponde en efectivo'
    : null
}

export interface EstadoDelPago {
  /** `true` sólo con una cuenta que se pudo hacer y no dio. Sin cobra no hay cierre que afirmar. */
  noCierra: boolean
  titulo: string
  /** La marca chica al lado del banco. `null` sin acuerdo 50/50 (Oficina, liquidaciones finales). */
  acuerdo: { texto: string; titulo: string } | null
}

export function estadoDelPago(l: CadenaParaCerrar & {
  reciboNeto: number | null; blancoAcuerdo: number | null; efectivoAcuerdo: number | null
}): EstadoDelPago {
  const cierre = cierreDeLaFila(l)
  const noCierra = cierre?.cierra === false
  const cadena = `cobra ${pesos(l.cobra)} − adelanto ${pesos(l.adelanto)} − ya transferido ${pesos(l.yaTransferido)}`
  const reparto = `banco ${pesos(l.porBanco)} + efectivo ${pesos(l.enEfectivo)}`
  // Hay acuerdo 50/50 pero el estudio todavía no liquidó: el banco no tiene cifra, no es «todo en efectivo».
  const sinRecibo = l.porBanco === 0 && l.reciboNeto == null
  return {
    noCierra,
    titulo: noCierra
      ? `no cierra: diferencia ${pesos(cierre?.diferencia ?? null)} · ${cadena} tiene que dar ${reparto}`
        + (l.negro != null ? ` y cobra = banco ${pesos(l.porBanco)} + negro ${pesos(l.negro)}` : '')
      : `${cadena.charAt(0).toUpperCase()}${cadena.slice(1)} = ${reparto}`,
    acuerdo: l.blancoAcuerdo == null ? null : {
      texto: `50/50${sinRecibo ? ' sin recibo' : ''}`,
      titulo: `Acuerdo 50/50: banco ${pesos(l.blancoAcuerdo)} · efectivo ${pesos(l.efectivoAcuerdo)}`
        + (sinRecibo ? '. Todavía no hay recibo del estudio: el banco figura en $0 hasta que llegue.' : ''),
    },
  }
}

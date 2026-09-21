// ¿CÓMO SE PAGA LA FILA, Y CIERRA? — lo que deciden las columnas de banco y efectivo del cuadro.
//
// Puro para poder ejecutarlo en `node --test`: el rojo de banco/efectivo es un control, y un control que
// sólo se prueba leyendo JSX no puede demostrar que alguna vez da rojo. La cuenta la hace
// `cierreDeLaFila` (cobra − adelanto − ya transferido = banco + efectivo); esto sólo arma lo que se ve.

import { horas, pesos } from '../formato.ts'
import { cierreDeLaFila, type CadenaParaCerrar } from '../../../services/cuadroDeJornales.ts'
import type { ReferenciaDeJornales } from '../../../services/liquidacionOverrides.ts'

/**
 * POR QUÉ NO HAY TOTAL QUE AFIRMAR, EN UNA SOLA DEFINICIÓN. La dice la columna «Total» (`CeldaTotal`): dos frases
 * distintas para el mismo hueco harían creer que son dos huecos. Hasta el 21/09/2026 la decía también el cobro
 * pegado al nombre, que el dueño mandó sacar.
 *
 * UN MENSUAL SIN IMPORTE NO ESTÁ «SIN TARIFA» (dueño, 15/09/2026: «los jefes cobran por mes, no preguntes más»).
 */
export const motivoSinCobra = (l: { modalidad?: string | null; sinNeto?: boolean; sello?: { conLinea: boolean } | null }): string =>
  sinSello(l) ?? (l.modalidad === 'mensual' ? 'importe no cargado' : l.sinNeto ? 'sin neto' : 'sin tarifa')

/**
 * QUÉ SE DICE EN UNA CELDA VACÍA DE LA QUINCENA CERRADA (18/09/2026). La cerrada muestra la foto de `liquidacion_linea`
 * y nada más: si la persona no tiene línea sellada, NADA de su fila es dato («sin línea sellada»); si la tiene y esta
 * columna vino vacía —quincena vieja—, «sin dato sellado». En los dos casos la celda NO se rellena con el cálculo de
 * hoy, que es exactamente lo que la pantalla hacía y el auditor reprodujo (Bazán a $4.000/h con $4.300 sellados).
 * `null` en la abierta: ahí cada celda dice lo suyo («sin tarifa», «—»).
 */
export const sinSello = (l: { sello?: { conLinea: boolean } | null }): string | null =>
  l.sello == null ? null : l.sello.conLinea ? 'sin dato sellado' : 'sin línea sellada'

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

// `efectivoSuperado` SE RETIRÓ EL 15/09/2026. Marcaba en ámbar un «Total efectivo» negativo —cobra − adelantos
// − banco—, y esa columna ya no existe: el dueño la rechazó con todas las letras (*«no considera adelantos en
// efectivo y resta del efectivo total; está pésimo»*). El aviso equivalente, y mejor, es `avisoDeExcedente` de
// `pagoDeLaQuincena.ts`: dice QUÉ PASA con esa plata —pasa al otro lado— en vez de sólo que dio negativo.

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

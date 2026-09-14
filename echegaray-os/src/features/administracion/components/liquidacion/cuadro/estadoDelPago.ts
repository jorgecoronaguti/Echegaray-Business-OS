// ¿CÓMO SE PAGA LA FILA, Y CIERRA? — lo que deciden las columnas de banco y efectivo del cuadro.
//
// Puro para poder ejecutarlo en `node --test`: el rojo de banco/efectivo es un control, y un control que
// sólo se prueba leyendo JSX no puede demostrar que alguna vez da rojo. La cuenta la hace
// `cierreDeLaFila` (cobra − adelanto − ya transferido = banco + efectivo); esto sólo arma lo que se ve.

import { pesos } from '../formato.ts'
import { cierreDeLaFila, type CadenaParaCerrar } from '../../../services/cuadroDeJornales.ts'

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
      ? `No cierra: ${cadena} tiene que dar ${reparto} (diferencia ${pesos(cierre?.diferencia ?? null)}).`
      : `${cadena.charAt(0).toUpperCase()}${cadena.slice(1)} = ${reparto}`,
    acuerdo: l.blancoAcuerdo == null ? null : {
      texto: `50/50${sinRecibo ? ' sin recibo' : ''}`,
      titulo: `Acuerdo 50/50: banco ${pesos(l.blancoAcuerdo)} · efectivo ${pesos(l.efectivoAcuerdo)}`
        + (sinRecibo ? '. Todavía no hay recibo del estudio: el banco figura en $0 hasta que llegue.' : ''),
    },
  }
}

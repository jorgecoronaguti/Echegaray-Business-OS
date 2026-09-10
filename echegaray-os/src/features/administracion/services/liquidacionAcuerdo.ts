// EL ACUERDO 50/50 CON EL PERSONAL — LA MITAD BLANCA Y LA MITAD EN EFECTIVO DE LO QUE COBRA.
//
// El dueño (10/09/2026): «el acuerdo con todos los empleados es 50% en blanco y 50% en efectivo, no
// me lo está mostrando actualmente».
//
// Vive en su propio archivo —y no dentro de `liquidacionQuincena.ts`— porque aquél llegó al límite
// de 500 líneas del repo y porque son dos preguntas distintas: allá se decide CUÁNTO cobra cada uno,
// acá CÓMO SE REPARTE ese número entre el recibo y los billetes.
//
// ═══ ES EL ACUERDO, NO EL REPARTO REAL DEL PAGO ═══
//
// `porBanco` y `enEfectivo` NO salen de acá y no se tocan: salen del recibo del estudio y del
// extracto (`nomina-banco-recibo.mjs`, orden del 31/08/2026 — «por banco va lo q dice recibo y en
// efectivo se completa todo hasta llegar al numero»). Calcular el banco como el 50 % es exactamente
// el defecto que ese archivo corrigió, con el recibo de Aguero como evidencia. Acá se publica lo
// ACORDADO para poder comparar: si el recibo dice otra cosa, la diferencia termina en efectivo y
// ahora se ve en vez de deducirse restando dos columnas a ojo.
//
// ═══ A QUIÉN SE LE APLICA, Y POR QUÉ ═══
//
//   hora (obreros)     50 % y 50 % de COBRA. Es el acuerdo textual del dueño.
//   ninguna (finales)  TAMBIÉN, y no podía ser de otro modo: COBRA de una liquidación final se
//                      calcula como `mitadBlanca × 2` (`cobraDe`), que ya asume el 50/50. Publicar
//                      `null` acá afirmaba lo contrario que el importe de al lado — la
//                      contradicción que levantó la auditoría del 10/09/2026. La mitad blanca es la
//                      del recibo REAL, no `cobra / 2`: es el número que liquidó el estudio.
//                      Sin recibo final —los subcontratistas de Gerson Castro, que están en el
//                      cuadro por otra vía— no hay mitad, y sin mitad no hay reparto: `null`.
//   mensual (Oficina)  NO. El recibo del 01/09 de Maldonado/Nievas fue $1.326.667,64 sobre
//                      $1.800.000, que no es la mitad. Si el acuerdo de Oficina es 50/50 o es otra
//                      cosa es una PREGUNTA ABIERTA al dueño: hasta que la conteste, `null` y «—»
//                      en pantalla. Escribir la mitad sería inventar un acuerdo que nadie confirmó.

import type { ModalidadDeLiquidacion } from './liquidacionQuincena.ts'

const redondear2 = (n: number): number => Math.round(n * 100) / 100

export interface RepartoDelAcuerdo {
  blanco: number | null
  efectivo: number | null
}

/**
 * LAS DOS MITADES DE LO QUE COBRA. `null` cuando esta línea no tiene acuerdo 50/50 que mostrar.
 *
 * `mitadBlanca` sólo la traen las liquidaciones finales: es lo que el estudio liquidó en blanco, y
 * el resto hasta COBRA sale en efectivo. Para el resto se parte al medio, y la segunda mitad se
 * calcula por RESTA para que las dos den exactamente COBRA: con un importe impar, dos divisiones
 * redondeadas por separado dejan un centavo colgando en la persona equivocada.
 */
export function repartoDelAcuerdo(
  cobra: number | null,
  modalidad: ModalidadDeLiquidacion,
  mitadBlanca: number | null = null,
): RepartoDelAcuerdo {
  if (cobra == null) return { blanco: null, efectivo: null }
  if (modalidad === 'ninguna') {
    if (mitadBlanca == null) return { blanco: null, efectivo: null }
    const blanco = redondear2(mitadBlanca)
    return { blanco, efectivo: redondear2(cobra - blanco) }
  }
  if (modalidad !== 'hora') return { blanco: null, efectivo: null }
  const blanco = redondear2(cobra / 2)
  return { blanco, efectivo: redondear2(cobra - blanco) }
}

/** Lo mínimo que hay que saber de una línea para compararla contra su acuerdo. */
export interface LineaComparable {
  porBanco: number
  blancoAcuerdo: number | null
  reciboSinGiro: boolean
}

/**
 * CUÁNTO SE APARTA EL GIRO REAL DE LA MITAD BLANCA ACORDADA. `null` = no hay nada que comparar.
 *
 * Es el número que el cuadro de Pagos pinta al lado de POR BANCO. No corrige nada —el recibo
 * manda—: lo hace visible. Un peso de tolerancia porque las mitades se redondean a centavos y un
 * desvío de centavos no es una diferencia, es aritmética.
 */
export function desvioDelAcuerdo(l: LineaComparable): number | null {
  if (l.blancoAcuerdo == null) return null
  if (l.porBanco <= 0 && !l.reciboSinGiro) return null
  const d = redondear2(l.porBanco - l.blancoAcuerdo)
  return Math.abs(d) > 1 ? d : null
}

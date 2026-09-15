// QUIÉN COBRA POR MES, Y QUÉ SE DICE CUANDO FALTA SU IMPORTE.
//
// Dueño, 15/09/2026: «los jefes de obra cobran por mes, no preguntes más». Hasta hoy la solapa Horas
// decidía la modalidad por la TARIFA (`neto_mensual` vigente) y la liquidación por el PUESTO: en agosto,
// sin neto cargado, el mismo jefe era «mensual» en un cuadro y «hora · sin tarifa» en el otro, con sus
// horas contadas como liquidables. Una sola regla, acá, para `armarCuadros` y la grilla de Horas.
//
// ═══ EL IMPORTE QUE FALTA ES UN DATO FALTANTE, NO UNA PREGUNTA ═══
//
// Sin neto mensual y sin importe de la planilla, COBRA sigue siendo `null` —nunca se inventa un
// sueldo— y la fila dice «mensual · importe no cargado». No es «sin tarifa»: eso abre un pendiente y
// le pregunta al dueño algo que ya contestó.

import { modalidadDe, type ModalidadDeLiquidacion } from './liquidacionQuincena.ts'

/** Jefe de obra, o neto mensual vigente. Es el criterio de Oficina en `armarCuadros`. */
export const cobraPorMes = (p: { esJefe?: boolean; netoMensual?: number | null }): boolean =>
  p.esJefe === true || p.netoMensual != null

export const modalidadDeLaPersona = (
  p: { esJefe?: boolean; netoMensual?: number | null },
): ModalidadDeLiquidacion => modalidadDe(cobraPorMes(p) ? 'oficina' : 'obreros')

export const ROTULO_IMPORTE_NO_CARGADO = 'mensual · importe no cargado'

/**
 * El rótulo de un jefe mensual SIN neto vigente; `null` para todo lo demás (quien tiene neto se
 * dibuja como siempre, y quien no es jefe sigue exigiendo su tarifa).
 */
export function rotuloDelMensual(l: {
  modalidad: ModalidadDeLiquidacion; esJefe: boolean; netoMensual: number | null
  cobra: number | null; origenTarifa: string | null
}): string | null {
  if (l.modalidad !== 'mensual' || !l.esJefe || l.netoMensual != null) return null
  if (l.cobra == null) return ROTULO_IMPORTE_NO_CARGADO
  return l.origenTarifa ? `mensual · ${l.origenTarifa}` : 'mensual'
}

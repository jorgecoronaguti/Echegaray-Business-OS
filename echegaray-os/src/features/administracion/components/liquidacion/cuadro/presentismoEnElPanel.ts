// EL PRESENTISMO COMO UN CONCEPTO MÁS DEL BLANCO (dueño, 28/09/2026).
//
// *«no quiero que se discrimine tanto el presentismo de todos los demás conceptos en el desplegable de la
// derecha donde salen los descuentos»*. Hasta hoy el panel le daba una sección propia —título, cuatro
// renglones, estado en negrita y ámbar—; ahora es un concepto más del BLANCO (el dueño eligió ese lugar el
// 28/09): lo dibuja `ReciboPorConceptos` junto al 0401/0425. El mensual sigue en «Efectivo · fuera del recibo».
//
// SIN «INCLUIDO EN EL IMPORTE» NI «DESCONTADO DEL IMPORTE» (auditor, 28/09): el importe del negro es
// horas × $/h negro; en jornada completa el presentismo se paga en el recibo (0425), y con el negro
// escrito a mano no se descuenta nada. El renglón dice el estado y la base, no dónde entra la plata.
//
// ═══ LO QUE NO SE PERDIÓ AL ACHICARLO ═══
//
// La base, el %, el estado y las fechas a revisar siguen EN LA PANTALLA, en la nota del renglón: el dueño
// preguntó dos veces sobre qué corre el 20 %, y un `title` no se ve en el teléfono. El intento anterior
// (31312cd0) los mandó a un tooltip y borró las fechas a revisar; el auditor lo rechazó por eso.
//
// Acá no se calcula nada: los números son los de `presentismo.ts`. Este módulo sólo arma el texto, y es
// `.ts` para poder probarlo sin montar el componente.

import { fechasCortas, PRESENTISMO_PCT, type PresentismoDeLinea } from '../../../services/presentismo.ts'
import { pesos } from '../formato.ts'

/** «18/09 Faltó sin avisar · 22/09 Llegó tarde». La foto vieja no guardó causas: quedan las fechas. Lo usan la celda del cuadro y el panel. */
export function motivosDePerdida(p: PresentismoDeLinea): string {
  if (p.causas.length === 0) return fechasCortas(p.perdido)
  return p.causas.map((c) => `${c.fecha.slice(8, 10)}/${c.fecha.slice(5, 7)} ${c.etiqueta}`).join(' · ')
}

export interface RenglonDePresentismo {
  /** «Presentismo» o, perdido, «− Presentismo»: el mismo signo en el rótulo que «− Adelanto». */
  rotulo: string
  /** El importe de `presentismo.ts`. `null` se dibuja «—» (sin horas, sin categoría, no rige). */
  valor: number | null
  /** Estado primero, después base y %, y lo que hay que hacer. */
  nota: string
  estado: PresentismoDeLinea['estado']
}

const PCT = `${Math.round(PRESENTISMO_PCT * 100)} %`

/** «20 % de $317.400 (50 % en blanco)»: la base a la vista, que el 50 % en efectivo no entra. */
function baseYPorcentaje(p: PresentismoDeLinea): string {
  return p.base == null ? `${PCT} de la base en blanco` : `${PCT} de ${pesos(p.base)} (50 % en blanco)`
}

/** «cargá el motivo de 18/09: si lo justifica, lo recupera». Vacío si no hay días sin clasificar. */
function aRevisar(p: PresentismoDeLinea): string[] {
  return p.aRevisar.length > 0 ? [`cargá el motivo de ${fechasCortas(p.aRevisar)}: si lo justifica, lo recupera`] : []
}

/**
 * El renglón del presentismo en el bloque Negro. `null` sólo cuando la línea no lo evalúa (llamador viejo).
 *
 * «SIN HORAS» VA ANTES QUE «CUMPLE» (QA, 16/09/2026): sin ninguna jornada cargada no hay cumplimiento que
 * afirmar, y un jefe de obra lee «Cumple» como un visto bueno.
 */
export function renglonDePresentismo(p: PresentismoDeLinea | null): RenglonDePresentismo | null {
  if (p == null) return null
  const r = (rotulo: string, valor: number | null, partes: string[]): RenglonDePresentismo =>
    ({ rotulo, valor, nota: partes.join(' · '), estado: p.estado })
  if (p.estado === 'no_aplica') return r('Presentismo', null, ['No aplica · mensual', 'el presentismo es del convenio de obreros'])
  if (p.estado === 'no_rige') return r('Presentismo', null, ['No rige en esta quincena'])
  if (p.estado === 'sin_categoria') return r('Presentismo', null, ['Sin categoría', 'no hay básico en el legajo con qué calcularlo'])
  if (p.estado === 'sin_horas') {
    const causas = p.perdido.length > 0 ? [`ya marcado: ${motivosDePerdida(p)}`] : []
    return r('Presentismo', null, ['Sin horas', 'sin horas cargadas en la quincena: todavía no hay presentismo que calcular', ...causas, ...aRevisar(p)])
  }
  if (p.estado === 'perdido') {
    return r('− Presentismo', p.importe, ['Perdido', baseYPorcentaje(p), motivosDePerdida(p), ...aRevisar(p)])
  }
  return r('Presentismo', p.importe, ['Cumple', baseYPorcentaje(p), 'sin faltas injustificadas, tardanzas ni retiros'])
}

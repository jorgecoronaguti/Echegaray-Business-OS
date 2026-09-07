// POR QUÉ NO VINO — y si eso es una AUSENCIA o una LICENCIA.
//
// El dueño: *«tenés que permitirme marcar ausencias, parte médico, etc»*. Un día que no se trabajó
// no es un solo hecho: el que faltó sin avisar, el que está de vacaciones, el suspendido y el que
// se accidentó en obra tienen consecuencias distintas —económica, laboral, de ART y de
// planificación— y hasta hoy esta pantalla los guardaba a todos como el mismo cero.
//
// ═══ EL CATÁLOGO NO SE INVENTA ACÁ: YA EXISTE ═══
//
// `orquestador/lib/asistencia-motivos.mjs` define los 16 motivos con sus claves estables, sus
// ámbitos y sus reglas, y es lo que usa el bot de Mattermost desde julio. Escribir una segunda
// lista en TypeScript sería exactamente lo que el OS prohíbe: dos definiciones del mismo concepto,
// que discrepan el día que alguien agrega un motivo en una sola.
//
// Lo único que se agrega acá es el puente que faltaba: qué `tipo_hora` de `registros_hh` le
// corresponde a cada motivo.
//
// ═══ AUSENCIA vs LICENCIA: LA DIFERENCIA ES SI SE PAGA ═══
//
// No es una etiqueta más linda. Una LICENCIA es tiempo no trabajado que la empresa reconoce
// —enfermedad con parte médico, vacaciones, accidente de trabajo, licencia especial, suspensión—:
// tiene respaldo documental y alguien la autorizó. Una AUSENCIA es la falta lisa, y la obra parada
// por lluvia o sin frente, que no dependen del trabajador pero tampoco son un derecho suyo.
//
// La distinción la decide quien liquida, no esta pantalla; lo que esta pantalla no puede hacer es
// borrarla guardando las dos como lo mismo. Ninguna de las dos suma horas trabajadas.

import { CATALOGO, MOTIVO, motivoDe } from '../../../../orquestador/lib/asistencia-motivos.mjs'

export type TipoNoTrabajado = 'ausencia' | 'licencia'

export interface MotivoElegible {
  clave: string
  etiqueta: string
  tipo: TipoNoTrabajado
}

/**
 * Los motivos que la empresa RECONOCE como licencia.
 *
 * Sale de la naturaleza del hecho, no de una preferencia: los cinco tienen respaldo documental
 * —parte médico, denuncia de ART, recibo de vacaciones, acta de suspensión, certificado— y por eso
 * se pueden auditar. Lo que no está en esta lista es ausencia, y el default es el más conservador:
 * un motivo nuevo en el catálogo entra como ausencia hasta que alguien decida lo contrario.
 */
const LICENCIAS: readonly string[] = [
  MOTIVO.ENFERMEDAD,
  MOTIVO.ACCIDENTE,
  MOTIVO.ACCIDENTE_IN_ITINERE,
  MOTIVO.VACACIONES,
  MOTIVO.LICENCIA_ESPECIAL,
  MOTIVO.SUSPENSION,
]

/** `enfermedad` → `licencia`; `falta` → `ausencia`. Un motivo desconocido es ausencia: es lo que
 *  menos afirma sobre un derecho que nadie probó. */
export function tipoDeMotivo(clave: string | null | undefined): TipoNoTrabajado {
  return clave && LICENCIAS.includes(clave) ? 'licencia' : 'ausencia'
}

/** Los motivos que se ofrecen para un día NO trabajado, con el tipo que le va a tocar a cada uno. */
export function motivosDeDiaNoTrabajado(): MotivoElegible[] {
  return (CATALOGO as { clave: string; etiqueta: string; ambitos?: string[] }[])
    // Los de ámbito `parcial` —llegó tarde, se retiró antes— describen un día que SÍ se trabajó, con
    // menos horas. Ese caso se declara escribiendo el número, no marcando que no vino.
    .filter((m) => (m.ambitos ?? []).includes('ausencia'))
    .map((m) => ({ clave: m.clave, etiqueta: m.etiqueta, tipo: tipoDeMotivo(m.clave) }))
}

/** La etiqueta del motivo, para mostrarla en el historial. `null` si la clave no existe: nunca se
 *  elige un motivo «parecido» ni se muestra la clave cruda. */
export function etiquetaDeMotivo(clave: string | null | undefined): string | null {
  if (!clave) return null
  const m = motivoDe(clave) as { etiqueta: string } | null
  return m?.etiqueta ?? null
}

/** ¿Es una clave del catálogo? Lo que no está no entra: `notas` es texto libre y sin esto cualquier
 *  cosa se guardaría como si fuera un motivo, y después nadie puede agrupar por causa. */
export const esMotivo = (clave: unknown): clave is string =>
  typeof clave === 'string' && motivoDe(clave) !== null

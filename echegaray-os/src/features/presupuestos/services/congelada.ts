// SOBRE UNA VERSIÓN CONGELADA SE PREGUNTA; LO QUE SE CORTA ES LA MUTACIÓN.
//
// ═══ EL DEFECTO QUE ESTE MÓDULO ARREGLA ═══
//
// La pantalla prometía «las preguntas siguen funcionando: explicar no modifica» y el servidor
// rechazaba TODO texto en cuanto `congelada_en` no era nulo. Las dos cosas escritas en el mismo
// producto, una en la conversación y otra tres archivos más allá. La promesa era la correcta —un
// congelado se consulta todo el tiempo: «¿de dónde salen los 47,2 m³?», «¿qué está haciendo caro
// esto?»— y el corte estaba en el lugar equivocado: en la puerta, no en la escritura.
//
// ═══ QUÉ CUENTA COMO MUTACIÓN NO SE DECIDE ACÁ ═══
//
// Lo dice el contrato: `ACCION[x].muta`. Escribir a mano la lista de las diez acciones mutantes
// habría creado una segunda definición que se desincroniza la primera vez que alguien agregue una
// acción al motor — y el síntoma sería que esa acción nueva SÍ escribe sobre un congelado, que es
// exactamente lo que no puede pasar.
//
// ═══ Y SE FALLA CERRADO ═══
//
// Una acción que el contrato no conoce se trata como mutante. No debería existir —`intencion()`
// rechaza cualquier acción fuera de la lista cerrada— pero si existiera, la dirección segura sobre
// una versión inmutable es negarse.

import { ACCION } from '../../../../orquestador/lib/cotizador/contrato.mjs'

const ACCIONES = ACCION as unknown as Record<string, { muta?: boolean } | undefined>

/** ¿Esta acción escribe? Lo dice el contrato. Desconocida = sí, por las dudas. */
export function esMutante(accion: string | null | undefined): boolean {
  if (!accion) return false
  const a = ACCIONES[accion]
  if (a === undefined) return true
  return a.muta === true
}

export type DecisionCongelada = 'pasa' | 'ofrecer-revision'

/**
 * QUÉ HACER CON UN TURNO SOBRE UNA VERSIÓN CONGELADA. PURA.
 *
 * `hayPlan` es el cinturón además de los tirantes: si el motor llegó a armar un plan de escritura,
 * se corta aunque la intención dijera que no muta. Un plan sobre un congelado no se aplica nunca.
 */
export function decisionSobreCongelada({ congelada, accion, hayPlan = false }: {
  congelada: boolean
  accion: string | null | undefined
  hayPlan?: boolean
}): DecisionCongelada {
  if (!congelada) return 'pasa'
  if (hayPlan) return 'ofrecer-revision'
  return esMutante(accion) ? 'ofrecer-revision' : 'pasa'
}

// MARCAR PASOS: DE LO QUE SE TOCÓ EN LA PANTALLA A LO QUE SE ESCRIBE. PURO.
//
// ═══ QUÉ SE ROMPIÓ (25/08/2026, auditoría móvil con datos, hallazgo 1) ═══
//
// `guardarPasos` marcaba el paso y DESPUÉS insertaba la fila de firma en `obra_ejecucion` con
// `{obra, actividad, fecha, metodo, paso_id, comentario, fuente}` — sin `cantidad` ni `avance_pct`.
// La base la rechaza (`obra_ejecucion_dice_algo`: una de las dos tiene que estar). Como no hay
// transacción, el paso quedaba marcado —o sea, el avance de la actividad ya se había movido— y la
// firma de quién y cuándo no existía. Medido en la base: `…000021 Armadura hecho_en=12:06:12Z` sin
// una sola fila en `obra_ejecucion`. La pantalla mostraba el error crudo de Postgres y el 33,3 % al
// mismo tiempo.
//
// ═══ CUÁNTO AVANZA UN PASO: LA MISMA REGLA, NO UNA SEGUNDA ═══
//
// El aporte de un paso es su peso sobre el peso total, y sale de `avancePorPasos` con ese paso como
// único hecho: es literalmente la función que ya usan la vista `actividad_avance`, el formulario del
// jefe y el masivo. Escribir acá `peso / total * 100` a mano sería la cuarta implementación de la
// misma cuenta, y la cuarta es la que se olvida de redondear igual.
//
// LA FIRMA NO ES LA FUENTE DEL PORCENTAJE. Para `metodo_avance = 'pasos'` el avance canónico lo
// calcula la vista desde `obra_actividad_paso.hecho_en`, NO sumando `obra_ejecucion.avance_pct`
// (ver `20260824T1400_avance_manual_es_suma_de_incrementos.sql`). Por eso tres pasos de peso igual
// firman 33,3 + 33,3 + 33,3 = 99,9 y la actividad igual queda en 100: la fila de ejecución dice
// «este paso aportaba esto y lo firmé yo», y el número lo sigue produciendo el tildado.
//
// ═══ SIN PESO NO HAY APORTE, Y ENTONCES NO SE ESCRIBE NADA ═══
//
// Con peso total 0 la vista publica `null` —no 0— y no hay número honesto que firmar. Poner 0
// diría «este paso no aporta nada», que es una afirmación distinta de «nadie declaró cuánto pesa».
// El plan sale en error ANTES de tocar la base: se prefiere no poder marcar a marcar sin firma.

import { avancePorPasos } from '../../obras/services/avance.ts'

/** Un paso tal como lo devuelve `obra_actividad_paso`. `peso` es RELATIVO: los pesos no suman 100. */
export interface PasoDeLaTarea {
  id: string
  nombre: string
  peso: number
  hecho_en: string | null
}

/** Una fila de `obra_ejecucion` por paso marcado: el rastro de quién lo firmó y cuánto aportaba. */
export interface FirmaDePaso {
  paso_id: string
  avance_pct: number
}

export type PlanDePasos =
  | { ok: false; error: string }
  | { ok: true; firmas: FirmaDePaso[]; marcar: string[]; desmarcar: string[]; mensaje: string }

/** Lo que aporta UN paso al avance de su actividad, en puntos de porcentaje. `null` cuando el paso
 *  no está en la lista o cuando los pesos no permiten medir. */
export function aporteDelPaso(pasos: readonly PasoDeLaTarea[], id: string): number | null {
  if (!pasos.some((p) => p.id === id)) return null
  return avancePorPasos(pasos.map((p) => ({ peso: p.peso, hecho: p.id === id })))
}

/**
 * QUÉ HAY QUE ESCRIBIR PARA DEJAR LOS PASOS COMO QUEDARON EN LA PANTALLA.
 *
 * `marcados` es el estado COMPLETO de las casillas, no un delta: de ahí salen los que hay que
 * marcar y los que hay que desmarcar. Un plan `ok` siempre trae una firma por cada paso a marcar —
 * ninguna escritura mueve el avance sin dejar su fila.
 */
export function planDePasos(
  pasos: readonly PasoDeLaTarea[], marcados: ReadonlySet<string>,
): PlanDePasos {
  if (pasos.length === 0) {
    return { ok: false, error: 'Esta tarea se mide por pasos y todavía no tiene pasos cargados.' }
  }
  const nuevos = pasos.filter((p) => marcados.has(p.id) && !p.hecho_en)
  const desmarcar = pasos.filter((p) => !marcados.has(p.id) && p.hecho_en).map((p) => p.id)
  if (nuevos.length === 0 && desmarcar.length === 0) {
    return { ok: false, error: 'No cambiaste ningún paso.' }
  }

  const firmas: FirmaDePaso[] = []
  for (const p of nuevos) {
    const aporte = aporteDelPaso(pasos, p.id)
    if (aporte == null) {
      return {
        ok: false,
        error: `«${p.nombre}» no puede firmarse: los pasos de esta tarea no declaran cuánto pesa cada uno. `
          + 'Cargá los pesos en la planificación y volvé a marcarlo.',
      }
    }
    firmas.push({ paso_id: p.id, avance_pct: aporte })
  }

  return {
    ok: true,
    firmas,
    marcar: nuevos.map((p) => p.id),
    desmarcar,
    mensaje: `${nuevos.length} pasos marcados, ${desmarcar.length} desmarcados`,
  }
}

/** Las tres escrituras del plan, cada una con su error de la base tal cual vuelve. */
export interface EscrituraDePasos {
  firmar(firmas: readonly FirmaDePaso[]): Promise<{ error: string | null }>
  marcar(ids: readonly string[], cuando: string): Promise<{ error: string | null }>
  desmarcar(ids: readonly string[]): Promise<{ error: string | null }>
}

/**
 * EL ORDEN NO ES UN DETALLE: PRIMERO LA FIRMA, DESPUÉS EL AVANCE.
 *
 * No hay transacción desde PostgREST, así que alguna de las dos escrituras puede quedar sola. La
 * pregunta es cuál de las dos mitades duele menos, y la respuesta la da qué produce el número:
 *
 *   · firma sin paso marcado → el avance NO se movió (la vista lo calcula desde `hecho_en`) y queda
 *     una fila de ejecución que nadie sumó. Se ve raro en el historial y no miente el porcentaje.
 *   · paso marcado sin firma → el avance ya se movió y no existe el registro de quién lo movió.
 *     Es el estado que la auditoría encontró en la base y el que hay que volver imposible.
 *
 * La transacción de verdad está escrita en `20260825T1100_registrar_pasos_en_una_transaccion.sql`.
 * Mientras esa migración no esté APLICADA, este orden es lo que hace que el peor caso sea el
 * inofensivo. El desmarcado va último por lo mismo: es el único que baja el avance.
 */
export async function aplicarPlan(
  plan: Extract<PlanDePasos, { ok: true }>, escritura: EscrituraDePasos, ahora: string,
): Promise<{ ok: true; mensaje: string } | { ok: false; error: string }> {
  if (plan.firmas.length > 0) {
    const { error } = await escritura.firmar(plan.firmas)
    if (error) return { ok: false, error }
  }
  if (plan.marcar.length > 0) {
    const { error } = await escritura.marcar(plan.marcar, ahora)
    if (error) return { ok: false, error }
  }
  if (plan.desmarcar.length > 0) {
    const { error } = await escritura.desmarcar(plan.desmarcar)
    if (error) return { ok: false, error }
  }
  return { ok: true, mensaje: plan.mensaje }
}

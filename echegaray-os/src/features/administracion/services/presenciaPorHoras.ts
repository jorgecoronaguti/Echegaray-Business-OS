// CARGAR HORAS ES DECLARAR QUE LA PERSONA ESTUVO — y qué declara exactamente cada escritura.
//
// El dueño, 08/09/2026 18:15, con la pantalla de Plantel abierta: *«no hay forma de cargar que la
// persona está presente desde ninguna pantalla, incluso si le cargo las hs de ese día de manera
// manual en planilla Asistencia»*. Nievas, Ochoa y Pastrán tenían 9 hs cargadas a mano y la
// columna HOY decía «sin marcar», porque `asistencia_dia` sólo la escribía la pantalla móvil.
//
// ═══ ESTO NO DEROGA «LA PRESENCIA NUNCA SE DEDUCE DE LAS HORAS» ═══
//
// La regla del 08/09 (E) prohíbe MIRAR `registros_hh` para responder si alguien estuvo: un día sin
// horas cargadas no puede afirmar que no vino, y de ahí sale la tabla `asistencia_dia`. Lo que se
// agrega acá es lo contrario y no se contradice: cuando UNA PERSONA carga horas desde la app, esa
// persona está AFIRMANDO que el otro estuvo. La declaración la hace el que escribe, no el sistema
// leyendo un número. Por eso lo importado de JORNALES (`fuente_legacy='sheet:jornales'`) no declara
// nada: ahí nadie afirmó nada, se copió una planilla.
//
// ═══ QUÉ ES `origen` Y POR QUÉ HAY DOS ═══
//
//   'declarada' → ALGUIEN ELIGIÓ EL ESTADO: la pantalla móvil de presencia, el select «Qué pasó
//                 ese día» del panel, la «A» de la grilla. Es un acto, con su firma.
//   'horas'     → LA PRESENCIA SALIÓ DE ESCRIBIR UN NÚMERO: la celda de la grilla y el formulario
//                 de horas del celular. Nadie tocó un estado; se dedujo del gesto.
//
// La asimetría es la regla: una `'horas'` NUNCA pisa una `'declarada'` —el jefe que dijo «no vino»
// le gana a la carga de horas que vino después—, y sólo una `'horas'` se retira cuando se borran
// las horas que la produjeron. Una declaración explícita sobrevive al borrado: sacar las horas de
// un día no es decir que la persona no estuvo.
//
// PRECISIÓN SOBRE LA CONSIGNA: la «A» de la grilla y el «No vino» del panel entran por las puertas
// de horas, pero son un ESTADO ELEGIDO A MANO, así que se guardan como `'declarada'`. Marcarlas
// `'horas'` habría hecho que una ausencia declarada por el jefe la pisara la carga de horas
// siguiente —exactamente lo que la regla existe para impedir—, y que el panel de Administración no
// pudiera corregir una presencia. El origen sigue al ACTO, no a la puerta.

import { tipoDeMotivo } from './motivoDeAusencia.ts'
import type { EstadoPresencia } from './presenciaDelDia.ts'

export type OrigenPresencia = 'declarada' | 'horas'

/** Una fila de `asistencia_dia` tal como se va a escribir. `fecha` viaja adentro porque el tramo
 *  de licencia escribe varios días de una sola vez. */
export interface DeclaracionPedida {
  persona_id: string
  fecha: string
  obra_canonica_id: string | null
  estado: EstadoPresencia
  motivo: string | null
  origen: OrigenPresencia
}

/** Lo que ya está en `asistencia_dia`. `origen: null` = la columna todavía no existe en la base
 *  (la migración la aplica el dueño). Se trata como `'declarada'`: antes de la migración TODAS las
 *  filas las escribió la pantalla móvil, así que suponer lo contrario pisaría declaraciones reales. */
export interface PresenciaEnLaBase {
  persona_id: string
  fecha: string
  estado: EstadoPresencia
  motivo: string | null
  origen: OrigenPresencia | null
}

/** Una marca de las que viajan a `guardarJornada`: la de la grilla y la del celular. */
export interface MarcaConHoras {
  persona_id: string
  estado: 'presente' | 'ausente'
  horas: number
  motivo?: string | null
}

/** El estado de presencia que le corresponde a un día no trabajado. Lo decide el MOTIVO, igual que
 *  el `tipo_hora` de `registros_hh` — una sola regla, dos destinos. */
export const estadoDeAusencia = (motivo: string | null | undefined): EstadoPresencia =>
  tipoDeMotivo(motivo) === 'licencia' ? 'licencia' : 'ausente'

/**
 * Qué declara un envío de horas.
 *
 * HORAS > 0 ES PRESENCIA; CERO O MENOS NO DECLARA NADA. La base ya exige `horas > 0` y el schema
 * también, pero la regla vive acá para que se pueda probar: un día que no llegó a escribir horas no
 * puede afirmar que la persona estuvo, y afirmarlo sería fabricar el dato.
 */
export function declaracionesDeJornada(
  marcas: readonly MarcaConHoras[], fecha: string, obraId: string | null,
): DeclaracionPedida[] {
  const salida: DeclaracionPedida[] = []
  for (const m of marcas) {
    if (m.estado === 'ausente') {
      salida.push({
        persona_id: m.persona_id, fecha, obra_canonica_id: obraId,
        estado: estadoDeAusencia(m.motivo), motivo: m.motivo ?? null,
        // ELEGIR «no vino» ES UN ACTO, aunque entre por la puerta de las horas.
        origen: 'declarada',
      })
      continue
    }
    if (!(m.horas > 0)) continue
    salida.push({
      persona_id: m.persona_id, fecha, obra_canonica_id: obraId,
      // UNA PRESENCIA NO LLEVA MOTIVO: lo prohíbe el CHECK de la tabla y lo prohíbe el sentido.
      estado: 'presente', motivo: null, origen: 'horas',
    })
  }
  return salida
}

/** Lo que el panel de escritorio declara al corregir un día. Todo lo de esa pantalla es un estado
 *  ELEGIDO en el select «Qué pasó ese día», así que todo entra como `'declarada'`. */
export function declaracionDeCorreccion(c: {
  persona_id: string; fecha: string; obra: string | null
  estado: 'presente' | 'ausente'; motivo: string | null
}): DeclaracionPedida {
  return c.estado === 'ausente'
    ? {
      persona_id: c.persona_id, fecha: c.fecha, obra_canonica_id: c.obra,
      estado: estadoDeAusencia(c.motivo), motivo: c.motivo, origen: 'declarada',
    }
    : {
      persona_id: c.persona_id, fecha: c.fecha, obra_canonica_id: c.obra,
      estado: 'presente', motivo: null, origen: 'declarada',
    }
}

export interface PlanDeDeclaracion {
  escribir: DeclaracionPedida[]
  /** Lo que NO se escribe y por qué. Se dice: omitir en silencio es cómo se pierde un dato sin que
   *  nadie se entere. */
  omitidas: { persona_id: string; fecha: string; porque: string }[]
}

const clave = (persona: string, fecha: string): string => `${persona}|${fecha}`

/**
 * Qué de lo pedido llega a la base.
 *
 * ═══ UNA `'horas'` NO PISA UNA `'declarada'` ═══
 *
 * Si el jefe declaró el estado del día —presente, no vino o licencia—, la presencia deducida de una
 * carga de horas no lo cambia. Sin esta regla, cargarle las horas a alguien que el jefe marcó
 * ausente lo daría por presente sin que nadie lo haya afirmado, y la firma del `marcado_por`
 * pasaría a decir el nombre de quien sólo estaba cargando números.
 *
 * ═══ LO QUE NO CAMBIÓ NO SE ESCRIBE ═══
 *
 * Mismo criterio que `planDePresencia`: un upsert que reescribe lo idéntico corre el trigger y deja
 * `marcado_por` diciendo el nombre del último que pasó a mirar. La obra SÍ cuenta como cambio
 * —mover el día de obra mueve dónde se declaró la presencia—, pero sólo cuando la pedida trae obra:
 * una corrección sin obra no borra la que estaba.
 */
export function planDeDeclaracion(
  pedidas: readonly DeclaracionPedida[], guardadas: readonly PresenciaEnLaBase[],
): PlanDeDeclaracion {
  const previas = new Map(guardadas.map((g) => [clave(g.persona_id, g.fecha), g]))
  const plan: PlanDeDeclaracion = { escribir: [], omitidas: [] }
  for (const p of pedidas) {
    const previa = previas.get(clave(p.persona_id, p.fecha))
    if (previa && p.origen === 'horas' && (previa.origen ?? 'declarada') === 'declarada') {
      plan.omitidas.push({
        persona_id: p.persona_id, fecha: p.fecha,
        porque: `ya la declaró alguien a mano como «${previa.estado}»`,
      })
      continue
    }
    if (previa && previa.estado === p.estado && (previa.motivo ?? null) === (p.motivo ?? null)) {
      plan.omitidas.push({ persona_id: p.persona_id, fecha: p.fecha, porque: 'ya estaba así' })
      continue
    }
    plan.escribir.push(p)
  }
  return plan
}

/**
 * ¿Se retira la presencia cuando se borraron las horas del día?
 *
 * SÓLO SI LA PRODUJERON LAS HORAS Y NO QUEDÓ NADA MÁS EN EL DÍA. Una declaración explícita
 * sobrevive: sacar las horas cargadas no es afirmar que la persona no estuvo, y borrarla dejaría
 * «no se sabe» donde alguien había dicho algo. Y si la persona todavía tiene horas o una ausencia
 * en otra obra ese día, la premisa de la presencia sigue en pie.
 */
export function seRetiraLaPresencia(
  previa: PresenciaEnLaBase | null, quedanRegistrosEseDia: boolean,
): boolean {
  if (previa === null || quedanRegistrosEseDia) return false
  // `null` —columna sin aplicar— NO se retira: sin poder saber el origen, borrar es adivinar.
  return previa.origen === 'horas'
}

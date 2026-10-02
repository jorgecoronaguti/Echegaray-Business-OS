// QUIÉN PARTICIPÓ DE UNA TAREA CUENTA EN LA OBRA — aritmética pura, sin base y sin sesión.
//
// Dueño, 02/10/2026: «si cargo avance y digo quiénes participaron de la tarea, me tiene que
// considerar esas personas como parte del HH y de la cuadrilla en ERP Obras».
//
// ═══ LOS TRES HECHOS Y EL ÚNICO CÁLCULO ═══
//
//   la participación   → `obra_ejecucion_persona` (las personas de un parte, con o sin horas) y
//                        `registros_hh` con `actividad_id` (horas imputadas a la tarea)
//   la asistencia      → `registros_hh` de la persona ese día SIN tarea (lo que genera la presencia)
//   la jornada         → `jornadaPorDefecto`, la MISMA que usa Asistencia (9 L–J, 8 V, nada S–D)
//
// Lo único que se calcula acá es el REPARTO cuando la participación no trae horas: las de
// asistencia del día (o la jornada por defecto si no hay asistencia), menos lo ya cargado en otras
// tareas, en partes iguales entre las tareas sin horas. Es un cálculo y viaja marcado como tal.
//
// ═══ LO QUE ESTO NO HACE ═══
//
// No escribe nada: no crea filas en `registros_hh` ni toca `obra_asignacion`. Participar es un hecho
// del día, no un cambio de obra; y escribir el cálculo en la tabla canónica lo convertiría en un
// dato que nadie cargó. Tampoco mueve las horas de asistencia de la obra donde se registraron: eso
// cambiaría el costo de OTRA obra y es una decisión del dueño, no de una pantalla.

import { jornadaPorDefecto } from '../../administracion/services/jornadaPorDefecto.ts'

/** Una persona en una tarea un día, según el parte. `horas` null = el parte dice quién, no cuánto. */
export interface ParticipacionDeParte {
  persona_id: string
  obra_id: string
  actividad_id: string
  fecha: string
  horas: number | null
}

/** Una fila de `registros_hh` de horas TRABAJADAS (normal/extras). `actividad_id` null = asistencia. */
export interface HoraRegistrada {
  persona_id: string
  obra_id: string | null
  actividad_id: string | null
  fecha: string
  horas: number
}

export type OrigenHoras = 'cargada' | 'parte' | 'calculada'
export type BaseDelCalculo = 'asistencia' | 'jornada_defecto'

/** Las horas de una persona en una tarea un día, y de dónde salen. */
export interface HorasDeParticipacion {
  persona_id: string
  obra_id: string
  actividad_id: string
  fecha: string
  /** null = no hay con qué calcular (sin asistencia y sin jornada por defecto: fin de semana). */
  horas: number | null
  origen: OrigenHoras
  /** Sólo en `calculada`: si la base fue la asistencia registrada o la jornada por defecto. */
  base: BaseDelCalculo | null
}

// Truncar, no redondear: tres tareas de 9 h son 3 h cada una, pero 10 h entre tres redondeadas a
// 3,33 suman 9,99 y truncadas también; redondear hacia arriba podría sumar más que la asistencia.
const truncar2 = (n: number) => Math.floor(n * 100 + 1e-9) / 100

interface Tarea { obra_id: string; actividad_id: string }

/**
 * Las horas de cada participación, con la regla del dueño.
 *
 * Por persona y día: lo cargado a mano en `registros_hh` para esa tarea GANA y no se toca; si no
 * hay, las horas que trae el parte; si tampoco, el reparto: (asistencia del día, o jornada por
 * defecto si no hay) − lo ya cargado en otras tareas, en partes iguales entre las que no tienen
 * horas. Así la suma calculada nunca pasa la asistencia, y nada se cuenta dos veces.
 *
 * `registros` tiene que traer TODAS las horas de esas personas en esos días, de cualquier obra: el
 * reparto es de la persona, no de la obra que se está mirando.
 */
export function horasDeParticipacion(
  partes: readonly ParticipacionDeParte[], registros: readonly HoraRegistrada[],
): HorasDeParticipacion[] {
  const dias = new Map<string, { tareas: Map<string, Tarea>; parte: Map<string, number>; cargada: Map<string, number>; asistencia: number }>()
  const dia = (persona: string, fecha: string) => {
    const k = `${persona}|${fecha}`
    let d = dias.get(k)
    if (!d) { d = { tareas: new Map(), parte: new Map(), cargada: new Map(), asistencia: 0 }; dias.set(k, d) }
    return d
  }
  for (const r of registros) {
    if (!(r.horas > 0)) continue
    const d = dia(r.persona_id, r.fecha)
    if (r.actividad_id == null) { d.asistencia += r.horas; continue }
    d.tareas.set(r.actividad_id, { obra_id: r.obra_id ?? '', actividad_id: r.actividad_id })
    d.cargada.set(r.actividad_id, (d.cargada.get(r.actividad_id) ?? 0) + r.horas)
  }
  for (const p of partes) {
    const d = dia(p.persona_id, p.fecha)
    d.tareas.set(p.actividad_id, { obra_id: p.obra_id, actividad_id: p.actividad_id })
    if (p.horas != null && p.horas > 0) d.parte.set(p.actividad_id, Math.max(d.parte.get(p.actividad_id) ?? 0, p.horas))
  }

  const salida: HorasDeParticipacion[] = []
  for (const [k, d] of dias) {
    const [persona_id, fecha] = k.split('|')
    const sinHoras: Tarea[] = []
    let usadas = 0
    for (const t of d.tareas.values()) {
      const cargada = d.cargada.get(t.actividad_id)
      const parte = d.parte.get(t.actividad_id)
      if (cargada != null) {
        usadas += cargada
        salida.push({ persona_id, fecha, ...t, horas: cargada, origen: 'cargada', base: null })
      } else if (parte != null) {
        usadas += parte
        salida.push({ persona_id, fecha, ...t, horas: parte, origen: 'parte', base: null })
      } else sinHoras.push(t)
    }
    if (sinHoras.length === 0) continue
    const defecto = jornadaPorDefecto(fecha)
    const base: BaseDelCalculo | null = d.asistencia > 0 ? 'asistencia' : defecto != null ? 'jornada_defecto' : null
    const total = d.asistencia > 0 ? d.asistencia : defecto
    const cada = total == null ? null : truncar2(Math.max(total - usadas, 0) / sinHoras.length)
    for (const t of sinHoras) salida.push({ persona_id, fecha, ...t, horas: cada, origen: 'calculada', base })
  }
  return salida
}

/**
 * Lo que la participación AGREGA a las HH de una obra. Lo `cargada` ya está en `registros_hh` y lo
 * suma `obra_actividad_hh`: volver a sumarlo acá sería el doble conteo que la regla prohíbe.
 */
export function hhQueAgregaLaParticipacion(
  filas: readonly HorasDeParticipacion[], obraId: string,
): HorasDeParticipacion[] {
  return filas.filter((f) => f.obra_id === obraId && f.origen !== 'cargada' && f.horas != null && f.horas > 0)
}

/** Por tarea: cuántas HH agrega la participación y si alguna es calculada. */
export function hhDeParticipacionPorTarea(
  filas: readonly HorasDeParticipacion[], obraId: string,
): Map<string, { horas: number; calculada: boolean }> {
  const m = new Map<string, { horas: number; calculada: boolean }>()
  for (const f of hhQueAgregaLaParticipacion(filas, obraId)) {
    const v = m.get(f.actividad_id) ?? { horas: 0, calculada: false }
    m.set(f.actividad_id, {
      horas: Math.round((v.horas + (f.horas ?? 0)) * 100) / 100,
      calculada: v.calculada || f.origen === 'calculada',
    })
  }
  return m
}

/**
 * La cuadrilla de la obra: los asignados MÁS quien participó de una tarea de la obra en el período,
 * aunque su asignación vigente sea otra. Cada persona una vez; el asignado conserva su fila tal cual.
 * El que entra por participar viene marcado, para que la pantalla no lo confunda con una asignación.
 */
export function cuadrillaConParticipantes<T extends { id: string }>(
  asignados: readonly T[], participantes: readonly T[],
): (T & { por_participacion: boolean })[] {
  const ya = new Set(asignados.map((a) => a.id))
  const extra = new Map<string, T>()
  for (const p of participantes) if (!ya.has(p.id) && !extra.has(p.id)) extra.set(p.id, p)
  return [
    ...asignados.map((a) => ({ ...a, por_participacion: false })),
    ...[...extra.values()].map((p) => ({ ...p, por_participacion: true })),
  ]
}

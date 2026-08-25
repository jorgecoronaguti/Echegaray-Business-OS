// EL DÍA DEL JEFE DE OBRA — qué hay que resolver hoy y cómo va cada frente.
//
// ═══ «RESOLVER HOY» NO ES UNA LISTA DE AVISOS DEL SISTEMA ═══
//
// Son las cosas que, si nadie las toca, frenan trabajo. Tres hechos y ninguna inferencia:
//
//   · un IMPEDIMENTO abierto        alguien lo escribió, y la actividad está bloqueada por él
//   · una TAREA ATRASADA en curso   su fin de plan pasó y no está terminada
//   · gente SIN REGISTRAR           tiene asignación vigente y hoy no hay marca suya
//
// El tercero NO dice «ausente» y no se cuenta como falta: dice que no hay marca. Un operario sin
// teléfono, uno que no le dio permiso al GPS y uno que faltó se ven exactamente igual desde acá.
// Convertir esa ignorancia en una ausencia sería fabricar una novedad de liquidación.
//
// Si no hay ninguno, el bloque NO se dibuja. Un panel que siempre dice algo deja de decir.

import { atrasoDelFrente, avanceDelFrente, diasDeAtraso, frentesDe } from './frentes.ts'
import type { Frente, NodoArbol } from './frentes.ts'
import type { ActividadDelJefe, HHDelDia, Impedimento } from './jefeService.ts'

export type TonoProblema = 'neg' | 'warn'

export interface Problema {
  clave: string
  titulo: string
  detalle: string
  tono: TonoProblema
  /** A dónde lleva tocarlo. `null` cuando no hay pantalla que lo resuelva todavía. */
  actividadId: string | null
}

const TERMINADAS = new Set(['hecha', 'terminada'])

export const estaTerminada = (a: { estado_operativo: string }) => TERMINADAS.has(a.estado_operativo)

/** Las tareas reales de la obra: sin contenedores y sin hitos vacíos de trabajo. */
export const soloTareas = (as: ActividadDelJefe[]) => as.filter((a) => a.tipo !== 'resumen')

export function problemasDelDia(args: {
  actividades: ActividadDelJefe[]
  impedimentos: Impedimento[]
  sinRegistrar: number
  hoy: string
}): Problema[] {
  const nombre = new Map(args.actividades.map((a) => [a.actividad_id, a.nombre]))
  const impedimentos: Problema[] = args.impedimentos.map((i) => ({
    clave: `imp-${i.id}`,
    titulo: i.descripcion?.trim() || 'Impedimento sin descripción',
    detalle: i.actividad_id
      ? `Frena ${nombre.get(i.actividad_id) ?? 'una tarea de esta obra'}`
      : 'Abierto en la obra, sin tarea señalada',
    tono: 'neg',
    actividadId: i.actividad_id,
  }))

  const atrasadas: Problema[] = soloTareas(args.actividades)
    .filter((a) => !estaTerminada(a))
    .map((a) => ({ a, dias: diasDeAtraso(a.fin_plan, a.fin_real, args.hoy) }))
    .filter((x): x is { a: ActividadDelJefe; dias: number } => x.dias != null)
    .sort((x, y) => y.dias - x.dias)
    .slice(0, 5)
    .map(({ a, dias }) => ({
      clave: `atr-${a.actividad_id}`,
      titulo: a.nombre,
      detalle: `${dias} ${dias === 1 ? 'día' : 'días'} pasado el plan · va en ${
        a.avance_pct == null ? 'avance sin medir' : `${a.avance_pct} %`}`,
      tono: 'warn' as const,
      actividadId: a.actividad_id,
    }))

  const marcas: Problema[] = args.sinRegistrar > 0
    ? [{
        clave: 'sin-registrar',
        titulo: `${args.sinRegistrar} ${args.sinRegistrar === 1 ? 'persona' : 'personas'} sin registrar`,
        // NUNCA «ausentes». Ver el bloque de arriba.
        detalle: 'Tienen asignación vigente y hoy no hay marca suya',
        tono: 'warn' as const,
        actividadId: null,
      }]
    : []

  return [...impedimentos, ...atrasadas, ...marcas]
}

export interface FrenteDelDia {
  frente: Frente
  pct: number | null
  medidas: number
  total: number
  /** Tareas del frente que todavía no están terminadas. */
  abiertas: number
  atrasoDias: number | null
  /** Personas que imputaron horas hoy a alguna tarea del frente. Es el único vínculo real. */
  personasHoy: number
  hhHoy: number
  /**
   * Alguien cargó HOY un parte contra alguna tarea del frente (`ultimo_parte`).
   *
   * No es lo mismo que «hay horas imputadas»: el parte es la declaración de avance del día y las HH
   * son otra fila. Un frente puede tener gente con horas y nadie que haya dicho hasta dónde llegó,
   * que es exactamente el frente que hay que ir a buscar antes de que termine la jornada.
   */
  parteHoy: boolean
  /** Impedimentos abiertos sobre sus tareas. Con uno, el frente está parado. */
  impedimentos: number
  /** Ninguna de sus tareas abiertas tiene cuadrilla prevista: el frente no tiene quién lo haga. */
  sinCuadrilla: boolean
}

/**
 * Los frentes con lo que se sabe de cada uno hoy.
 *
 * `personasHoy` sale de las HH imputadas contra las tareas del frente, que es el ÚNICO vínculo
 * registrado entre una persona y un frente: el modelo asigna personas a la OBRA, no al frente. Por
 * eso la pantalla lo rotula «imputaron horas hoy» y no «gente del frente» — dice lo que el dato
 * afirma, ni más ni menos.
 */
export function frentesDelDia(
  arbol: NodoArbol[], actividades: ActividadDelJefe[], hh: HHDelDia[], hoy: string,
): FrenteDelDia[] {
  const porId = new Map(actividades.map((a) => [a.actividad_id, a]))
  const personasPorActividad = new Map<string, Set<string>>()
  const horasPorActividad = new Map<string, number>()
  for (const h of hh) {
    const s = personasPorActividad.get(h.actividad_id) ?? new Set<string>()
    s.add(h.persona_id)
    personasPorActividad.set(h.actividad_id, s)
    horasPorActividad.set(h.actividad_id, (horasPorActividad.get(h.actividad_id) ?? 0) + h.horas)
  }

  return frentesDe(arbol).map((frente) => {
    const tareas = frente.tareas.map((id) => porId.get(id)).filter((a): a is ActividadDelJefe => !!a)
    // Las HH plan viajan porque el avance del frente se pondera por ellas — la regla canónica está
    // en `avance.ts`. Sin este campo el frente volvería a promediar simple sin decirlo.
    const avance = avanceDelFrente(tareas.map(
      (t) => ({ actividad_id: t.actividad_id, avance_pct: t.avance_pct, hh_plan: t.hh_plan }),
    ))
    const gente = new Set<string>()
    let hhHoy = 0
    for (const t of tareas) {
      for (const p of personasPorActividad.get(t.actividad_id) ?? []) gente.add(p)
      hhHoy += horasPorActividad.get(t.actividad_id) ?? 0
    }
    const abiertas = tareas.filter((t) => !estaTerminada(t))
    return {
      frente,
      pct: avance.pct,
      medidas: avance.medidas,
      total: avance.total,
      abiertas: abiertas.length,
      atrasoDias: atrasoDelFrente(
        abiertas.map((t) => ({ fin_plan: t.fin_plan, fin_real: t.fin_real })), hoy),
      personasHoy: gente.size,
      hhHoy: Math.round(hhHoy * 100) / 100,
      // `ultimo_parte` llega como fecha o como marca de tiempo según la vista: se compara por los
      // diez primeros caracteres, que es el día. Comparar la cadena entera daba siempre `false`.
      parteHoy: tareas.some((t) => t.ultimo_parte?.slice(0, 10) === hoy),
      impedimentos: tareas.reduce((s, t) => s + t.impedimentos_abiertos, 0),
      sinCuadrilla: abiertas.length > 0 && abiertas.every((t) => !t.cuadrilla_prevista),
    }
  })
}

/**
 * Los frentes ABIERTOS: los que todavía tienen trabajo. El frente terminado no desaparece del
 * sistema, sale de la pantalla del día — quien quiera verlo entra por Tareas.
 *
 * Se ordenan por atraso: lo que fija la fecha de fin de obra va arriba.
 */
export function frentesAbiertos(frentes: FrenteDelDia[]): FrenteDelDia[] {
  return frentes
    .filter((f) => f.total > 0 && f.abiertas > 0)
    .sort((a, b) => (b.atrasoDias ?? -1) - (a.atrasoDias ?? -1))
}

export interface EstadoDeFrente { palabra: string; tono: 'neg' | 'warn' | 'ink' | 'faint' }

/**
 * EL ESTADO DEL FRENTE EN UNA PALABRA — punto + palabra, nunca una pastilla de color.
 *
 * «Sin gente» NO se decide por las horas imputadas: a media mañana nadie imputó todavía y el ámbar
 * cubriría la lista entera, que es cómo un color de alerta deja de alertar. Se decide por la
 * CUADRILLA PREVISTA, que es una decisión de planificación tomada o no tomada, y no cambia con la
 * hora del día.
 */
export function estadoDelFrente(f: FrenteDelDia): EstadoDeFrente {
  if (f.impedimentos > 0) return { palabra: 'parado', tono: 'neg' }
  if (f.sinCuadrilla) return { palabra: 'sin cuadrilla', tono: 'warn' }
  if (f.personasHoy > 0) return { palabra: 'en curso', tono: 'ink' }
  return { palabra: 'sin horas hoy', tono: 'faint' }
}

/** Los tres números del encabezado de J01. Ninguno inventado: los tres se cuentan. */
export interface ResumenDeFrentes { abiertos: number; conParte: number; parados: number }

export function resumenDeFrentes(frentes: FrenteDelDia[]): ResumenDeFrentes {
  return {
    abiertos: frentes.length,
    conParte: frentes.filter((f) => f.parteHoy).length,
    parados: frentes.filter((f) => f.impedimentos > 0).length,
  }
}

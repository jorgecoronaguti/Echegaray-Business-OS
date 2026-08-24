// EJECUCIÓN — la lectura de los partes diarios.
//
// El acumulado por actividad NO se suma acá: lo publica `obra_actividad_control`, que es de donde
// salen el avance, la producción acumulada y la productividad. Esto devuelve el DETALLE —qué se
// cargó cada día— para que el número de arriba se pueda auditar y para que un error de carga se
// pueda encontrar y borrar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Actividad, ParteEjecucion, ServiceResult } from '../types'
import { esTrabajada } from './tipoHora.ts'

/** Los partes de la obra, del más nuevo al más viejo. Con `actividadId`, los de esa actividad. */
export async function getPartes(
  supabase: SupabaseClient, obraId: string, actividadId?: string,
): Promise<ServiceResult<ParteEjecucion[]>> {
  const base = supabase.from('obra_ejecucion')
    .select('id, obra_id, actividad_id, fecha, cantidad, avance_pct, comentario, fuente, creado_en')
    .eq('obra_id', obraId)
  const { data, error } = await (actividadId ? base.eq('actividad_id', actividadId) : base)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })
    .limit(400)
  if (error) return { data: null, error: error.message }
  return {
    data: (data ?? []).map((p) => {
      const f = p as ParteEjecucion
      return { ...f, cantidad: f.cantidad === null ? null : Number(f.cantidad),
        avance_pct: f.avance_pct === null ? null : Number(f.avance_pct) }
    }),
    error: null,
  }
}

/** Lo cargado HOY por actividad. Es la columna «hoy» de la pantalla de Ejecución: lo que se movió
 *  en la jornada que se está cargando, no el acumulado. */
export function deHoy(partes: ParteEjecucion[], fecha: string): Map<string, { cantidad: number; pct: number }> {
  const m = new Map<string, { cantidad: number; pct: number }>()
  for (const p of partes) {
    if (p.fecha !== fecha) continue
    const a = m.get(p.actividad_id) ?? { cantidad: 0, pct: 0 }
    m.set(p.actividad_id, { cantidad: a.cantidad + (p.cantidad ?? 0), pct: a.pct + (p.avance_pct ?? 0) })
  }
  return m
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LOS KPIs DE LA JORNADA — `design/screens/obras.md` §1c.
//
// El handoff pide cuatro: partes de hoy, HH del día, actividades tocadas y «sin parte» en rojo.
//
// ═══ SE PUBLICAN TRES, Y SE DICE POR QUÉ ═══
//
// «HH del día» sale de `registros_hh`, que esta solapa no lee: las horas del parte las escribe
// `imputarHHMasivo` en la tabla de Personal, y sumarlas acá desde otra fuente sería la segunda
// definición de las HH del día. Se publica cuando la página pase los registros, no antes.
//
// «Sin parte» en el handoff son CUADRILLAS sin parte, y `obra_ejecucion` no guarda cuadrilla: un
// parte no sabe quién lo hizo. Lo que sí se sabe —y contesta la misma pregunta— es qué frentes
// abiertos no reportaron hoy: actividades EN CURSO sin un solo parte en la jornada. Es un hecho, no
// una inferencia sobre quién trabajó.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export interface KpisDelDia {
  /** Partes cargados en la jornada. */
  partes: number
  /** Actividades distintas tocadas en la jornada. */
  tocadas: number
  /** Actividades en curso, que es contra lo que se leen las tocadas. */
  enCurso: number
  /** Frentes en curso que hoy no reportaron. Es el número que va en `neg`. */
  sinParte: number
}

export function kpisDelDia(
  partes: ParteEjecucion[], actividades: Actividad[], dia: string,
): KpisDelDia {
  const delDia = partes.filter((p) => p.fecha === dia)
  const tocadas = new Set(delDia.map((p) => p.actividad_id))
  // Un rubro de resumen no se ejecuta: se completa solo con sus hijas, y exigirle un parte diario
  // pondría un «sin parte» permanente que nadie puede resolver.
  const enCurso = actividades.filter(
    (a) => !a.archivada && a.tipo !== 'resumen' && a.estado_operativo === 'en_curso')
  return {
    partes: delDia.length,
    tocadas: tocadas.size,
    enCurso: enCurso.length,
    sinParte: enCurso.filter((a) => !tocadas.has(a.id)).length,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CABECERA DE LA JORNADA — el canónico 05 escribe «HH 35,0 · PERSONAS 14» al lado de «Cargado
// hoy». Ese número NO sale de `obra_ejecucion`: un parte no sabe quién lo hizo. Sale de
// `registros_hh`, la MISMA tabla de la que sale la liquidación, para que no existan dos HH del día.
//
// Por eso la firma distingue tres mundos que un `number` aplastaría en cero:
//   `undefined` → la página no pidió los registros. No se sabe: «sin registrar».
//   `[]`        → se leyeron y no hay ninguno. Es un CERO REAL de la jornada.
//   con filas   → el total trabajado y la gente distinta que lo trabajó.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que hace falta de un registro para contar la jornada. Nada más: pedir `RegistroHH` entero
 *  ataría esta cuenta a la forma de la tabla de Personal. */
export interface HoraDeJornada {
  fecha: string | null
  horas: number
  tipo_hora: string
  persona_id: string | null
  persona_nombre: string | null
}

export interface JornadaHH {
  hh: number
  /** Personas DISTINTAS con horas trabajadas. Una persona con dos imputaciones cuenta una vez. */
  personas: number
}

/**
 * HH y personas de una jornada. Descarta ausencia y licencia —tienen horas y no son trabajo— con
 * el mismo criterio que Personal (`esTrabajada`): dos definiciones de «hora trabajada» darían dos
 * totales para el mismo día.
 *
 * Devuelve `null` cuando no hay fuente. El que dibuja escribe «sin registrar», nunca 0.
 */
export function jornadaHH(registros: HoraDeJornada[] | undefined, dia: string): JornadaHH | null {
  if (registros == null) return null
  let hh = 0
  const gente = new Set<string>()
  for (const r of registros) {
    if (r.fecha !== dia || !esTrabajada(r.tipo_hora)) continue
    hh += r.horas
    // Sin `persona_id` la fila es del Sheet legacy de JORNALES: identifica por el texto del nombre
    // para no contar dos veces a la misma persona, y no cuenta la que no dice a quién.
    const quien = r.persona_id ?? r.persona_nombre
    if (quien) gente.add(quien)
  }
  return { hh, personas: gente.size }
}

/**
 * LO QUE FALTA DE UNA ACTIVIDAD, para el desplegable del parte: el canónico 05 pone esa cifra al
 * borde derecho de cada opción, y es lo que decide cuánto cargar sin salir del formulario.
 *
 * `null` cuando la actividad no declara objetivo: «pendiente» sobre un objetivo desconocido sería
 * un número inventado. El que dibuja escribe «sin medición».
 */
export function pendienteDe(
  a: { metodo_avance: string; unidad: string | null; cantidad_objetivo: number | null; cantidad_ejecutada: number | null },
): { cantidad: number; unidad: string } | null {
  if (a.metodo_avance !== 'cantidad' || a.cantidad_objetivo == null) return null
  return {
    // Un objetivo sobrepasado no debe leerse como pendiente negativo: ya no falta nada.
    cantidad: Math.max(0, a.cantidad_objetivo - (a.cantidad_ejecutada ?? 0)),
    unidad: a.unidad ?? '',
  }
}

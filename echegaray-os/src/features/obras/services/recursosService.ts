// LOS RECURSOS DE UNA ACTIVIDAD — quién trabajó y qué equipo se usó.
//
// ═══ PLAN Y REAL SON DOS FUENTES DISTINTAS, Y NO SE MEZCLAN ═══
//
// El PLAN es lo que dice la actividad: `cuadrilla_prevista` (o el texto legacy `cuadrilla`) y su
// responsable. Vive en `obra_actividad` y lo escribe quien planifica.
//
// El REAL sale de los HECHOS: las personas que efectivamente imputaron horas a esa actividad
// (`registros_hh`) y los equipos que se cargaron en sus partes (`obra_ejecucion_equipo`). No hay una
// segunda asignación que mantener al día: si alguien trabajó, aparece; si no, no.
//
// Un solo query por obra y no uno por actividad: el panel cambia de actividad con cada clic y una
// consulta por clic haría el cronograma pegajoso justo en lo que más se usa.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Una persona que efectivamente trabajó en la actividad, con las horas que le imputaron.
 *  Sin nombre: el nombre lo resuelve la pantalla contra `persona_plantel`, que es la ÚNICA puerta
 *  al legajo. Traerlo de `personas` acá abriría una segunda. */
export interface PersonaEnActividad {
  persona_id: string
  horas: number
}

/** Lo que se trabajó en una actividad, en dos cortes de la MISMA lectura. */
export interface TrabajoDeActividad {
  /** Quiénes, con su total de horas, del que más trabajó al que menos. */
  personas: Map<string, PersonaEnActividad[]>
  /** Cuántas horas y cuántas personas por DÍA. Es lo que llena las dos columnas que el parte no
   *  puede llenar: `obra_ejecucion` no guarda horas —van a `registros_hh`— y sin esto la tabla de
   *  ejecución reciente tendría que inventarlas o dejarlas afuera. */
  porFecha: Map<string, Map<string, { horas: number; personas: number }>>
}

/**
 * QUIÉNES TRABAJARON, por actividad y por día. UNA sola lectura para los dos cortes.
 *
 * Sale de `registros_hh`, la fuente canónica de tiempo. Se filtra por `obra_canonica_id` y NO por el
 * `obra_id` legacy —que apunta a `public.obras`—, igual que `getRegistrosHH`: son dos ejes distintos
 * y mezclarlos devuelve las horas de otra obra.
 *
 * Se piden las horas normales y las extras —las mismas tres clases que suma `obra_actividad_hh`—
 * para que la suma de esta lista dé exactamente el «HH reales» que muestra el panel arriba. Dos
 * criterios distintos para el mismo total es cómo una pantalla se contradice consigo misma.
 */
export async function getTrabajoPorActividad(
  supabase: SupabaseClient, obraId: string,
): Promise<TrabajoDeActividad> {
  const { data } = await supabase
    .from('registros_hh')
    .select('actividad_id, persona_id, horas, fecha')
    .eq('obra_canonica_id', obraId)
    .not('actividad_id', 'is', null)
    .in('tipo_hora', ['normal', 'extra_50', 'extra_100'])
    .limit(5000)

  type Fila = { actividad_id: string; persona_id: string | null; horas: number | string; fecha: string | null }
  const porPersona = new Map<string, Map<string, PersonaEnActividad>>()
  const porFecha = new Map<string, Map<string, { horas: number; personas: number }>>()
  const gente = new Map<string, Set<string>>()

  for (const f of (data ?? []) as Fila[]) {
    const horas = Number(f.horas) || 0
    if (f.persona_id) {
      const suyas = porPersona.get(f.actividad_id) ?? new Map<string, PersonaEnActividad>()
      const previa = suyas.get(f.persona_id)
      if (previa) previa.horas += horas
      else suyas.set(f.persona_id, { persona_id: f.persona_id, horas })
      porPersona.set(f.actividad_id, suyas)
    }
    if (f.fecha) {
      const dias = porFecha.get(f.actividad_id) ?? new Map<string, { horas: number; personas: number }>()
      const dia = dias.get(f.fecha) ?? { horas: 0, personas: 0 }
      dia.horas += horas
      dias.set(f.fecha, dia)
      porFecha.set(f.actividad_id, dias)
      // Las PERSONAS de un día se cuentan distintas: dos filas de la misma persona (normal y extra)
      // son una persona, no dos.
      const k = `${f.actividad_id}|${f.fecha}`
      const s = gente.get(k) ?? new Set<string>()
      if (f.persona_id) s.add(f.persona_id)
      gente.set(k, s)
    }
  }
  for (const [k, s] of gente) {
    const [act, fecha] = k.split('|')
    const dia = porFecha.get(act)?.get(fecha)
    if (dia) dia.personas = s.size
  }

  const personas = new Map<string, PersonaEnActividad[]>()
  for (const [act, m] of porPersona) {
    personas.set(act, [...m.values()].sort((a, b) => b.horas - a.horas))
  }
  return { personas, porFecha }
}

/** Un equipo que trabajó en la actividad, con las horas acumuladas de todos sus partes. */
export interface EquipoEnActividad {
  equipo: string
  /** NULL cuando nadie anotó horas en ninguna jornada. No es cero: es que no se sabe. */
  horas: number | null
  /** En cuántas jornadas apareció. Es lo que distingue «se usó una vez» de «se usa siempre». */
  jornadas: number
}

/** QUÉ EQUIPOS SE USARON, por actividad. Sale de los partes: no hay una asignación de máquinas. */
export async function getEquiposPorActividad(
  supabase: SupabaseClient, obraId: string,
): Promise<Map<string, EquipoEnActividad[]>> {
  const { data } = await supabase
    .from('obra_ejecucion_equipo')
    .select('equipo, horas, obra_ejecucion!inner(actividad_id)')
    .eq('obra_id', obraId)
    .limit(5000)

  type Fila = {
    equipo: string; horas: number | string | null
    obra_ejecucion: { actividad_id: string } | { actividad_id: string }[] | null
  }
  const porActividad = new Map<string, Map<string, EquipoEnActividad>>()
  for (const f of (data ?? []) as Fila[]) {
    const e = Array.isArray(f.obra_ejecucion) ? f.obra_ejecucion[0] : f.obra_ejecucion
    if (!e) continue
    const suyos = porActividad.get(e.actividad_id) ?? new Map<string, EquipoEnActividad>()
    const clave = f.equipo.toLowerCase()
    const previo = suyos.get(clave)
    const horas = f.horas == null ? null : Number(f.horas)
    if (previo) {
      previo.jornadas++
      // HORAS SIN CARGAR NO SON CERO. Sumar null como 0 diría «esta máquina trabajó 4 h» cuando en
      // dos de las tres jornadas nadie anotó cuántas.
      if (horas != null) previo.horas = (previo.horas ?? 0) + horas
    } else {
      suyos.set(clave, { equipo: f.equipo, horas, jornadas: 1 })
    }
    porActividad.set(e.actividad_id, suyos)
  }
  const salida = new Map<string, EquipoEnActividad[]>()
  for (const [act, equipos] of porActividad) {
    salida.set(act, [...equipos.values()].sort((a, b) => b.jornadas - a.jornadas))
  }
  return salida
}

/**
 * EL CATÁLOGO DE EQUIPOS para la ayuda de carga: los nombres de `herramientas`, el espejo del Sheet.
 *
 * Es una AYUDA, no una restricción: el campo acepta cualquier texto. Un equipo alquilado por una
 * semana no está en el inventario y no puede ser motivo para no anotarlo.
 */
export async function getCatalogoEquipos(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('herramientas').select('nombre').order('nombre').limit(400)
  const nombres = new Set<string>()
  for (const h of (data ?? []) as { nombre: string | null }[]) {
    if (h.nombre?.trim()) nombres.add(h.nombre.trim())
  }
  return [...nombres]
}

/** Una nota de actividad, tal como se lee. */
export interface NotaActividad {
  id: string
  actividad_id: string
  texto: string
  creado_en: string
  autor: string | null
}

/** LAS NOTAS de todas las actividades de la obra, de la más nueva a la más vieja. */
export async function getNotas(
  supabase: SupabaseClient, obraId: string,
): Promise<Map<string, NotaActividad[]>> {
  const { data } = await supabase
    .from('obra_actividad_nota')
    .select('id, actividad_id, texto, creado_en, perfiles(nombre)')
    .eq('obra_id', obraId)
    .order('creado_en', { ascending: false })
    .limit(1000)

  type Fila = {
    id: string; actividad_id: string; texto: string; creado_en: string
    perfiles: { nombre: string | null } | { nombre: string | null }[] | null
  }
  const m = new Map<string, NotaActividad[]>()
  for (const f of (data ?? []) as Fila[]) {
    const p = Array.isArray(f.perfiles) ? f.perfiles[0] : f.perfiles
    const previas = m.get(f.actividad_id) ?? []
    previas.push({ id: f.id, actividad_id: f.actividad_id, texto: f.texto, creado_en: f.creado_en, autor: p?.nombre ?? null })
    m.set(f.actividad_id, previas)
  }
  return m
}

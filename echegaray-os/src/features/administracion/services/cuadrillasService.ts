// CUADRILLAS — la lectura.
//
// La cuadrilla NO guarda a qué obra va: eso se deriva de las asignaciones vigentes de sus
// integrantes. La vista `cuadrilla_panel` hace esa derivación y es la única que la hace.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cuadrilla, Integrante, ServiceResult, SinCuadrilla } from '../types'
// RUTA RELATIVA CON EXTENSIÓN: `node --test` no conoce el alias `@/`, y un import de VALOR por alias
// mata la prueba con ERR_MODULE_NOT_FOUND antes de la primera aserción.
import { esTrabajada } from '../../obras/services/tipoHora.ts'
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'

/**
 * FILTRAR POR TEXTO — en memoria, sobre lo que la consulta ya trajo.
 *
 * `cuadrilla_panel` son unas pocas filas y ya viajan enteras: pedirle a Postgres un `ilike` por cada
 * tecla sería un viaje para descartar tres filas. Lo que sí queda en la URL es el texto, para que la
 * vista filtrada se pueda compartir y recargar.
 *
 * Se busca por NOMBRE, RESPONSABLE Y OBRA porque son las tres columnas que la tabla muestra. Buscar
 * sólo por el nombre haría que escribir el apellido del capataz —que está a la vista— vaciara la
 * lista, y quien busca concluiría que la cuadrilla no existe.
 */
export function filtrarCuadrillas<T extends Pick<Cuadrilla, 'nombre' | 'responsable' | 'obras_actuales'>>(
  cuadrillas: T[],
  q: string,
): T[] {
  return cuadrillas.filter((c) => contieneEnAlguno([c.nombre, c.responsable, c.obras_actuales], q))
}

export async function getCuadrillas(
  supabase: SupabaseClient,
  incluirInactivas = false,
): Promise<ServiceResult<Cuadrilla[]>> {
  let consulta = supabase.from('cuadrilla_panel').select('*')
  if (!incluirInactivas) consulta = consulta.eq('activa', true)
  const { data, error } = await consulta.order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Cuadrilla[], error: null }
}

/**
 * Los integrantes de una cuadrilla. Por defecto los VIGENTES; con `historial` también los que ya
 * salieron, que es lo que responde "¿quién estaba en esta cuadrilla en marzo?".
 *
 * El nombre se resuelve contra `persona_plantel` en una segunda consulta y no con un embed: el
 * plantel es una VISTA, y PostgREST sólo sabe embeber por una clave foránea declarada. Un embed
 * contra la vista compilaría y devolvería `null` para todo el mundo — el modo de falla más caro,
 * porque un nombre vacío parece un dato.
 */
export async function getIntegrantes(
  supabase: SupabaseClient,
  cuadrillaId: string,
  historial = false,
): Promise<ServiceResult<Integrante[]>> {
  let consulta = supabase
    .from('cuadrilla_integrante').select('id, persona_id, desde, hasta').eq('cuadrilla_id', cuadrillaId)
  if (!historial) consulta = consulta.is('hasta', null)
  const { data, error } = await consulta.order('desde', { ascending: false })
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as { id: string; persona_id: string; desde: string; hasta: string | null }[]
  const ids = [...new Set(filas.map((f) => f.persona_id))]
  const persona = new Map<string, { nombre_completo: string; categoria: string | null }>()
  if (ids.length > 0) {
    // `categoria` es una de las CINCO columnas que publica `persona_plantel`, y es la que le da su
    // peso al integrante. Sin ella el panel mostraría cinco nombres y una capacidad de 4,2 sin poder
    // explicar de dónde sale.
    const { data: personas } = await supabase
      .from('persona_plantel').select('id, nombre_completo, categoria').in('id', ids)
    for (const p of (personas ?? []) as { id: string; nombre_completo: string; categoria: string | null }[]) {
      persona.set(p.id, { nombre_completo: p.nombre_completo, categoria: p.categoria })
    }
  }
  return {
    data: filas.map((f) => ({
      ...f,
      nombre_completo: persona.get(f.persona_id)?.nombre_completo ?? null,
      categoria: persona.get(f.persona_id)?.categoria ?? null,
    })),
    error: null,
  }
}

// ═══ LA CAPACIDAD PONDERADA — NO SE CUENTAN CABEZAS ═══
//
// Cuatro ayudantes no son cuatro oficiales: son 2,4. El cálculo YA existe y vive en la vista
// `cuadrilla_capacidad` (migración 20260821T2400), que es la que lee la 08. Acá se lee esa misma
// vista y no se vuelve a multiplicar nada en TypeScript — dos definiciones de «cuánto rinde esta
// cuadrilla» terminarían en dos números distintos en dos pantallas.

export interface CapacidadCuadrilla {
  capacidad_ponderada: number
  personas: number
  /** Quiénes pesan 1,0 por defecto porque no tienen categoría cargada. Se publica para que el
   *  supuesto se vea, en vez de esconderse adentro del total. */
  personas_sin_categoria: number
}

export async function getCapacidadDeCuadrillas(
  supabase: SupabaseClient, ids: string[],
): Promise<Map<string, CapacidadCuadrilla>> {
  const mapa = new Map<string, CapacidadCuadrilla>()
  if (ids.length === 0) return mapa
  const { data } = await supabase
    .from('cuadrilla_capacidad')
    .select('cuadrilla_id, personas, capacidad_ponderada, personas_sin_categoria')
    .in('cuadrilla_id', ids)
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    mapa.set(String(c.cuadrilla_id), {
      // `numeric` llega como TEXTO por PostgREST: sin Number, «2.4» no se puede ni comparar ni sumar.
      capacidad_ponderada: Number(c.capacidad_ponderada ?? 0),
      personas: Number(c.personas ?? 0),
      personas_sin_categoria: Number(c.personas_sin_categoria ?? 0),
    })
  }
  return mapa
}

// ═══ EL PIE DE «CUADRILLAS Y HH» — Design 23/08/2026, pantalla 21 §Status bar ═══
//
// El canónico corona la pantalla con cuatro números. Tres se cuentan sobre lo que ya está leído;
// el cuarto —la capacidad total— es el que tiene la trampa.
//
// UNA CAPACIDAD QUE NO SE PUDO LEER NO ES CERO. `cuadrilla_capacidad` puede no traer la fila de una
// cuadrilla (la vista agrupa sobre integrantes: sin integrantes vigentes no hay fila). Sumar esas
// cuadrillas como 0 devuelve un total que parece completo y no lo es: nadie puede distinguir «la
// empresa rinde 12,4 oficiales» de «rinde 12,4 de las que pude mirar». Por eso el total se acompaña
// SIEMPRE de cuántas quedaron afuera, y cuando no se pudo leer ninguna el total es `null`.
//
// Es la misma regla que la columna CAP. POND. de la tabla, que muestra «—» y no 0.

export interface ResumenCuadrillas {
  cuadrillas: number
  personas: number
  /** `null` cuando NINGUNA cuadrilla trajo su capacidad: un 0 afirmaría que la empresa no rinde. */
  capacidad: number | null
  /** Cuántas cuadrillas de la lista no tienen capacidad leída. El supuesto se ve, no se esconde. */
  sinCapacidad: number
  sinCuadrilla: number
}

export function resumirCuadrillas(
  cuadrillas: { id: string; integrantes: number }[],
  capacidades: Map<string, CapacidadCuadrilla>,
  sinCuadrilla: number,
): ResumenCuadrillas {
  const leidas = cuadrillas.map((c) => capacidades.get(c.id)).filter((c): c is CapacidadCuadrilla => Boolean(c))
  return {
    cuadrillas: cuadrillas.length,
    personas: cuadrillas.reduce((a, c) => a + Number(c.integrantes ?? 0), 0),
    capacidad: leidas.length === 0 ? null : leidas.reduce((a, c) => a + c.capacidad_ponderada, 0),
    sinCapacidad: cuadrillas.length - leidas.length,
    sinCuadrilla,
  }
}

/**
 * EL POOL: quién está en el plantel y hoy no integra ninguna cuadrilla.
 *
 * Sale de `persona_directorio`, que ya deriva la cuadrilla vigente de cada persona — la misma
 * derivación que usa la ficha. Calcularlo acá restando listas daría un pool que discrepa con la
 * ficha el día que alguien cierre un período con fecha futura.
 */
export async function getSinCuadrilla(
  supabase: SupabaseClient,
): Promise<ServiceResult<SinCuadrilla[]>> {
  const { data, error } = await supabase
    .from('persona_directorio').select('id, nombre_completo, categoria, obra_actual')
    .eq('en_la_empresa', true).is('cuadrilla_id', null)
    .order('nombre_completo', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as SinCuadrilla[], error: null }
}

/** La cuadrilla vigente de cada persona, para el selector de la ficha. */
export async function getCuadrillaDe(
  supabase: SupabaseClient,
  personaId: string,
): Promise<{ cuadrilla_id: string; desde: string } | null> {
  const { data } = await supabase
    .from('cuadrilla_integrante').select('cuadrilla_id, desde')
    .eq('persona_id', personaId).is('hasta', null).maybeSingle()
  return (data as { cuadrilla_id: string; desde: string } | null) ?? null
}

// ═══ LAS HH DE LA CUADRILLA — SUMADAS, NO GUARDADAS ═══
//
// El handoff pide «HH del período» en el panel de la cuadrilla. NO hay —ni va a haber— una columna
// con ese total: la cuadrilla es un conjunto de PERÍODOS de pertenencia, así que su total depende de
// quién la integraba en cada día del período. Un número guardado al lado quedaría viejo el primer
// día que entre o salga alguien, y nadie se enteraría.
//
// Se suma sobre `registros_hh`, que es la misma fuente que lee la ficha de cada persona y la solapa
// Personal de la obra. Una sola definición de «HH», leída por tres pantallas.

/** Sólo las horas TRABAJADAS y sólo dentro de la ventana. Una ausencia tiene horas y no es trabajo:
 *  sumarla diría que la cuadrilla trabajó el día que faltó medio equipo. */
export function sumarHHTrabajadas(
  filas: { fecha: string | null; horas: number | string | null; tipo_hora: string }[],
  desde: string,
  hasta: string,
): number {
  return filas
    .filter((f) => f.fecha != null && f.fecha >= desde && f.fecha <= hasta && esTrabajada(f.tipo_hora))
    .reduce((a, f) => a + Number(f.horas ?? 0), 0)
}

/**
 * Las HH del período de las personas indicadas.
 *
 * `null` —y no 0— cuando no hay a quién sumarle o cuando la lectura falló: «0,00 HH» afirma que la
 * cuadrilla no trabajó, y eso no es lo mismo que no saberlo.
 */
export async function getHHDeCuadrilla(
  supabase: SupabaseClient,
  personaIds: string[],
  desde: string,
  hasta: string,
): Promise<number | null> {
  if (personaIds.length === 0) return null
  const { data, error } = await supabase
    .from('registros_hh').select('fecha, horas, tipo_hora')
    .in('persona_id', personaIds).gte('fecha', desde).lte('fecha', hasta)
  if (error) return null
  return sumarHHTrabajadas(
    (data ?? []) as { fecha: string | null; horas: number | string | null; tipo_hora: string }[],
    desde, hasta,
  )
}

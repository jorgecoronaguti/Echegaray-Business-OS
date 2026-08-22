// LEER LA BITÁCORA DE UNA ENTIDAD. Sólo lectura, y no por disciplina: `entidad_cambio` NO TIENE
// policy de insert ni grant de insert para `authenticated`. La escriben los triggers `security
// definer` de la migración 5200, que corren como el dueño y no pasan por la RLS. Un registro de
// auditoría que el auditado puede fabricar no es un registro de auditoría.
//
// SE LEE CON LA SESIÓN, NO CON LA CLAVE DE SERVICIO: `entidad_cambio_select` es `es_administracion()`
// y el `grant select to authenticated` está puesto (una policy sin grant no se evalúa siquiera —
// PostgREST devuelve «permission denied» y Next lo muestra como un 404). Leerla con la clave de
// servicio saltearía la RLS que la migración escribió a propósito.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decirCambios, type CambioCrudo, type CambioDicho } from './auditoriaCambios'

export interface Bitacora {
  cambios: CambioDicho[]
  /** Hay más viejos de los que se trajeron. La pantalla ofrece «ver más». */
  hayMas: boolean
  error: string | null
}

/** El primer tramo. La solapa arranca con esto y crece de a tramos iguales. */
export const TRAMO = 50

/**
 * LOS ÚLTIMOS `cuantos` CAMBIOS DE UNA ENTIDAD, CON EL AUTOR RESUELTO A NOMBRE.
 *
 * SE PIDE UNO DE MÁS Y SE DEVUELVE `cuantos`. Es la única forma de saber si hay más sin contar la
 * tabla entera: un `count` exacto sobre una bitácora que sólo crece cuesta cada vez más para
 * contestar una pregunta de sí o no. Si vuelven 51, hay más; se muestran 50.
 *
 * `entidad_id` es TEXT en la base —`obra_canonica.id` es un slug, no un uuid—, así que el id de la
 * persona viaja como texto y el índice `entidad_cambio_por_entidad` lo cubre.
 */
export async function getBitacora(
  sesion: SupabaseClient,
  entidad: string,
  entidadId: string,
  cuantos: number = TRAMO,
): Promise<Bitacora> {
  const { data, error } = await sesion
    .from('entidad_cambio')
    .select('id, campo, antes, despues, autor, en')
    .eq('entidad', entidad)
    .eq('entidad_id', entidadId)
    .order('en', { ascending: false })
    .limit(cuantos + 1)
  // SIN LECTURA NO HAY LISTA — NUNCA UNA VACÍA. «No hubo cambios» y «no pude leer los cambios» son
  // afirmaciones opuestas, y la primera dicha sobre un error de permisos es una mentira tranquila.
  if (error) return { cambios: [], hayMas: false, error: error.message }

  const filas = (data ?? []) as CambioCrudo[]
  const hayMas = filas.length > cuantos
  const visibles = hayMas ? filas.slice(0, cuantos) : filas

  return { cambios: decirCambios(visibles, await nombresDeAutores(sesion, visibles)), hayMas, error: null }
}

/**
 * EL UUID DEL AUTOR NO LE DICE NADA A NADIE. Se resuelve a nombre en DOS saltos y con un solo viaje
 * por tabla: `perfiles.nombre` primero y, cuando el perfil existe sin nombre cargado, el nombre de
 * la persona del plantel a la que está vinculado.
 *
 * Sólo se piden los autores que aparecen en el tramo que se va a dibujar. Traer el padrón entero de
 * perfiles para resolver tres nombres es la consulta que nadie mira hasta que la bitácora crece.
 */
async function nombresDeAutores(
  sesion: SupabaseClient,
  filas: readonly CambioCrudo[],
): Promise<Map<string, string>> {
  const ids = [...new Set(filas.map((f) => f.autor).filter((a): a is string => a !== null))]
  const nombres = new Map<string, string>()
  if (ids.length === 0) return nombres

  const { data: perfiles } = await sesion.from('perfiles').select('id, nombre, persona_id').in('id', ids)
  const sinNombre = (perfiles ?? [])
    .filter((p) => !p.nombre && p.persona_id)
    .map((p) => p.persona_id as string)

  const dePersona = new Map<string, string>()
  if (sinNombre.length > 0) {
    const { data: personas } = await sesion.from('personas').select('id, nombre_completo').in('id', sinNombre)
    for (const p of personas ?? []) dePersona.set(p.id as string, p.nombre_completo as string)
  }

  for (const p of perfiles ?? []) {
    const nombre = (p.nombre as string | null) ?? dePersona.get(p.persona_id as string) ?? null
    // Un perfil sin nombre Y sin persona no se mete en el mapa: `autorDicho` escribe «sin
    // identificar», que es más honesto que un uuid recortado con pinta de nombre.
    if (nombre) nombres.set(p.id as string, nombre)
  }
  return nombres
}

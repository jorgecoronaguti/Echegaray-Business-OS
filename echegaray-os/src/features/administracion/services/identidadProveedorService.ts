// QUIÉN ES EL PROVEEDOR QUE DICE ESTA FILA. LO QUE LA PANTALLA MUESTRA DE LA CAPA DE IDENTIDAD.
//
// ═══ QUÉ DECISIÓN CAMBIA ═══
//
// Una sola, y es concreta: si el gasto que dice «DUPEC» le cuelga o no de «Dubos Ugarte Pedro Luis
// Raul», que es el proveedor al que de verdad se le debe. Mientras esa pregunta no tenga respuesta
// visible, la deuda por proveedor se calcula sobre nombres sueltos y dos textos del mismo proveedor
// son dos acreedores distintos.
//
// ═══ LO QUE NO SE MUESTRA, A PROPÓSITO ═══
//
// Ni el modelo, ni el score, ni el umbral, ni si hubo embeddings. Quien carga una compra no tiene
// que aprender qué es un coseno para decidir si dos nombres son el mismo proveedor: lo único que
// necesita ver es el nombre resuelto, o que no lo hay. El detalle técnico queda en `ml_resolucion`
// y en `orq.ml_traza`, que es donde sirve.
//
// ═══ POR QUÉ SE LEE Y NO SE RESUELVE ACÁ ═══
//
// La resolución la hace el backfill y el cruce de cheques, del lado del servidor, con el padrón
// entero y el modelo cargado. La pantalla LEE la decisión ya tomada. Resolver de nuevo en cada
// render daría una respuesta posiblemente distinta de la que está escrita —y dos respuestas para la
// misma pregunta es exactamente lo que la capa de identidad vino a terminar.

import type { SupabaseClient } from '@supabase/supabase-js'

export type EstadoIdentidad = 'auto_resuelto' | 'sugerido' | 'ambiguo' | 'sin_match' | 'verificado_humano'

export interface IdentidadResuelta {
  /** el texto tal como está escrito en la planilla */
  valorOriginal: string
  cuitOriginal: string | null
  estado: EstadoIdentidad
  /** el proveedor canónico, cuando la decisión autoriza a vincular */
  proveedorId: string | null
  proveedorNombre: string | null
  /** para la cola de revisión: la fila de `ml_resolucion` que una confirmación humana corrige */
  resolucionId: number
}

/** El CUIT en sus once dígitos, o null. La misma regla que `entity-resolution.mjs`. */
function cuit11(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length === 11 ? d : null
}

/** La clave con la que una fila de la planilla encuentra su identidad. El CUIT entra porque el
 *  mismo texto con dos CUIT distintos son dos preguntas distintas. */
export function claveIdentidad(nombre: string | null | undefined, cuit: string | null | undefined): string {
  return `${String(nombre ?? '').trim().toUpperCase()}|${cuit11(cuit) ?? ''}`
}

/** ¿Esta decisión autoriza a mostrar el proveedor como reconocido? Sugerido y ambiguo NO: esperan
 *  a una persona, y presentarlos como resueltos convertiría una duda en un hecho. */
export function estaReconocido(i: IdentidadResuelta | undefined): boolean {
  return !!i && (i.estado === 'auto_resuelto' || i.estado === 'verificado_humano') && !!i.proveedorId
}

/**
 * Las identidades vigentes de los proveedores que aparecen en la lista.
 *
 * Devuelve un Map por `claveIdentidad`. Una fila sin entrada en el Map es una fila cuya identidad
 * nunca se resolvió — que NO es lo mismo que una fila sin match: la primera no se preguntó, la
 * segunda se preguntó y no hubo respuesta. La pantalla las dice distinto.
 */
export async function getIdentidades(
  supabase: SupabaseClient,
  entidad = 'proveedor',
): Promise<{ data: Map<string, IdentidadResuelta>; error: string | null }> {
  const { data, error } = await supabase
    .from('ml_resolucion')
    .select('id, valor_original, cuit_original, estado, entidad_id, entidad_id_correcta, ts')
    .eq('entidad', entidad)
    .order('ts', { ascending: false })
    .limit(5000)
  if (error) return { data: new Map(), error: error.message }

  // La decisión VIGENTE de cada texto es la última escrita. Se recorre de la más nueva a la más
  // vieja y se queda con la primera de cada clave: sin esto, una corrección humana de ayer quedaría
  // tapada por la resolución automática de anteayer.
  const porClave = new Map<string, IdentidadResuelta>()
  const ids = new Set<string>()
  for (const r of data ?? []) {
    const k = claveIdentidad(r.valor_original as string, r.cuit_original as string | null)
    if (porClave.has(k)) continue
    const proveedorId = (r.entidad_id_correcta as string | null) ?? (r.entidad_id as string | null)
    porClave.set(k, {
      valorOriginal: r.valor_original as string,
      cuitOriginal: (r.cuit_original as string | null) ?? null,
      estado: r.estado as EstadoIdentidad,
      proveedorId,
      proveedorNombre: null,
      resolucionId: Number(r.id),
    })
    if (proveedorId) ids.add(proveedorId)
  }

  if (ids.size) {
    const { data: provs } = await supabase.from('proveedores').select('id, nombre').in('id', [...ids])
    const nombres = new Map((provs ?? []).map((p) => [String(p.id), p.nombre as string]))
    for (const i of porClave.values()) {
      if (i.proveedorId) i.proveedorNombre = nombres.get(i.proveedorId) ?? null
    }
  }

  return { data: porClave, error: null }
}

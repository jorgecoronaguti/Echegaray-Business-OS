// LO QUE LA CORRECCIÓN DE UNA AUSENCIA NECESITA LEER DE LA BASE.
//
// Vive aparte de `jornadaPorObraActions.ts` porque ese archivo llegó al techo de 500 líneas del
// repo, y porque son lecturas: la regla de la ausencia es pura y está en `ausenciaDeLaPersona.ts`.
//
// NINGUNA de estas lecturas decide a qué obra se imputa nada. Desde el 08/09/2026 una ausencia se
// registra SIN obra; lo único que se sigue buscando de una obra es cuánto vale la jornada.

import type { createClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * La jornada que se usa para valorizar la ausencia.
 *
 * DATO PENDIENTE, DECLARADO (ver `ausenciaDeLaPersona.ts`): lo correcto sería la jornada legal de la
 * PERSONA según su categoría UOCRA, y ese dato no existe en el OS. La única jornada cargada es la de
 * una OBRA, así que se toma la de donde se la espera ese día —el día ya cargado primero, su
 * asignación vigente después— SÓLO para saber cuánto vale el día. Esa obra no recibe nada.
 */
export async function jornadaDeReferencia(
  supabase: Supabase,
  c: { persona_id: string; fecha: string; obra_destino: string | null },
  conObra: { obra_canonica_id: string | null }[],
): Promise<number | null> {
  const candidatas = [
    ...new Set(conObra.map((f) => f.obra_canonica_id).filter((x): x is string => Boolean(x))),
    ...(c.obra_destino ? [c.obra_destino] : []),
    ...await obrasAsignadasVigentes(supabase, c.persona_id, c.fecha),
  ]
  if (candidatas.length === 0) return null
  const { data, error } = await supabase.from('obra_canonica')
    .select('id, jornada_horas').in('id', candidatas)
  if (error) return null
  const porId = new Map(((data ?? []) as { id: string; jornada_horas: number | null }[])
    .map((o) => [o.id, o.jornada_horas]))
  for (const id of candidatas) {
    const j = Number(porId.get(id))
    if (Number.isFinite(j) && j > 0) return j
  }
  return null
}

/** Los nombres REALES de esas obras, para que el acuse diga de dónde se sacaron las horas. Sin
 *  nombres el acuse igual se escribe: no poder nombrarlas no puede convertirse en no avisar. */
export async function nombresDeObras(
  supabase: Supabase, ids: string[],
): Promise<string[]> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return []
  const { data, error } = await supabase.from('obra_canonica').select('nombre').in('id', unicos)
  if (error) return []
  return ((data ?? []) as { nombre: string | null }[])
    .map((o) => o.nombre).filter((n): n is string => Boolean(n))
}

/**
 * Las obras con asignación VIGENTE de esa persona ese día. Sólo alimenta la jornada de referencia
 * de una ausencia; ya NO decide a qué obra se imputa nada. Una lectura que falla devuelve `[]`.
 */
async function obrasAsignadasVigentes(
  supabase: Supabase,
  personaId: string, fecha: string,
): Promise<string[]> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('obra_id, desde, hasta').eq('persona_id', personaId).order('desde', { ascending: false })
  if (error) return []
  return ((data ?? []) as { obra_id: string; desde: string | null; hasta: string | null }[])
    .filter((a) => (!a.desde || a.desde <= fecha) && (!a.hasta || a.hasta >= fecha))
    .map((a) => a.obra_id)
}


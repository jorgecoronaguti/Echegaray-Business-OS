// LO QUE LA CORRECCIÓN DE UNA AUSENCIA NECESITA LEER DE LA BASE.
//
// Vive aparte de `jornadaPorObraActions.ts` porque ese archivo llegó al techo de 500 líneas del
// repo, y porque son lecturas: la regla de la ausencia es pura y está en `ausenciaDeLaPersona.ts`.
//
// Desde el 08/09/2026 también ESCRIBE: las dos puertas de la ausencia sin obra —el panel de
// corrección y la carga del día— comparten esta escritura, para que no existan dos versiones de
// «una ausencia es de la persona».
//
// NINGUNA de estas lecturas decide a qué obra se imputa nada. Desde el 08/09/2026 una ausencia se
// registra SIN obra; lo único que se sigue buscando de una obra es cuánto vale la jornada.

import type { createClient } from '@/lib/supabase/server'
import { tipoDeMotivo } from './motivoDeAusencia'
import { traducirEscritura } from './planDeJornada'
import type { FilaDelDia, PlanSinObra } from './ausenciaDeLaPersona'

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


// ── LO QUE SE ESCRIBE FUERA DE TODA OBRA ───────────────────────────────────────────────────────
//
// Vive acá y no en `jornadaPorObraActions.ts` por el techo de 500 líneas del repo, y porque las dos
// puertas —el panel de corrección y la carga del día— escriben EXACTAMENTE lo mismo: una fila con
// `obra_canonica_id = null` y `tipo_hora in ('ausencia','licencia')`. Dos copias de esa escritura se
// desincronizarían el día que alguien toque una.

/** El error de una escritura SIN obra, en el idioma de quien carga. `42501` acá NO es «no podés
 *  escribir en esta obra» —no hay obra—: es la policy `marca_ausencia_de`, que sólo deja marcar a
 *  quien esté asignado ese día a una obra que el usuario ve. Decirlo mal manda a buscar el problema
 *  al lado equivocado. */
export function traducirSinObra(error: { code?: string; message: string }): string {
  if (error.code === '42501') {
    return 'No podés marcar la ausencia de esa persona ese día: sólo se puede sobre quien esté '
      + 'asignado a una obra que ves.'
  }
  if (error.code === '23514' && /sin_obra_solo_ausencia/.test(error.message)) {
    return 'Una fila sin obra sólo puede ser una ausencia o una licencia.'
  }
  return traducirEscritura(error)
}

/** Las filas SIN obra que esas personas ya tienen ese día. Es lo único que distingue corregir la
 *  ausencia que ya estaba de escribir una segunda al lado — la clave única no protege acá, porque
 *  en Postgres dos NULL no colisionan. */
export async function filasSinObraDelDia(
  supabase: Supabase, personaIds: readonly string[], fecha: string,
): Promise<{ data: FilaDelDia[]; error: string | null }> {
  if (personaIds.length === 0) return { data: [], error: null }
  const { data, error } = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, notas, obra_canonica_id')
    .is('obra_canonica_id', null).eq('fecha', fecha).in('persona_id', [...personaIds])
    .order('id', { ascending: true })
  // UNA LECTURA QUE FALLA NO PUEDE INVENTAR «no tenía nada»: eso escribiría una segunda ausencia
  // encima de la que ya estaba y el día quedaría contado dos veces.
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as FilaDelDia[], error: null }
}

/**
 * Escribe las filas sin obra del plan y devuelve LO QUE LA BASE HIZO.
 *
 * Va ANTES de cualquier borrado —la misma regla que `escribirPlan`—: PostgREST no da transacciones y
 * un duplicado visible siempre le gana a una pérdida silenciosa.
 */
export async function escribirAusenciasSinObra(
  supabase: Supabase, fecha: string, escribir: PlanSinObra['escribir'],
): Promise<{ insertadas: number; actualizadas: number; error: string | null }> {
  let insertadas = 0
  let actualizadas = 0
  for (const e of escribir) {
    const r = await escribirAusenciaSinObra(
      supabase,
      { persona_id: e.marca.persona_id, fecha, motivo: e.marca.motivo ?? null },
      e.marca.horas, e.id,
    )
    if (r.error) return { insertadas, actualizadas, error: r.error }
    if (r.fila === 'insertada') insertadas += 1
    if (r.fila === 'actualizada') actualizadas += 1
  }
  return { insertadas, actualizadas, error: null }
}

/**
 * Escribe UNA ausencia sin obra. Devuelve lo que la base hizo, no lo que se le pidió: `fila` es
 * `null` cuando el `update` no afectó ninguna —la policy la rechazó sin error, otro la borró—.
 */
export async function escribirAusenciaSinObra(
  supabase: Supabase,
  c: { persona_id: string; fecha: string; motivo: string | null },
  horas: number, idExistente: string | null,
): Promise<{ fila: 'insertada' | 'actualizada' | null; error: string | null }> {
  const tipo = tipoDeMotivo(c.motivo)
  if (idExistente) {
    const { data, error } = await supabase.from('registros_hh')
      .update({ horas, tipo_hora: tipo, notas: c.motivo })
      .eq('id', idExistente).is('obra_canonica_id', null).select('id')
    if (error) return { fila: null, error: traducirSinObra(error) }
    return { fila: (data ?? []).length > 0 ? 'actualizada' : null, error: null }
  }
  const { data, error } = await supabase.from('registros_hh').insert({
    // LA COLUMNA VA EXPLÍCITA EN `null`. Omitirla daría el mismo resultado hoy, pero lo que este
    // insert AFIRMA es que la ausencia no es de ninguna obra — no que se olvidó de decirlo.
    obra_canonica_id: null,
    persona_id: c.persona_id,
    actividad_id: null,
    fecha: c.fecha,
    fecha_inicio_semana: c.fecha,
    horas,
    tipo_hora: tipo,
    notas: c.motivo,
    fuente_legacy: 'web:ausencia-de-la-persona',
  }).select('id')
  if (error) return { fila: null, error: traducirSinObra(error) }
  return { fila: (data ?? []).length > 0 ? 'insertada' : null, error: null }
}

/** Saca las filas sin obra que dejaron de ser ciertas. Después de escribir, nunca antes. */
export async function sacarAusenciasSinObra(
  supabase: Supabase, ids: readonly string[],
): Promise<{ sacadas: number; error: string | null }> {
  if (ids.length === 0) return { sacadas: 0, error: null }
  const { data, error } = await supabase.from('registros_hh')
    .delete().is('obra_canonica_id', null).in('id', [...ids]).select('id')
  if (error) return { sacadas: 0, error: traducirSinObra(error) }
  return { sacadas: (data ?? []).length, error: null }
}

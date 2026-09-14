// ASIGNAR DESDE LA OBRA TAMBIÉN RESPETA LA CRONOLOGÍA DE LA PERSONA.
//
// `asignarPersona` y `asignarCuadrillaAObra` insertaban la fila nueva y nada más: quien estaba en
// Pisos y se sumaba a Quattropani quedaba guardado en las dos, y a qué obra iba su hora dependía del
// desempate al leer. Qué se cierra, qué se reemplaza y qué se recorta lo decide `planDeAsignacion`
// —la misma regla que usan el cambio de obra y la normalización—; acá sólo se escribe.
//
// Sin `next/*` y con la base por parámetro para que un test vea QUÉ se escribió.
import { planDeAsignacion } from '../../../../orquestador/lib/cronologia-asignaciones.mjs'

type Respuesta<T> = { data: T | null; error: { message: string } | null }
type FilaAsignacion = { id: string; obra_id: string; desde: string | null; hasta: string | null }

interface Escritura {
  eq(columna: string, valor: string): Escritura
  select(columnas: string): PromiseLike<Respuesta<{ id: string }[]>>
}

/** Lo único que esto le pide a PostgREST. El cliente real se pasa con un cast, como en `obraActualNucleo`. */
export interface SupabaseAsignacion {
  from(tabla: string): {
    select(columnas: string): { eq(columna: string, valor: string): PromiseLike<Respuesta<FilaAsignacion[]>> }
    update(valores: Record<string, unknown>): Escritura
    delete(): Escritura
    insert(valores: Record<string, unknown>): Escritura
  }
}

export interface TramoNuevo { obra_id: string; desde: string; hasta: string | null }

/**
 * Después de guardar la asignación nueva, las de la persona en OTRAS obras le ceden el lugar.
 * Devuelve `null` si quedó todo escrito, o el texto que tiene que leer quien asignó.
 *
 * VA DESPUÉS DEL ALTA, NO ANTES. Si el alta rebota, la persona sigue donde estaba; si lo que rebota es
 * esto, queda guardada en dos obras y se dice — un duplicado visible le gana a quedar sin obra.
 */
export async function cederOtrasObras(
  supabase: SupabaseAsignacion, personaId: string, nueva: TramoNuevo,
): Promise<string | null> {
  const lectura = await supabase.from('obra_asignacion').select('id, obra_id, desde, hasta').eq('persona_id', personaId)
  if (lectura.error) return `La asignación quedó guardada, pero no pude leer sus otras obras: ${lectura.error.message}.`
  const plan = planDeAsignacion(lectura.data ?? [], nueva)
  const tabla = () => supabase.from('obra_asignacion')
  const pasos: { que: string; escribir: () => Escritura }[] = [
    ...plan.cerrar.map((c) => ({ que: 'cerrar', escribir: () => tabla().update({ hasta: c.hasta }).eq('id', c.id) })),
    // EL TRAMO QUE SEGUÍA DESPUÉS DEL NUEVO VUELVE AL DÍA SIGUIENTE: es el pase de tres días.
    ...plan.cerrar.filter((c) => c.continua).map((c) => ({
      que: 'programar el regreso',
      escribir: () => tabla().insert({ persona_id: personaId, rol: 'integrante', ...c.continua }),
    })),
    ...plan.reemplazar.map((r) => ({ que: 'reemplazar', escribir: () => tabla().delete().eq('id', r.id) })),
    ...plan.recortar.map((r) => ({ que: 'recortar', escribir: () => tabla().update({ desde: r.desde }).eq('id', r.id) })),
  ]
  for (const p of pasos) {
    // `eq('persona_id')` no sobra en las que tocan una fila existente: sin él, un id de otra ficha
    // cerraría la asignación de otro. Y `select('id')` porque la evidencia es del efecto: una policy
    // que rechaza sin error devuelve cero filas.
    const escritura = p.que === 'programar el regreso' ? p.escribir() : p.escribir().eq('persona_id', personaId)
    const { data, error } = await escritura.select('id')
    if (error || (data ?? []).length === 0) {
      return `La asignación quedó guardada, pero no pude ${p.que} la de otra obra`
        + `${error ? `: ${error.message}` : ' (cero filas)'}. La persona figura en dos obras: revisala en su ficha.`
    }
  }
  return null
}

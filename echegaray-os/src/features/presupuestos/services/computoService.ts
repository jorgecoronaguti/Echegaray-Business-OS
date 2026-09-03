// LA ESCRITURA DE LA GENEALOGÍA DESDE LA WEB — un solo ejecutor para los tres caminos.
//
// La DECISIÓN (insertar, actualizar, borrar, apartarse) es pura y vive en el motor:
// `orquestador/lib/cotizador/computo-genealogia.mjs`. Acá está lo único que el motor no puede
// hacer: ejecutarla contra PostgREST con la credencial de quien la pidió, porque `public.computo`
// tiene RLS y su policy mira `ve_economia()`.
//
// ═══ POR QUÉ NO VIVE EN `actionsPartida.ts` ═══
//
// Ese archivo es `'use server'`: todo lo que exporta se convierte en un endpoint invocable desde el
// navegador. Un helper de escritura expuesto así es una puerta que nadie pidió abrir. Y además lo
// necesitan DOS módulos —el formulario y el chat—, que es exactamente el caso en que un helper
// duplicado empieza a divergir: el defecto que este trabajo vino a arreglar es que la misma
// decisión estaba escrita en cero lugares y ejecutada en uno solo.

import type { createClient } from '@/lib/supabase/server'
import { planDeComputoManual } from './cotizadorPuente'

type Cliente = Awaited<ReturnType<typeof createClient>>

/**
 * DEJAR EL CÓMPUTO DE LA PARTIDA DICIENDO LO QUE LA PARTIDA DECLARA.
 *
 * Devuelve `null` si quedó bien y el MOTIVO si no. El motivo no se propaga como error de la acción
 * que la llamó: la cantidad ya se guardó, y hacer fallar una escritura que sí pasó porque su
 * registro de auditoría no pudo hacerse deja al usuario sin la una y sin el otro. Se muestra al
 * lado — que es distinto de tragárselo.
 */
export async function sincronizarComputoDePartida(
  c: Cliente,
  partidaId: string,
  { cantidad, unidad = null, donde }: { cantidad: number | null; unidad?: string | null; donde: string },
): Promise<string | null> {
  const { data: previas, error: eL } = await c.from('computo')
    .select('id, origen, elemento').eq('cotizacion_partida_id', partidaId)
  // SIN PODER LEER NO SE DECIDE. Con una lista vacía, el plan insertaría una línea nueva sobre una
  // partida que puede tener cómputo MEDIDO — el caso que la función pura existe para evitar. Un
  // control que no pudo mirar no dice «no hay».
  if (eL) return `no pude leer el cómputo de la partida (${eL.message}): la cantidad quedó guardada sin su línea de genealogía`

  const plan = planDeComputoManual({
    lineas: (previas ?? []) as { id?: string; origen?: string; elemento?: string }[],
    cantidad, unidad, donde,
  })
  if (plan.accion === 'nada') return null

  if (plan.idsABorrar.length) {
    const { error } = await c.from('computo').delete().in('id', [...plan.idsABorrar])
    if (error) return `no pude limpiar el cómputo anterior: ${error.message}`
  }
  if (plan.accion === 'insertar' && plan.fila) {
    const { error } = await c.from('computo').insert({ ...plan.fila, cotizacion_partida_id: partidaId })
    if (error) return `la cantidad quedó guardada pero sin su línea de cómputo: ${error.message}`
  }
  if (plan.accion === 'actualizar' && plan.fila && plan.id) {
    const { error } = await c.from('computo')
      .update({ cantidad: plan.fila.cantidad, unidad: plan.fila.unidad, criterio: plan.fila.criterio })
      .eq('id', plan.id)
    if (error) return `la cantidad quedó guardada pero su línea de cómputo sigue diciendo el número viejo: ${error.message}`
  }
  return null
}

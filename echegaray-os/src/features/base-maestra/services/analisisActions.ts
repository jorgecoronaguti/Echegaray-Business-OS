'use server'

// BASE MAESTRA · EDITAR UN ANÁLISIS = CREAR UNA VERSIÓN, NUNCA PISAR LA VIGENTE.
//
// ═══ POR QUÉ NO SE EDITA EN EL LUGAR ═══
//
// Un análisis vigente ya está cotizado en presupuestos abiertos y ya está colgado de actividades de
// obra en ejecución (`obra_actividad.analisis_id`). Cambiarle una cantidad en el lugar reescribiría
// hacia atrás el costo de obras que ya se vendieron: el presupuesto que se firmó con 17 horas de
// oficial pasaría a decir que se firmó con 19, y nadie podría reconstruir cuál de los dos se cotizó.
// La versión nueva deja lo viejo intacto y colgado de donde ya estaba.
//
// ═══ EL ORDEN DE LOS PASOS ES LA GARANTÍA, PORQUE NO HAY TRANSACCIÓN ═══
//
// PostgREST no da transacciones de varias sentencias, y `analisis_uno_vigente` es un índice único
// parcial: NO PUEDEN CONVIVIR DOS VIGENTES. Así que el orden importa y es éste:
//
//   1. Insertar la versión nueva con `vigente = false`   ← no puede chocar con el índice
//   2. Copiar TODAS las líneas a la versión nueva        ← si falla, se borra y no pasó nada
//   3. Bajar la vieja (`vigente = false`)
//   4. Subir la nueva (`vigente = true`)
//
// Entre 3 y 4 hay una ventana sin ninguna vigente. Es el estado seguro: la tarea se ve «Sin
// análisis» —visible y falso por defecto, no invisible y falso—, y si el paso 4 falla se vuelve a
// subir la vieja. El estado que NO puede pasar es dos vigentes, y el índice lo impide.
//
// LO CORRECTO SERÍA UNA FUNCIÓN EN POSTGRES con esto adentro de una transacción. Está declarado
// como deuda en el informe; no se agrega acá porque el modelo está cerrado para esta tarea.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; analisisId: string; version: number } | { ok: false; error: string }

const RUTA = '/administracion/base-maestra/tareas'

/**
 * La cantidad de una línea. `nonnegative` y no `positive`: cero es una cantidad válida —desactiva
 * la línea sin borrarla— y el CHECK de la base dice lo mismo (`cantidad >= 0`).
 */
const esquema = z.object({
  lineaId: z.string().uuid('Línea inválida'),
  cantidad: z.coerce
    .number({ message: 'La cantidad tiene que ser un número' })
    .nonnegative('La cantidad no puede ser negativa')
    .finite('La cantidad tiene que ser un número'),
  motivo: z.string().trim().max(300).optional(),
})

/**
 * Cambia UNA cantidad de la composición creando una versión nueva del análisis.
 *
 * Se liga con `.bind(null, tareaTipoId, analisisId)` desde el servidor, así que la pantalla nunca
 * manda qué análisis tocar por el formulario: mandar el id por `FormData` dejaría que cualquiera
 * versione el análisis de otra tarea.
 */
export async function versionarCantidad(
  tareaTipoId: string,
  analisisId: string,
  form: FormData,
): Promise<Resultado> {
  const parsed = esquema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { lineaId, cantidad, motivo } = parsed.data

  const supabase = await createClient()

  // La versión que se está editando tiene que ser LA VIGENTE. Versionar sobre una histórica
  // resucitaría un análisis que alguien ya había reemplazado.
  const { data: base, error: eBase } = await supabase
    .from('analisis').select('id, tarea_tipo_id, version, vigente')
    .eq('id', analisisId).maybeSingle()
  if (eBase) return { ok: false, error: eBase.message }
  if (!base) return { ok: false, error: 'Ese análisis no existe' }
  if (base.tarea_tipo_id !== tareaTipoId) return { ok: false, error: 'Ese análisis no es de esta tarea tipo' }
  if (base.vigente !== true) return { ok: false, error: 'Sólo se versiona sobre el análisis vigente' }

  const { data: lineas, error: eLineas } = await supabase
    .from('analisis_linea').select('id, recurso_id, cantidad, orden, nota').eq('analisis_id', analisisId)
  if (eLineas) return { ok: false, error: eLineas.message }
  if (!(lineas ?? []).some((l) => l.id === lineaId)) {
    return { ok: false, error: 'Esa línea no pertenece al análisis vigente' }
  }

  // La versión siguiente sale del MÁXIMO histórico, no de `vigente.version + 1`: si alguna vez se
  // volvió atrás a una versión anterior, sumarle uno chocaría con `analisis_version_unica`.
  const { data: ultima, error: eUltima } = await supabase
    .from('analisis').select('version').eq('tarea_tipo_id', tareaTipoId)
    .order('version', { ascending: false }).limit(1).maybeSingle()
  if (eUltima) return { ok: false, error: eUltima.message }
  const version = Number(ultima?.version ?? Number(base.version)) + 1

  // ── 1 · la versión nueva nace APAGADA ───────────────────────────────────────────────────────
  const { data: nueva, error: eNueva } = await supabase
    .from('analisis')
    .insert({
      tarea_tipo_id: tareaTipoId,
      version,
      vigente: false,
      motivo: motivo?.trim() || `Cantidad ajustada sobre la versión ${base.version}`,
    })
    .select('id, version').single()
  if (eNueva) return { ok: false, error: eNueva.message }
  const nuevaId = String(nueva.id)

  // ── 2 · se copia la composición entera, con el cambio aplicado ───────────────────────────────
  const copia = (lineas ?? []).map((l) => ({
    analisis_id: nuevaId,
    recurso_id: l.recurso_id,
    cantidad: l.id === lineaId ? cantidad : l.cantidad,
    orden: l.orden,
    nota: l.nota,
  }))
  if (copia.length) {
    const { error: eCopia } = await supabase.from('analisis_linea').insert(copia)
    if (eCopia) {
      // Nada quedó publicado: la versión nueva sigue apagada. Se limpia para no dejar una versión
      // huérfana y vacía en el historial, que se leería como «alguien versionó y borró todo».
      await supabase.from('analisis').delete().eq('id', nuevaId)
      return { ok: false, error: eCopia.message }
    }
  }

  // ── 3 · baja la vieja ───────────────────────────────────────────────────────────────────────
  const { error: eBaja } = await supabase.from('analisis').update({ vigente: false }).eq('id', analisisId)
  if (eBaja) {
    await supabase.from('analisis_linea').delete().eq('analisis_id', nuevaId)
    await supabase.from('analisis').delete().eq('id', nuevaId)
    return { ok: false, error: eBaja.message }
  }

  // ── 4 · sube la nueva ───────────────────────────────────────────────────────────────────────
  const { error: eAlta } = await supabase.from('analisis').update({ vigente: true }).eq('id', nuevaId)
  if (eAlta) {
    // Se vuelve a subir la vieja: quedarse sin ninguna vigente dejaría la tarea sin análisis y sin
    // HH en todo lo que la consuma. El error que se devuelve es el REAL, no uno amable.
    await supabase.from('analisis').update({ vigente: true }).eq('id', analisisId)
    return { ok: false, error: `No pude publicar la versión nueva: ${eAlta.message}` }
  }

  revalidatePath(RUTA)
  return { ok: true, analisisId: nuevaId, version: Number(nueva.version) }
}

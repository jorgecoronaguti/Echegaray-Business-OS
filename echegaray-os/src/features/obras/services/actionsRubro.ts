'use server'

// EL RUBRO SE GESTIONA — crear, renombrar, ordenar, archivar y mover actividades.
//
// NINGUNA DE ESTAS CINCO CREA UNA ENTIDAD NUEVA. El rubro ya es una fila `tipo = 'resumen'` y la
// `seccion` de sus hijas (ver `services/rubros.ts`): acá se escriben esas dos columnas y nada más.
//
// ═══ EL NOMBRE ES LA CLAVE, Y POR ESO RENOMBRAR TOCA A LAS HIJAS ═══
//
// El vínculo entre una actividad y su rubro es TEXTO: `seccion`. Renombrar sólo la cabecera dejaría
// a las hijas colgando del nombre viejo y el cronograma mostraría dos grupos donde había uno. Las
// dos escrituras van juntas o el rubro se parte al medio.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import { normalizarRubro, rubroQueChoca } from './rubros'

const nombreSchema = z.object({
  nombre: z.string().trim().min(2, 'Poné el nombre del rubro').max(120),
})

/** Los rubros que hoy existen en la obra, tal como los ve el cronograma: el nombre de cada fila de
 *  resumen y cada `seccion` cargada. Una sola consulta y una sola regla. */
async function rubrosVigentes(
  supabase: Awaited<ReturnType<typeof createClient>>, obraId: string,
): Promise<{ nombres: string[]; ordenMax: number }> {
  const { data } = await supabase.from('obra_actividad')
    .select('nombre, seccion, tipo, orden, archivada').eq('obra_id', obraId)
  const filas = (data ?? []) as { nombre: string; seccion: string | null; tipo: string; orden: number; archivada: boolean }[]
  const nombres = new Set<string>()
  let ordenMax = 0
  for (const f of filas) {
    ordenMax = Math.max(ordenMax, f.orden ?? 0)
    if (f.archivada) continue
    if (f.tipo === 'resumen') nombres.add(f.nombre)
    else if (f.seccion?.trim()) nombres.add(f.seccion.trim())
  }
  return { nombres: [...nombres], ordenMax }
}

/**
 * CREAR UN RUBRO. Es una fila de resumen vacía, que es exactamente lo que trae el tracker.
 *
 * Rechaza el duplicado accidental —«Mampostería» contra «MAMPOSTERIA»— nombrando el que ya existe.
 * No lo fusiona solo: puede que la persona quiera de verdad un segundo «Hormigonado» (el tracker
 * tiene seis), y adivinar cuál de los dos casos es sería inventar.
 */
export async function crearRubro(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = nombreSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const nombre = parsed.data.nombre

  const supabase = await createClient()
  const { nombres, ordenMax } = await rubrosVigentes(supabase, obraId)
  const choque = rubroQueChoca(nombre, nombres)
  if (choque) return { ok: false, error: `Esta obra ya tiene el rubro «${choque}».` }

  const { error } = await supabase.from('obra_actividad').insert({
    obra_id: obraId,
    clave: `rubro/${normalizarRubro(nombre).slice(0, 100)}`,
    nombre,
    tipo: 'resumen',
    // Al final del cronograma. Reordenar es otra acción, y se hace mirando la lista.
    orden: ordenMax + 1,
    estado: 'pendiente',
    fuente: 'web',
    creada_en_web: true,
    editado_a_mano: true,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Esta obra ya tiene un rubro con ese nombre.' }
    return { ok: false, error: error.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Rubro «${nombre}» creado.` }
}

/** RENOMBRAR. La cabecera y la `seccion` de todas sus hijas, en la misma operación. */
export async function renombrarRubro(obraId: string, anterior: string, form: FormData): Promise<Resultado> {
  const parsed = nombreSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const nombre = parsed.data.nombre
  if (normalizarRubro(nombre) === normalizarRubro(anterior) && nombre === anterior) return { ok: true }

  const supabase = await createClient()
  const { nombres } = await rubrosVigentes(supabase, obraId)
  const otros = nombres.filter((n) => normalizarRubro(n) !== normalizarRubro(anterior))
  const choque = rubroQueChoca(nombre, otros)
  if (choque) return { ok: false, error: `Esta obra ya tiene el rubro «${choque}».` }

  const { error: e1 } = await supabase.from('obra_actividad')
    .update({ nombre, editado_a_mano: true })
    .eq('obra_id', obraId).eq('tipo', 'resumen').eq('nombre', anterior)
  if (e1) return { ok: false, error: e1.message }

  // LAS HIJAS VAN SÍ O SÍ. Si esto falla después de renombrar la cabecera, el rubro queda partido —
  // por eso se dice, en vez de devolver un ok que taparía un cronograma con dos grupos.
  // `editado_a_mano` TAMBIÉN EN LAS HIJAS, y no es un detalle. `sync-obra-cronograma` se saltea
  // sólo las filas marcadas: sin esto, la próxima corrida del tracker devolvería la `seccion` vieja
  // y el rubro se partiría en dos sin que nadie tocara nada.
  const { error: e2 } = await supabase.from('obra_actividad')
    .update({ seccion: nombre, editado_a_mano: true }).eq('obra_id', obraId).eq('seccion', anterior)
  if (e2) return { ok: false, error: `La cabecera se renombró pero sus actividades no: ${e2.message}` }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Rubro renombrado a «${nombre}».` }
}

/**
 * MOVER EL RUBRO ARRIBA O ABAJO. Cambia el `orden` de la cabecera y el de todas sus hijas.
 *
 * El cronograma se dibuja por `orden`, así que mover sólo la cabecera la dejaría lejos de su propio
 * trabajo. Se recalcula el bloque entero: es la única manera de que el grupo viaje completo.
 */
export async function moverRubro(obraId: string, nombre: string, direccion: 'arriba' | 'abajo'): Promise<Resultado> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('obra_actividad')
    .select('id, nombre, seccion, tipo, orden, archivada')
    .eq('obra_id', obraId).order('orden', { ascending: true })
  if (error) return { ok: false, error: error.message }

  const filas = (data ?? []) as { id: string; nombre: string; seccion: string | null; tipo: string; orden: number; archivada: boolean }[]
  const clave = normalizarRubro(nombre)

  // Los bloques del cronograma, en orden, tal como los ve `agruparActividades`.
  const bloques: { clave: string; filas: typeof filas }[] = []
  for (const f of filas) {
    if (f.archivada) continue
    const k = normalizarRubro(f.tipo === 'resumen' ? f.nombre : (f.seccion ?? ' sin-grupo'))
    const ultimo = bloques.find((b) => b.clave === k)
    if (ultimo) ultimo.filas.push(f)
    else bloques.push({ clave: k, filas: [f] })
  }
  const i = bloques.findIndex((b) => b.clave === clave)
  if (i < 0) return { ok: false, error: 'Ese rubro no está en esta obra.' }
  const j = direccion === 'arriba' ? i - 1 : i + 1
  if (j < 0 || j >= bloques.length) return { ok: true, mensaje: 'Ya está en la punta.' }

  const reordenados = [...bloques]
  reordenados[i] = bloques[j]; reordenados[j] = bloques[i]

  // Se reescribe SÓLO lo que cambió de número: los dos bloques que se cruzaron.
  let n = 0
  const cambios: { id: string; orden: number }[] = []
  for (const b of reordenados) {
    for (const f of b.filas) {
      n++
      if (f.orden !== n) cambios.push({ id: f.id, orden: n })
    }
  }
  // EL ORDEN TAMBIÉN SE PROTEGE DEL TRACKER. `sync-obra-cronograma` reescribe `orden` desde la
  // planilla en toda fila que no esté marcada: sin esto, subir un rubro duraría hasta la próxima
  // corrida y nadie entendería por qué «no se guardó».
  for (const c of cambios) {
    const { error: e } = await supabase.from('obra_actividad')
      .update({ orden: c.orden, editado_a_mano: true }).eq('id', c.id).eq('obra_id', obraId)
    if (e) return { ok: false, error: e.message }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `«${nombre}» ${direccion === 'arriba' ? 'subió' : 'bajó'}.` }
}

/**
 * ARCHIVAR UN RUBRO — la cabecera Y su trabajo. Archivar sólo el rótulo dejaría las actividades
 * sueltas en «Sin sección», que es peor que no haber archivado nada.
 *
 * No borra: archivar saca del cronograma y de los promedios, y la historia queda.
 */
export async function archivarRubro(obraId: string, nombre: string, archivar: boolean): Promise<Resultado> {
  const supabase = await createClient()
  // `editado_a_mano` va junto con el archivado por la misma razón que en el renombrado: el
  // sincronizador del tracker sólo respeta las filas marcadas, y sin esto un rubro archivado
  // reaparecería en el cronograma en la próxima corrida.
  const { error: e1 } = await supabase.from('obra_actividad')
    .update({ archivada: archivar, editado_a_mano: true })
    .eq('obra_id', obraId).eq('tipo', 'resumen').eq('nombre', nombre)
  if (e1) return { ok: false, error: e1.message }
  const { error: e2 } = await supabase.from('obra_actividad')
    .update({ archivada: archivar, editado_a_mano: true }).eq('obra_id', obraId).eq('seccion', nombre)
  if (e2) return { ok: false, error: e2.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: archivar ? `Rubro «${nombre}» archivado.` : `Rubro «${nombre}» restaurado.` }
}

/**
 * MOVER UNA ACTIVIDAD A OTRO RUBRO. Es escribir su `seccion`, y nada más.
 *
 * `clave` NO se recalcula aunque la incluya: es la identidad de la fila contra el sincronizador de
 * Drive, y cambiarla haría que la próxima corrida la viera como una actividad nueva y la duplicara.
 */
export async function moverActividadDeRubro(
  obraId: string, actividadId: string, rubro: string,
): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    .update({ seccion: rubro || null, editado_a_mano: true })
    .eq('id', actividadId).eq('obra_id', obraId).is('actividad_padre_id', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: rubro ? `Movida a «${rubro}».` : 'Sacada del rubro.' }
}

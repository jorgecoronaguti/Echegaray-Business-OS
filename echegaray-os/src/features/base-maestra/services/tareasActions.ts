'use server'

// BASE MAESTRA · EL ALTA Y LA BAJA DE UNA TAREA TIPO.
//
// ═══ POR QUÉ EXISTEN ═══
//
// `17 · Base Maestra Tareas.dc.html` dibuja «+ Nueva tarea» en la barra y no había ninguna manera
// de crear una: las 223 tareas entraron por importación de la Planilla para Cotizar y desde la web
// sólo se podía mirarlas. El dueño, textual: *"necesito hacer cosas por app y no puedo porque no
// sirve nada"*. Ésta es una de esas cosas.
//
// ═══ UNA TAREA TIPO NO SE BORRA ═══
//
// `analisis`, `obra_actividad` y las cascadas de presupuesto cuelgan de ella. Un DELETE arrastraría
// el análisis en cascada (`on delete cascade`) y dejaría huérfano el costo de obras ya vendidas. Lo
// que hay es `activo`: la tarea sale de la base viva y su historia queda entera. Es la misma
// decisión que ya tomó `archivarCuadrilla`.
//
// ═══ EL PORTERO ES LA BASE ═══
//
// `tarea_tipo_escribe` exige `es_administracion()`, con su GRANT. Acá no se re-implementa el
// permiso: si un jefe de obra manda el formulario, la base lo rechaza y el mensaje se ve en el
// panel. Comprobarlo también en el código daría dos definiciones de quién puede, y la que se
// desincroniza es siempre la de arriba.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type Resultado = { ok: true; id?: string; mensaje?: string } | { ok: false; error: string }

const RUTA = '/administracion/base-maestra/tareas'

/**
 * EL CÓDIGO ES LA IDENTIDAD, y por eso se normaliza antes de guardarse.
 *
 * `tarea_tipo_codigo_unico` es un índice sensible a mayúsculas: «t1050» y «T1050» conviven, y son
 * la misma tarea escrita dos veces. Se guarda en mayúsculas y sin espacios internos para que el
 * choque lo detecte la base en vez de la lista dentro de tres meses.
 */
const esquema = z.object({
  codigo: z.string().trim().min(1, 'La tarea necesita un código').max(40),
  nombre: z.string().trim().min(1, 'La tarea necesita un nombre').max(200),
  // La unidad no es un texto libre en el negocio —m², m³, un, kg, ml— pero tampoco hay una tabla de
  // unidades: se acota el largo y se deja el vocabulario abierto, que es lo que hace la base.
  unidad: z.string().trim().min(1, 'Falta la unidad (m², m³, un…)').max(20),
  division: z.string().trim().max(120).optional(),
  descripcion: z.string().trim().max(1000).optional(),
})

const vacioEsNulo = (v: string | undefined) => (v && v.trim() ? v.trim() : null)

export async function crearTareaTipo(form: FormData): Promise<Resultado> {
  const parsed = esquema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.from('tarea_tipo')
    .insert({
      codigo: d.codigo.toUpperCase().replace(/\s+/g, ''),
      nombre: d.nombre,
      unidad: d.unidad,
      division: vacioEsNulo(d.division),
      descripcion: vacioEsNulo(d.descripcion),
      // De dónde salió. Las importadas dicen su planilla; las que se cargan a mano lo dicen también,
      // porque el día que se compare la base con la Planilla para Cotizar hay que saber cuáles no
      // están ahí.
      origen: 'web',
    })
    .select('id').single()

  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? `Ya existe una tarea tipo con el código ${d.codigo.toUpperCase()}.`
        : error.message,
    }
  }
  revalidatePath(RUTA)
  // SIN ANÁLISIS TODAVÍA, y la lista lo va a decir: la tarea nace «Sin análisis», que es cierto y
  // es la única fila sobre la que hay algo concreto que hacer después de crearla.
  return { ok: true, id: data.id as string, mensaje: 'Creada. Falta cargarle el análisis.' }
}

/**
 * EDITAR LA TAREA NO ES EDITAR SU ANÁLISIS, y por eso son dos acciones distintas.
 *
 * Acá se cambia QUÉ ES la tarea —código, nombre, unidad, rubro, descripción—. La composición
 * (cuántas horas de oficial, cuánto hormigón) se versiona: pisarla borraría hacia atrás el costo de
 * obras ya vendidas, y ese cuidado vive en `analisisActions`, con su propia razón escrita.
 *
 * LA UNIDAD SÍ SE PUEDE CAMBIAR, y es la edición peligrosa: `hs_unitarias` son horas POR unidad, así
 * que pasar de m² a m³ deja el mismo número significando otra cosa. No se bloquea —hay tareas
 * importadas con la unidad mal escrita y arreglarlas es justamente para lo que existe esto— pero el
 * panel lo advierte antes de guardar.
 */
export async function editarTareaTipo(tareaId: string, form: FormData): Promise<Resultado> {
  const id = z.string().uuid().safeParse(tareaId)
  if (!id.success) return { ok: false, error: 'Tarea inválida' }
  const parsed = esquema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.from('tarea_tipo')
    .update({
      codigo: d.codigo.toUpperCase().replace(/\s+/g, ''),
      nombre: d.nombre,
      unidad: d.unidad,
      division: vacioEsNulo(d.division),
      descripcion: vacioEsNulo(d.descripcion),
    })
    .eq('id', id.data)

  if (error) {
    return {
      ok: false,
      error: error.code === '23505'
        ? `Ya existe otra tarea tipo con el código ${d.codigo.toUpperCase()}.`
        : error.message,
    }
  }
  revalidatePath(RUTA)
  return { ok: true }
}

/** Saca la tarea de la base viva sin tocar su historia. Reversible con `reactivarTareaTipo`. */
export async function archivarTareaTipo(tareaId: string): Promise<Resultado> {
  const id = z.string().uuid().safeParse(tareaId)
  if (!id.success) return { ok: false, error: 'Tarea inválida' }

  const supabase = await createClient()
  const { error } = await supabase.from('tarea_tipo').update({ activo: false }).eq('id', id.data)
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Archivada. Su análisis y sus usos quedan intactos.' }
}

export async function reactivarTareaTipo(tareaId: string): Promise<Resultado> {
  const id = z.string().uuid().safeParse(tareaId)
  if (!id.success) return { ok: false, error: 'Tarea inválida' }

  const supabase = await createClient()
  const { error } = await supabase.from('tarea_tipo').update({ activo: true }).eq('id', id.data)
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  return { ok: true }
}

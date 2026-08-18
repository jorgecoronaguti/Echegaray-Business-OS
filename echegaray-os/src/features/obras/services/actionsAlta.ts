'use server'

// EL ALTA DE OBRA EN PASOS — las acciones que ESCRIBEN.
//
// ═══ LA REGLA QUE GOBIERNA ESTE ARCHIVO ═══
//
// NADA SE RELLENA SOLO. Ni un jefe de obra por defecto, ni una fecha de inicio «hoy», ni un monto en
// cero, ni una etapa que no eligió nadie. Lo único que esta puerta escribe sin que el dueño lo
// tipee es `etapa='previo'` —que es literalmente «esta obra todavía no arrancó»— y `tipo='obra'`.
// Un dato inventado en el alta se convierte después en un desvío calculado contra una ficción.
//
// ═══ QUIÉN PUEDE ═══
//
// Sólo Administración (y Dirección) crean obras, y quien lo decide es la base:
// `obra_canonica_write` exige `current_rol() in ('direccion','administracion')` para INSERT y
// UPDATE. La pantalla también lo chequea, pero eso es la puerta — el RLS es la cerradura, y es lo
// único que también vale para una llamada directa a PostgREST.
//
// ═══ POR QUÉ CADA PASO REDIRIGE ═══
//
// El paso guarda y la navegación al siguiente la hace el servidor, no un link que el usuario tiene
// que acordarse de tocar. Sin eso, «Guardar» y «Siguiente» son dos botones y el que se apura pierde
// lo que tipeó. El `redirect` va DESPUÉS de la escritura y fuera de todo `try`: si la base rechaza,
// la acción devuelve el error y la pantalla lo muestra sobre el formulario intacto.

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import {
  altaSchema, columnasDelPaso, ESQUEMA_PASO, idDeObra, pasoSiguiente, urlPaso,
  type PasoQueGuarda,
} from './alta'

/**
 * CREA EL BORRADOR con lo mínimo: nombre y cliente. La obra existe desde acá, así que irse a la
 * mitad del alta no pierde nada — se vuelve por `/obras/nueva?obra=<id>` o por la ficha de la obra.
 */
export async function crearBorradorObra(form: FormData): Promise<Resultado> {
  const parsed = altaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const id = idDeObra(d.nombre)
  if (!id) return { ok: false, error: 'Ese nombre no deja un identificador utilizable. Usá letras o números.' }
  const { data: existe } = await supabase.from('obra_canonica').select('id').eq('id', id).maybeSingle()
  if (existe) return { ok: false, error: `Ya existe una obra con el identificador "${id}"` }

  // `cliente_texto` conserva lo que decía el cliente AL CREAR: es procedencia, no la fuente. El que
  // manda es `cliente_id`, y por eso se copia y no se usa para nada más.
  const { data: cli } = await supabase.from('clientes').select('nombre').eq('id', d.cliente_id).maybeSingle()
  const { error } = await supabase.from('obra_canonica').insert({
    id,
    nombre: d.nombre,
    cliente_id: d.cliente_id,
    cliente_texto: (cli?.nombre as string) ?? null,
    estado: 'activa',
    tipo: 'obra',
    // EL BORRADOR ES ESTO: la obra existe, está en la primera etapa, y su checklist dice qué falta.
    etapa: 'previo',
    ubicacion: d.ubicacion || null,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/obras'); revalidatePath('/clientes', 'layout')
  redirect(urlPaso(id, 'responsable'))
}

/**
 * GUARDA UN PASO Y AVANZA. `paso` viaja atado por `bind` desde la pantalla, igual que `obraId`: si
 * fuera un campo del formulario, cualquiera podría cambiar desde el navegador qué columnas se
 * escriben.
 */
export async function guardarPasoObra(
  obraId: string, paso: PasoQueGuarda, form: FormData,
): Promise<Resultado> {
  const parsed = ESQUEMA_PASO[paso].safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('obra_canonica')
    .update(columnasDelPaso(paso, parsed.data as Record<string, unknown>))
    .eq('id', obraId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/obras/${obraId}`); revalidatePath('/obras')
  const siguiente = pasoSiguiente(paso)
  if (siguiente) redirect(urlPaso(obraId, siguiente))
  return { ok: true }
}

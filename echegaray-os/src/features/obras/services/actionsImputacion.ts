'use server'

// RESOLVER UNA IMPUTACIÓN AMBIGUA — la decide una persona, nunca el sistema.
//
// El dueño: *"Si es ambigua: PENDIENTE DE ASIGNACIÓN. Administración debe poder resolverla desde la
// web. **No inventar imputaciones.**"*
//
// El diccionario es `obra_alias` y es UNO SOLO: el mismo que usa `obra_costo_real`, el mismo que usa
// la solapa Operación de la obra. Resolver un texto es agregar UNA fila, y esa fila arregla todas
// las filas que dicen lo mismo — las de hoy y las que entren mañana.
//
// `obra_id` NULL NO es "no sé": es *"esto no es una obra"*. Administración, Taller, F931, UOCRA son
// costos de estructura y están declarados así. Por eso el formulario obliga a elegir una de las dos
// respuestas: una obra concreta, o "no es una obra". Dejar la ambigüedad sin resolver también es una
// opción válida — se cierra la pantalla y listo—, pero no se puede guardar a medias.
//
// EL EFECTO ES ECONÓMICO. Mapear un texto a una obra le mueve el costo real a esa obra, y de ahí sale
// su desvío y su margen. Por eso escribe sólo Administración (policy `obra_alias_insert`), y por eso
// no hay ni un solo emparejamiento automático por parecido de nombre: "Estrella Norte" no es
// "La Estrella", y un algoritmo que lo decida por su cuenta fabrica plata en la obra equivocada.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'

const schema = z.object({
  clave: z.string().trim().min(1, 'Falta el texto a resolver'),
  ejemplo: z.string().trim().optional(),
  // `''` es la respuesta "no es una obra", y es una respuesta, no un vacío.
  obra_id: z.string().trim(),
  clasificacion: z.enum(['obra', 'mantenimiento', 'indirecto', 'excluido']),
})

export async function resolverImputacion(form: FormData): Promise<Resultado> {
  const parsed = schema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  // COHERENCIA ENTRE LAS DOS RESPUESTAS. Un alias clasificado como `obra` sin obra destino no
  // resuelve nada —seguiría contando como pendiente—, y una obra destino clasificada como
  // `indirecto` sacaría el costo de la obra que se acaba de elegir. La base no lo impide: acá sí.
  const esObra = d.clasificacion === 'obra' || d.clasificacion === 'mantenimiento'
  if (esObra && !d.obra_id) return { ok: false, error: 'Elegí a qué obra corresponde.' }
  if (!esObra && d.obra_id) return { ok: false, error: 'Si no es una obra, no puede apuntar a una.' }

  const supabase = await createClient()
  const { error } = await supabase.from('obra_alias').upsert({
    alias: d.clave,
    obra_id: d.obra_id || null,
    clasificacion: d.clasificacion,
    ejemplo_raw: d.ejemplo || null,
  }, { onConflict: 'alias' })

  if (error) {
    return {
      ok: false,
      // `42501` es la negativa de la base cuando quien pide no es Administración. Se traduce: "new
      // row violates row-level security policy" no le dice nada a nadie.
      error: error.code === '42501'
        ? 'Sólo Administración puede resolver imputaciones.'
        : error.message,
    }
  }
  revalidatePath('/administracion/pendientes')
  revalidatePath('/obras')
  return { ok: true }
}

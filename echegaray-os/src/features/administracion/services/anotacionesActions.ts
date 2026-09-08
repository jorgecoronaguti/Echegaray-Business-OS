'use server'

// ANOTAR EN LA FICHA DE UNA PERSONA — la única escritura del bloque.
//
// ═══ POR QUÉ VUELVE A PREGUNTAR QUIÉN LLAMA ═══
//
// La pantalla no dibuja el formulario para el rol `campo`. Eso NO alcanza: una acción de servidor
// es un endpoint y se invoca sin abrir jamás la pantalla —basta el id de la acción, que viaja en el
// HTML—. Por eso el rol se pregunta acá contra la cookie, igual que hacen `usuariosActions`. La RLS
// es la tercera cerradura y la que vale: sin `es_administracion()` la fila no entra ni con esta
// función parcheada.
//
// ═══ POR QUÉ SE USA `.select()` ═══
//
// Un `insert` sin `select` devuelve 204 y eso NO prueba que se escribió: lo prueba la fila leída de
// vuelta (trampa ya pagada: «PostgREST: 204 no prueba escritura»). Se pide el id y la fecha, y sólo
// entonces la pantalla dice «Anotado».
//
// ═══ LO QUE NO EXISTE ACÁ, Y ES A PROPÓSITO ═══
//
// No hay `editarAnotacion` ni `borrarAnotacion`. Decisión del dueño: la anotación queda; si hay que
// corregir, se agrega otra. La base tampoco tiene policy de update ni delete, así que escribirlas
// sería escribir código muerto que un día alguien "arregla" abriendo la policy.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { faltaLaTablaDeNotas } from '@/features/clientes/services/notaPendiente'
import { LARGO_MAXIMO, puedeAnotar, validarTextoAnotacion } from './anotacionesPersona'
import { mensajeDeAnotacionesPendiente } from './anotacionesService'
import type { Resultado } from './personasActions'

// El id de la persona NO viene del formulario aunque llegue atado por `bind`: se valida igual. Un
// uuid inválido produciría el error crudo de Postgres en la pantalla, que ya costó media jornada.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const anotacionSchema = z.object({
  texto: z.string().max(LARGO_MAXIMO),
})

export async function crearAnotacion(personaId: string, form: FormData): Promise<Resultado> {
  if (!UUID.test(personaId)) return { ok: false, error: 'No sé de qué persona es esta anotación.' }

  const parsed = anotacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  // La regla del texto vive en el módulo puro, que es donde está probada: el schema sólo garantiza
  // que llegó una cadena. Zod recorta el borde; el `check` de la base es el cierre.
  const texto = validarTextoAnotacion(parsed.data.texto)
  if (!texto.ok) return { ok: false, error: texto.error }

  const supabase = await createClient()
  const { data: perfil, error: errPerfil } = await getPerfilActual(supabase)
  // FALLA CERRADO. Sin perfil legible no se sabe quién es, y el modo de fallar de un default
  // permisivo es dejar que cualquiera escriba en el legajo de un empleado.
  if (errPerfil) return { ok: false, error: 'No pude verificar tu permiso. No guardé nada.' }
  if (!puedeAnotar(perfil?.rol)) {
    return { ok: false, error: 'No tenés permiso para anotar en la ficha de una persona.' }
  }

  // `creado_por` NO se manda: lo pone el DEFAULT `auth.uid()` de la base, que es lo que hace que la
  // firma no sea falsificable. `authenticated` ni siquiera tiene grant de insert sobre esa columna.
  const { data, error } = await supabase
    .from('persona_nota')
    .insert({ persona_id: personaId, texto: texto.texto })
    .select('id, creado_en')
    .single()

  if (error) {
    // La migración todavía no está aplicada: se dice, y se dice que NO se guardó nada.
    if (faltaLaTablaDeNotas(error)) return { ok: false, error: mensajeDeAnotacionesPendiente() }
    return { ok: false, error: error.message }
  }
  // El acuse: sin fila leída de vuelta no se afirma nada. Un 204 no prueba una escritura.
  if (!data?.id) return { ok: false, error: 'La base no devolvió la anotación. No la doy por guardada.' }

  revalidatePath(`/administracion/personas/${personaId}`)
  return { ok: true, id: data.id, mensaje: 'Anotado.' }
}

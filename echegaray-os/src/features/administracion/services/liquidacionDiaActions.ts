'use server'

// LA ÚNICA ESCRITURA DE LA PANTALLA 3: corregir las horas de un día, dejando rastro.
//
// ═══ CORREGIR NO ES PISAR (R8) ═══
//
// La corrección hace DOS cosas o ninguna: actualiza `registros_hh` y escribe la fila del historial
// en `registro_hh_correccion` con el valor anterior, el autor y la fecha. Sin la segunda, después de
// la segunda corrección nadie puede decir de cuánto se venía — y la fila promete «era 9» en la
// pantalla. Si el historial falla, se avisa: un rastro perdido en silencio es peor que un error.
//
// ═══ LA QUINCENA CERRADA NO SE EDITA ═══
//
// Cerrar sella las horas (R6). Acá se pregunta el estado ANTES de tocar nada y se falla cerrado:
// sin poder leer `liquidacion_quincena`, no se escribe. La puerta de la pantalla ya deshabilita el
// campo, pero esta acción se invoca con el id que viaja en el HTML.
//
// ═══ LA PANTALLA ES LA PUERTA; LA POLICY ES LA CERRADURA ═══
//
// `liquidaSueldos` se vuelve a preguntar acá porque el jefe de obra entra a la misma pantalla a
// cargar asistencia. La cerradura final es la RLS de `registros_hh` y de `registro_hh_correccion`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { quincenaDe } from './quincena'

const RUTA = '/administracion/personas'

export type ResultadoDia = { ok: true } | { ok: false; error: string }

const correccionSchema = z.object({
  registroId: z.string().uuid('Día inválido'),
  // VACÍO ES BORRAR LAS HORAS, NO ESCRIBIR CERO: «todavía no lo cargué» y «no trabajó» son dos
  // afirmaciones distintas, y una de las dos se liquida.
  horas: z.union([
    z.literal(''),
    z.coerce.number().nonnegative('Las horas no pueden ser negativas').max(24, 'Un día tiene 24 horas'),
  ]),
})

interface RegistroTocado {
  id: string
  fecha: string | null
  horas: number | string | null
  tipo_hora: string | null
}

/** ¿Está sellada la quincena de esa fecha? Falla CERRADO: sin lectura no se corrige nada. */
async function quincenaCerrada(
  supabase: Awaited<ReturnType<typeof createClient>>, fecha: string,
): Promise<{ cerrada: boolean } | { error: string }> {
  const q = quincenaDe(fecha)
  const { data, error } = await supabase.from('liquidacion_quincena')
    .select('estado').eq('desde', q.desde).eq('hasta', q.hasta)
  if (error) return { error: `No pude verificar si la quincena está cerrada: ${error.message}` }
  return { cerrada: (data ?? []).some((f) => (f as { estado: string }).estado === 'cerrada') }
}

/**
 * CORREGIR LAS HORAS DE UN DÍA. El id llega atado con `.bind(null, id)`: nunca viaja en el
 * formulario, donde cualquiera lo cambiaría por el de otra persona.
 */
export async function corregirHorasDelDia(registroId: string, valor: string): Promise<ResultadoDia> {
  const datos = correccionSchema.safeParse({ registroId, horas: valor.trim() })
  if (!datos.success) return { ok: false, error: datos.error.issues[0].message }

  const supabase = await createClient()
  const { data: perfil, error: errorPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errorPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const actual = await supabase.from('registros_hh')
    .select('id, fecha, horas, tipo_hora').eq('id', datos.data.registroId).maybeSingle()
  if (actual.error) return { ok: false, error: actual.error.message }
  if (!actual.data) return { ok: false, error: 'Ese día ya no existe. No guardé nada.' }
  const fila = actual.data as RegistroTocado
  if (!fila.fecha) return { ok: false, error: 'Ese día no tiene fecha cargada: no sé a qué quincena pertenece.' }

  const sello = await quincenaCerrada(supabase, fila.fecha)
  if ('error' in sello) return { ok: false, error: sello.error }
  if (sello.cerrada) {
    return { ok: false, error: 'La quincena está cerrada: las horas quedaron selladas. Reabrila para corregir.' }
  }

  const antes = fila.horas == null ? null : Number(fila.horas)
  const despues = datos.data.horas === '' ? null : datos.data.horas
  // UNA CORRECCIÓN QUE NO CAMBIA NADA NO ES UNA CORRECCIÓN: escribirla ensuciaría el historial que
  // alguien va a leer para entender por qué un jornal no cierra (y el CHECK de la tabla la rechaza).
  if (antes === despues) return { ok: true }

  const { data: sesion } = await supabase.auth.getUser()
  const autor = sesion.user?.id ?? null

  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ. Un update que la policy rechaza sin
  // error devuelve 204 y cero filas — y un «guardado» sobre una escritura que no ocurrió es la
  // trampa que este repo ya pagó.
  const guardado = await supabase.from('registros_hh')
    .update({ horas: despues, actualizado_por: autor, actualizado_en: new Date().toISOString() })
    .eq('id', fila.id).select('id, horas').maybeSingle()
  if (guardado.error) return { ok: false, error: guardado.error.message }
  if (!guardado.data) return { ok: false, error: 'No pude guardar el día: la base no devolvió la fila.' }

  const rastro = await supabase.from('registro_hh_correccion').insert({
    registro_id: fila.id,
    horas_antes: antes,
    horas_despues: despues,
    tipo_antes: fila.tipo_hora,
    tipo_despues: fila.tipo_hora,
    autor,
  }).select('id').maybeSingle()
  if (rastro.error || !rastro.data) {
    return {
      ok: false,
      error: `Guardé las horas pero NO el rastro de quién corrigió${rastro.error ? `: ${rastro.error.message}` : ''}. Avisá antes de cerrar la quincena.`,
    }
  }

  revalidatePath(RUTA)
  return { ok: true }
}

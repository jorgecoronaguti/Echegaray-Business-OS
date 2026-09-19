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
import { FUENTE_CORRECCION_HORAS } from './presenciaDelDia'
import { quincenaCerrada } from './quincenaCerradaService'
import { vaciarHorasDelDia } from './vaciadoDeHorasService'

const RUTA = '/administracion/personas'

export type ResultadoDia = { ok: true } | { ok: false; error: string }

const correccionSchema = z.object({
  registroId: z.string().uuid('Día inválido'),
  // VACÍO ES BORRAR LAS HORAS, NO ESCRIBIR CERO: «todavía no lo cargué» y «no trabajó» son dos
  // afirmaciones distintas, y una de las dos se liquida.
  horas: z.union([
    z.literal(''),
    // CERO NO ES VACÍO: «no trabajó» y «sin horas» son dos afirmaciones, y la base exige horas > 0.
    z.coerce.number().nonnegative('Las horas no pueden ser negativas')
      .max(24, 'Un día tiene 24 horas')
      .refine((n) => n !== 0, 'Cero horas no es una marca: dejá la celda vacía o marcá la ausencia'),
  ]),
})

interface RegistroTocado {
  id: string
  fecha: string | null
  horas: number | string | null
  tipo_hora: string | null
  persona_id: string
  obra_canonica_id: string | null
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
    .select('id, fecha, horas, tipo_hora, persona_id, obra_canonica_id').eq('id', datos.data.registroId).maybeSingle()
  if (actual.error) return { ok: false, error: actual.error.message }
  if (!actual.data) return { ok: false, error: 'Ese día ya no existe. No guardé nada.' }
  const fila = actual.data as RegistroTocado
  if (!fila.fecha) return { ok: false, error: 'Ese día no tiene fecha cargada: no sé a qué quincena pertenece.' }

  const cierre = await quincenaCerrada(supabase, fila.fecha)
  if (cierre !== null) return { ok: false, error: cierre }

  const antes = fila.horas == null ? null : Number(fila.horas)
  const despues = datos.data.horas === '' ? null : datos.data.horas
  // UNA CORRECCIÓN QUE NO CAMBIA NADA NO ES UNA CORRECCIÓN: escribirla ensuciaría el historial que
  // alguien va a leer para entender por qué un jornal no cierra (y el CHECK de la tabla la rechaza).
  if (antes === despues) return { ok: true }

  const { data: sesion } = await supabase.auth.getUser()
  const autor = sesion.user?.id ?? null

  // VACIAR LA CELDA BORRA EL DÍA. `horas` es NOT NULL en la base: escribir null era un error de la
  // base disfrazado de «guardado» (el E2E del 12/09/2026 lo midió: la celda quedaba en 8). Y 0 no
  // sirve: «no trabajó» y «todavía no lo cargué» son dos afirmaciones y sólo la primera se liquida.
  // Vaciar es volver a «todavía no lo cargué»: la fila se va (y con ella su rastro, en cascada); si
  // la planilla JORNALES tiene ese día, el importador horario la vuelve a crear desde la planilla.
  // DESDE EL 15/09/2026 VACÍA POR LA MISMA REGLA QUE HORAS Y LA CARGA DEL DÍA (`vaciadoDeHoras.ts`):
  // sólo la jornada trabajada. Una extra o una imputación a una actividad no se van por vaciar una celda.
  if (despues === null) {
    const v = await vaciarHorasDelDia(supabase, { personas: [fila.persona_id], fecha: fila.fecha, obra: fila.obra_canonica_id })
    if (v.error) return { ok: false, error: v.error }
    if (v.borradas === 0) {
      return { ok: false, error: `No vacié el día: ${v.intactas[0]?.motivo ?? 'no encontré horas de la jornada'}. Corregilo desde la solapa Horas.` }
    }
    revalidatePath(RUTA)
    return { ok: true }
  }

  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ. Un update que la policy rechaza sin
  // error devuelve 204 y cero filas — y un «guardado» sobre una escritura que no ocurrió es la
  // trampa que este repo ya pagó.
  const guardado = await supabase.from('registros_hh')
    .update({
      horas: despues,
      actualizado_por: autor,
      actualizado_en: new Date().toISOString(),
      // EL ORIGEN DEJA DE MENTIR. Una fila que venía de `web:presencia-defecto` y que una persona
      // corrigió seguía declarándose «jornada por defecto», y `planDeHorasPorDefecto` la borraba
      // después como si nadie la hubiera mirado: así desaparecían las 13 h que el dueño tecleó el
      // 10/09/2026 sobre los dos Quiroga. El que corrige se queda con la fila.
      fuente_legacy: FUENTE_CORRECCION_HORAS,
    })
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

'use server'

// REGISTRAR UN ADELANTO — la única escritura de `persona_adelanto`.
//
// Hasta hoy el ADELANTO en efectivo no tenía tabla: vivía en la columna Z de JORNALES y la grilla lo
// mostraba con la nota «sin fuente en el OS». Una columna que se RESTA y no tiene de dónde salir le
// paga dos veces a quien ya recibió plata en mano.
//
// ═══ LA CLASE NO SE ELIGE: SE DEDUCE ═══
//
// Quien carga el movimiento sabe la fecha y el canal, que son datos. Que sea «adelanto» o «ya
// transferido» es una CONCLUSIÓN de esos dos (R5) y la saca `claseDelMovimiento`. Dejarla a
// elección convertiría la conciliación del lote de haberes en criterio personal.
//
// ═══ LA PANTALLA ES LA PUERTA; LA POLICY ES LA CERRADURA ═══
//
// `persona_adelanto` tiene RLS por `liquida_sueldos()`. Igual se vuelve a preguntar el rol acá:
// esta acción se invoca con el id que viaja en el HTML y el jefe de obra entra a la misma pantalla.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { permisoDeLiquidacion } from './liquidacionPermiso'
import { claseDelMovimiento, validarAdelanto } from './liquidacionAdelanto'

const RUTA = '/administracion/personas'

const ISO = /^\d{4}-\d{2}-\d{2}$/

const adelantoSchema = z.object({
  persona_id: z.string().uuid(),
  desde: z.string().regex(ISO, 'Quincena inválida'),
  hasta: z.string().regex(ISO, 'Quincena inválida'),
  fecha: z.string().regex(ISO, 'Fecha inválida'),
  importe: z.string().min(1, 'Escribí el importe'),
  canal: z.enum(['efectivo', 'banco']),
  nota: z.string().max(300).optional(),
  /** Cuándo se armó el lote de haberes de esta quincena. Vacío = todavía no se armó. */
  lote_armado_el: z.union([z.literal(''), z.string().regex(ISO)]).optional(),
})

export type ResultadoAdelanto = { ok: true; mensaje: string } | { ok: false; error: string }

export async function registrarAdelanto(form: FormData): Promise<ResultadoAdelanto> {
  const datos = adelantoSchema.safeParse(Object.fromEntries(form))
  if (!datos.success) {
    return { ok: false, error: datos.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const d = datos.data
  const validado = validarAdelanto({
    personaId: d.persona_id,
    quincena: { desde: d.desde, hasta: d.hasta },
    fecha: d.fecha,
    importe: d.importe,
    canal: d.canal,
    nota: d.nota ?? '',
  })
  if (!validado.ok) return { ok: false, error: validado.error }

  const supabase = await createClient()
  const { data: perfil, error: errorPerfil } = await getPerfilActual(supabase)
  const permiso = permisoDeLiquidacion(perfil?.rol, errorPerfil)
  if (!permiso.ok) return { ok: false, error: permiso.error }

  const clase = claseDelMovimiento(
    { canal: validado.adelanto.canal, fecha: validado.adelanto.fecha },
    d.lote_armado_el ? d.lote_armado_el : null,
  )
  // EL AUTOR NO ES OPCIONAL. Plata entregada en mano sin quién la entregó es un asiento anónimo:
  // cuando alguien discuta el importe no hay a quién preguntarle.
  const { error } = await supabase.from('persona_adelanto').insert({
    persona_id: validado.adelanto.personaId,
    quincena: validado.adelanto.quincena,
    fecha: validado.adelanto.fecha,
    importe: validado.adelanto.importe,
    canal: validado.adelanto.canal,
    clase,
    nota: validado.adelanto.nota,
    autor: perfil?.id ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(RUTA)
  const columna = clase === 'ya_transferido' ? 'YA TRANSFERIDO' : 'ADELANTO'
  return { ok: true, mensaje: `Registrado en la columna ${columna} de la quincena.` }
}

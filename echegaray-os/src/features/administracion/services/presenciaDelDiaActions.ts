'use server'

// GUARDAR LA PRESENCIA DEL DÍA — la única escritura de `asistencia_dia`.
//
// ═══ ESTA ACCIÓN NO TOCA `registros_hh`. NUNCA ═══
//
// Es la línea entera del trabajo. El dueño, 08/09/2026: *«una cosa es asistir y otra la carga de
// horas»*. Si algún día alguien agrega acá un insert de horas «para no hacer dos toques», vuelve el
// defecto: declarar que Juan está pasaría a imputarle costo a una obra.
//
// ═══ UN UPSERT, NO TRES VIAJES ═══
//
// La tabla tiene `unique (persona_id, fecha)`, así que insertar y corregir son la misma operación.
// A diferencia de la carga de horas —que necesita insertar, corregir y borrar por separado y sin
// transacción—, acá no hay ventana en la que el día no esté en ningún lado.
//
// ═══ LO QUE NO CAMBIÓ NO SE ESCRIBE ═══
//
// `planDePresencia` compara contra lo guardado. Sin eso, reabrir el día y tocar Guardar reescribía
// la presencia de toda la cuadrilla y `marcado_por` terminaba diciendo el nombre de quien sólo pasó
// a mirar — y esa firma es justamente lo que hace que la declaración valga.
//
// ═══ LA ACCIÓN ES LA PUERTA, NO LA PANTALLA ═══
//
// La pantalla ofrece obras activas y personas de la cuadrilla; esta llamada puede venir de
// cualquier lado. La obra se verifica acá, y quién puede escribir lo decide la RLS de
// `asistencia_dia`, que rechaza aunque alguien llame a PostgREST a mano.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { esMotivo } from './motivoDeAusencia'
import {
  acusePresencia, planDePresencia, resumenPresencia,
  type MarcaPresencia, type PresenciaGuardada,
} from './presenciaDelDia'
import { getPresenciaDelDia } from './presenciaDelDiaService'

// EL MOTIVO SE VALIDA CONTRA EL CATÁLOGO, NO CONTRA UNA LISTA DE ESTA PANTALLA. `esMotivo` mira
// `orquestador/lib/asistencia-motivos.mjs`, que es lo que usa el bot desde julio. Y una presencia
// con motivo se rechaza acá igual que en el CHECK de la tabla: dos cerraduras, una definición.
const marcaSchema = z.discriminatedUnion('estado', [
  z.object({
    persona_id: z.string().uuid(),
    estado: z.literal('presente'),
    motivo: z.null().default(null),
  }),
  z.object({
    persona_id: z.string().uuid(),
    estado: z.enum(['ausente', 'licencia']),
    motivo: z.string().trim().refine(esMotivo, 'Ese motivo no está en el catálogo').nullable().default(null),
  }),
])

const envioSchema = z.object({
  obra_id: z.string().trim().min(1, 'Elegí la obra'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  marcas: z.array(marcaSchema).min(1, 'No marcaste a nadie todavía.'),
})

export type ResultadoPresencia =
  | { ok: true; mensaje: string; guardadas: PresenciaGuardada[] }
  | { ok: false; error: string }

export async function guardarPresencia(entrada: unknown): Promise<ResultadoPresencia> {
  const parsed = envioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { obra_id: obraId, fecha, marcas } = parsed.data

  const supabase = await createClient()

  const obra = await supabase.from('obra_canonica').select('id').eq('id', obraId).maybeSingle()
  if (obra.error) return { ok: false, error: obra.error.message }
  if (!obra.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }

  // LO GUARDADO SE LEE ANTES DE DECIDIR QUÉ ESCRIBIR. Sin obra: la presencia de una persona es de
  // ese DÍA, y el único de la tabla es (persona, fecha) — si alguien la declaró en otra obra a la
  // mañana, corregirla acá es corregir la misma fila, no crear una segunda.
  const previo = await getPresenciaDelDia(supabase, fecha, null)
  if (previo.error) return { ok: false, error: previo.error }
  const guardadas = previo.data ?? []

  const plan = planDePresencia(marcas as MarcaPresencia[], guardadas)
  if (plan.cambios.length === 0) {
    return {
      ok: true,
      mensaje: `Ya estaba guardado: ${acusePresencia(resumenPresencia(marcas as MarcaPresencia[], marcas.length))}.`,
      guardadas: mezclar(guardadas, marcas as MarcaPresencia[]),
    }
  }

  // `.select()` ENCADENADO: se acusa lo que la base DEVOLVIÓ, no lo que se le pidió. Un upsert que
  // afecta cero filas —porque la policy lo rechazó sin error— no puede acusar «12 presentes».
  const { data, error } = await supabase
    .from('asistencia_dia')
    .upsert(
      plan.cambios.map((m) => ({
        persona_id: m.persona_id,
        fecha,
        obra_canonica_id: obraId,
        estado: m.estado,
        motivo: m.motivo,
      })),
      { onConflict: 'persona_id,fecha' },
    )
    .select('persona_id, estado, motivo')

  if (error) {
    return {
      ok: false,
      error: /asistencia_dia.*does not exist/i.test(error.message)
        // NO SE INVENTA UN VERDE. Sin la tabla no hay dónde guardar, y decirlo con el nombre de la
        // migración es lo que hace que el mensaje sirva para algo.
        ? 'Todavía no está aplicada la migración 20260908T1900_asistencia_dia.sql: la presencia no se puede guardar.'
        : error.message,
    }
  }
  const escritas = (data ?? []) as PresenciaGuardada[]
  if (escritas.length === 0) {
    return { ok: false, error: 'La base no guardó ninguna marca. Puede ser un permiso: probá recargar.' }
  }

  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/personas/en-obra')

  const resumen = resumenPresencia(marcas as MarcaPresencia[], marcas.length)
  return { ok: true, mensaje: acusePresencia(resumen), guardadas: mezclar(guardadas, marcas as MarcaPresencia[]) }
}

/** Lo guardado después de este toque: lo que había, con lo recién escrito encima. Vuelve a la
 *  pantalla para que la carga de horas sepa a quién ofrecerle la jornada SIN otra consulta. */
function mezclar(
  antes: readonly PresenciaGuardada[], ahora: readonly MarcaPresencia[],
): PresenciaGuardada[] {
  const porPersona = new Map(antes.map((g) => [g.persona_id, g]))
  for (const m of ahora) porPersona.set(m.persona_id, { ...m })
  return [...porPersona.values()]
}

'use server'

// GUARDAR LA PRESENCIA DEL DÍA — la única escritura de `asistencia_dia`.
//
// ═══ ESTA ACCIÓN ESCRIBE TAMBIÉN LA JORNADA POR DEFECTO ═══
//
// A la mañana del 08/09/2026 la regla era la contraria y estaba escrita acá: «no toca
// `registros_hh`, nunca». A la tarde el dueño pidió lo otro, textual: *«que por defecto cuando se
// ponga la asistencia se le cargue 9 hs los L, M, M, J y 8 hs los V, permitiendo luego edición de
// esto mismo en la planilla de asistencia»*. Se registra el cambio en vez de borrar la regla vieja
// porque la consecuencia que aquella advertía es real y ahora está aceptada a propósito: **declarar
// que Juan está le imputa costo de mano de obra a la obra donde se lo marcó**.
//
// Lo que la protege es la forma de la escritura, no un comentario: `planDeHorasPorDefecto` sólo
// llena el vacío (cualquier fila de horas de esa persona ese día, de cualquier obra, la frena) y
// sólo borra filas con su propia marca de origen. La regla y su porqué viven en `presenciaDelDia.ts`;
// acá se aplica y se acusa lo que la base devolvió.
//
// ═══ SI LAS HORAS FALLAN, LA PRESENCIA IGUAL QUEDÓ ═══
//
// Son dos escrituras y no hay transacción. La presencia va primero porque es el hecho que el jefe
// fue a declarar; si el paso de horas falla, la acción responde OK —porque la presencia SE GUARDÓ—
// y el mensaje dice, con todas las letras, que las horas hay que cargarlas en Asistencia. Devolver
// error haría que el jefe vuelva a tocar Guardar sobre algo que ya estaba bien.
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
  acuseDeHorasPorDefecto, acusePresencia, FUENTE_HORAS_POR_DEFECTO, planDeHorasPorDefecto,
  planDePresencia, resumenPresencia,
  type HoraDelDia, type MarcaPresencia, type PresenciaGuardada,
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
    // NADA QUE ESCRIBIR EN LA PRESENCIA NO ES NADA QUE HACER. Las horas por defecto se agregaron
    // después de que ya había días declarados, y hay gente marcada presente sin ninguna hora: si
    // este camino saliera antes de mirarlas, volver a tocar Guardar no las cargaría nunca. El plan
    // de horas es idempotente —quien ya tiene horas no recibe nada—, así que pasar por acá es
    // seguro.
    const soloHoras = await aplicarHorasPorDefecto(supabase, obraId, fecha, marcas as MarcaPresencia[])
    const yaEstaba = `Ya estaba guardado: ${acusePresencia(resumenPresencia(marcas as MarcaPresencia[], marcas.length))}.`
    if (soloHoras.escribio) {
      revalidatePath('/campo/asistencia')
      revalidatePath('/administracion/personas')
    }
    return {
      ok: true,
      mensaje: [yaEstaba, soloHoras.mensaje].filter(Boolean).join(' '),
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

  // LAS HORAS DESPUÉS DE LA PRESENCIA, Y SOBRE TODAS LAS MARCAS —no sólo sobre las que cambiaron—:
  // una persona ya declarada presente que todavía no tiene horas las tiene que recibir igual.
  const horas = await aplicarHorasPorDefecto(supabase, obraId, fecha, marcas as MarcaPresencia[])

  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
  revalidatePath('/administracion/personas/en-obra')
  if (horas.escribio) revalidatePath('/administracion/asistencia')

  const resumen = resumenPresencia(marcas as MarcaPresencia[], marcas.length)
  const mensaje = [acusePresencia(resumen), horas.mensaje].filter(Boolean).join(' · ')
  return { ok: true, mensaje, guardadas: mezclar(guardadas, marcas as MarcaPresencia[]) }
}

/**
 * LA JORNADA POR DEFECTO CONTRA LA BASE. Devuelve qué decir, nunca un throw: la presencia ya está
 * guardada cuando esto corre.
 *
 * ═══ LA LECTURA ES POR PERSONA Y DÍA, SIN OBRA ═══
 *
 * `hh_select_por_obra` deja ver a Administración —y el jefe de obra lo es desde el 19/08— todas las
 * filas, así que la consulta ve de verdad las horas cargadas en OTRA obra. Si algún día esa policy
 * se acota por obra, este guardián se vuelve ciego y el mismo día se cargaría dos veces: el día que
 * se toque `hh_select_por_obra`, hay que volver acá.
 */
async function aplicarHorasPorDefecto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, fecha: string, marcas: readonly MarcaPresencia[],
): Promise<{ mensaje: string | null; escribio: boolean }> {
  const personaIds = marcas.map((m) => m.persona_id)
  const existentes = await supabase
    .from('registros_hh').select('id, persona_id, tipo_hora, fuente_legacy')
    .eq('fecha', fecha).in('persona_id', personaIds)
  if (existentes.error) return { mensaje: noSePudo(existentes.error.message), escribio: false }

  const plan = planDeHorasPorDefecto({
    presencias: marcas,
    horasExistentes: (existentes.data ?? []) as HoraDelDia[],
    fecha,
    obra: obraId,
  })

  let insertadas = 0
  if (plan.insertar.length > 0) {
    const { data, error } = await supabase.from('registros_hh').insert(plan.insertar.map((h) => ({
      ...h,
      // La semana la deriva el trigger `registros_hh_normalizar`; se manda igual porque la columna
      // es `not null`. Mismo motivo y misma forma que en `jornadaPorObraActions`.
      fecha_inicio_semana: fecha,
      // SIN ACTIVIDAD: esta fila no imputa al plan de obra. Es lo que deja que `esDeLaJornada` la
      // distinga de una hora cargada contra una tarea.
      actividad_id: null,
    }))).select('id')
    if (error) return { mensaje: noSePudo(error.message), escribio: false }
    insertadas = (data ?? []).length
  }

  let borradas = 0
  if (plan.borrar.length > 0) {
    // EL `eq('fuente_legacy', …)` ES LA SEGUNDA CERRADURA. Entre la lectura y este borrado alguien
    // pudo editar esa fila en la planilla —y editarla le cambia el origen—: sin este filtro, este
    // camino borraría una corrección hecha por una persona diez segundos antes.
    const { data, error } = await supabase.from('registros_hh').delete()
      .in('id', plan.borrar).eq('fuente_legacy', FUENTE_HORAS_POR_DEFECTO).select('id')
    if (error) return { mensaje: noSePudo(error.message), escribio: insertadas > 0 }
    borradas = (data ?? []).length
  }

  return {
    mensaje: acuseDeHorasPorDefecto({ insertadas, borradas, conflictos: plan.conflictos.length }),
    escribio: insertadas > 0 || borradas > 0,
  }
}

/** El fallo de las horas se dice entero y sin disfrazar de éxito: la presencia quedó, las horas no. */
const noSePudo = (error: string): string =>
  `La presencia quedó guardada, pero las horas por defecto no se pudieron cargar (${error}). Cargalas en Asistencia.`

/** Lo guardado después de este toque: lo que había, con lo recién escrito encima. Vuelve a la
 *  pantalla para que la carga de horas sepa a quién ofrecerle la jornada SIN otra consulta. */
function mezclar(
  antes: readonly PresenciaGuardada[], ahora: readonly MarcaPresencia[],
): PresenciaGuardada[] {
  const porPersona = new Map(antes.map((g) => [g.persona_id, g]))
  for (const m of ahora) porPersona.set(m.persona_id, { ...m })
  return [...porPersona.values()]
}

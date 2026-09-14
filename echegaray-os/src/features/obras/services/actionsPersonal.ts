'use server'

// PERSONAL DE OBRA — las acciones que ESCRIBEN sobre `obra_asignacion`.
//
// `obra_asignacion` es LA relación canónica persona ↔ obra ↔ actividad. La lee la solapa Personal de
// la obra y la lee la ficha de la persona en Administración: dos pantallas, una sola tabla. Por eso
// no hay ningún campo "obra actual" guardado en `personas` ni en `cuadrilla` — se deriva de acá.
//
// ═══ CERRAR NO ES QUITAR, Y LA DIFERENCIA IMPORTA ═══
//
// CERRAR pone `hasta`: la persona dejó de trabajar en la obra ese día y el período queda escrito.
// Es lo que respalda las horas que imputó mientras estuvo. QUITAR borra la fila, y sólo existe para
// la asignación cargada por error, que no tiene historia que preservar. Si las dos hicieran lo
// mismo, cada rotación de plantel borraría el pasado de la obra.
//
// ═══ ASIGNAR RESPETA LA CRONOLOGÍA Y NO TOCA LO DE OTROS SIN PREGUNTAR (14/09/2026) ═══
//
// Las altas pasan por `cronologiaAlAsignar.ts`: cierran solas la obra abierta anterior, piden
// confirmación para cualquier otro ajuste sobre filas cargadas por personas, y escriben todo en una
// transacción (`asignar_obra_con_cronologia`). El porqué está allá.
//
// El rol lo decide la RLS: `obra_asignacion` sólo admite escritura de dirección, administración y
// jefe de obra, y siempre dentro de `ve_obra(obra_id)`.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { diaSanJuan } from '../../../../orquestador/lib/cronologia-asignaciones.mjs'
import type { Resultado } from './actions'
import {
  aplicarAlta, asignarConCronologia, notaDeAjuste, planDeAlta, textoDeAjustes,
  type PlanDeAlta, type SupabaseAsignacion,
} from './cronologiaAlAsignar'

const fechaOpcional = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal(''),
]).optional()

/** `confirmar=1` lo manda el botón «Confirmar y ajustar», nunca el envío normal. */
const confirmacion = z.literal('1').optional()

const asignacionSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  rol: z.enum(['responsable', 'integrante']).optional(),
  cuadrilla_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  // La actividad es opcional a propósito: la mayoría del plantel se asigna a la obra entera, y
  // exigir una actividad obligaría a inventar una.
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  desde: fechaOpcional,
  hasta: fechaOpcional,
  notas: z.string().trim().max(300).optional(),
  confirmar: confirmacion,
})

const YA_ASIGNADA = 'Esa persona ya está asignada a esta obra (o a esa misma actividad) y sigue vigente.'

type Cliente = Awaited<ReturnType<typeof createClient>>

/** Quién asigna, para la nota que lleva toda fila tocada. Sin perfil legible igual queda constancia. */
async function quienAsigna(supabase: Cliente): Promise<string> {
  const perfil = await getPerfilActual(supabase)
  return perfil.data?.nombre || 'usuario sin perfil'
}

export async function asignarPersona(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = asignacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  // SIN FECHA ES HOY, NO «DESDE SIEMPRE». Una fila sin `desde` afirma que la persona estuvo en esta
  // obra desde el principio de los tiempos y pisa toda su historia: así nacieron las 18 filas que el
  // 14/09/2026 cruzaban ocho meses de JORNALES.
  const desde = d.desde || (diaSanJuan(new Date()) as string)
  const hasta = d.hasta || null
  if (hasta && hasta < desde) return { ok: false, error: 'El último día no puede ser anterior al primero.' }
  const supabase = await createClient()

  const r = await asignarConCronologia(supabase as unknown as SupabaseAsignacion, {
    personaId: d.persona_id,
    confirmado: d.confirmar === '1',
    usuario: await quienAsigna(supabase),
    alta: {
      obra_id: obraId, rol: d.rol ?? 'integrante', cuadrilla_id: d.cuadrilla_id || null,
      actividad_id: d.actividad_id || null, desde, hasta, notas: d.notas || null,
    },
  })
  // ═══ EL ÚNICO AHORA ES SOBRE LA ASIGNACIÓN **VIGENTE** (19/08/2026) ═══
  //
  // Con `obra_asignacion_una_vigente … where hasta is null`, volver a asignar a alguien que ya se
  // fue es un alta normal y el período anterior queda intacto. El 23505 significa lo que dice: esa
  // persona está asignada AHORA MISMO a eso. Y como la escritura es una transacción, no tocó nada más.
  if (!r.ok) {
    if ('requiereConfirmar' in r) return { ok: false, error: r.error, requiereConfirmar: r.requiereConfirmar }
    return { ok: false, error: 'code' in r && r.code === '23505' ? YA_ASIGNADA : r.error }
  }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Cerrar la asignación: la persona sale de la obra y el período queda escrito. Sin fecha explícita
 *  se usa hoy, que es el caso normal —alguien avisa que se fue— y tipear la fecha del día sólo
 *  agrega una forma de equivocarse. */
export async function cerrarAsignacion(
  obraId: string, asignacionId: string, hasta?: string | null,
): Promise<Resultado> {
  const supabase = await createClient()
  const valor = hasta?.trim() ? hasta.trim() : new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('obra_asignacion').update({ hasta: valor })
    .eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

/** Reabrir: se borra la fecha de fin. Para el cierre puesto por error. */
export async function reabrirAsignacion(obraId: string, asignacionId: string): Promise<Resultado> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('obra_asignacion').update({ hasta: null }).eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.code === '23505' ? YA_ASIGNADA : error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

export async function quitarAsignacion(obraId: string, asignacionId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_id')` no sobra: sin él, un id de otra obra borraría una asignación ajena.
  const { error } = await supabase.from('obra_asignacion').delete().eq('id', asignacionId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

const cuadrillaAObraSchema = z.object({
  cuadrilla_id: z.string().uuid('Elegí una cuadrilla'),
  obra_id: z.string().trim().min(1, 'Elegí una obra'),
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  desde: fechaOpcional,
  confirmar: confirmacion,
})

/** Los integrantes vigentes de la cuadrilla que todavía no están en esa obra (y actividad). */
async function integrantesNuevos(
  supabase: Cliente, d: { cuadrilla_id: string; obra_id: string }, actividad: string | null,
): Promise<{ nuevos: string[]; yaEstaban: number } | { error: string }> {
  const { data: integrantes, error: errorIntegrantes } = await supabase
    .from('cuadrilla_integrante').select('persona_id').eq('cuadrilla_id', d.cuadrilla_id).is('hasta', null)
  if (errorIntegrantes) return { error: errorIntegrantes.message }
  const personas = (integrantes ?? []).map((f) => (f as { persona_id: string }).persona_id)
  if (personas.length === 0) return { error: 'La cuadrilla no tiene integrantes vigentes.' }
  let consulta = supabase.from('obra_asignacion').select('persona_id')
    .eq('obra_id', d.obra_id).in('persona_id', personas)
  consulta = actividad ? consulta.eq('actividad_id', actividad) : consulta.is('actividad_id', null)
  const { data: existentes, error: errorExistentes } = await consulta
  if (errorExistentes) return { error: errorExistentes.message }
  const ya = new Set((existentes ?? []).map((f) => (f as { persona_id: string }).persona_id))
  return { nuevos: personas.filter((p) => !ya.has(p)), yaEstaban: ya.size }
}

/**
 * Mandar una cuadrilla entera a una obra.
 *
 * Genera UNA asignación por integrante vigente, todas con `cuadrilla_id`. No existe una tabla
 * "cuadrilla asignada a obra": la cuadrilla en la obra ES el conjunto de sus integrantes asignados,
 * y por eso la obra los ve uno por uno y puede sacar a uno sin desarmar la cuadrilla.
 *
 * A quien ya estaba asignado a esa obra se lo saltea y se dice cuántos fueron. Si ALGUNO pide
 * confirmar un ajuste sobre filas de otros, no se escribe a nadie: la cuadrilla se manda entera o no
 * se manda, y la pantalla lista todo junto.
 */
export async function asignarCuadrillaAObra(form: FormData): Promise<Resultado> {
  const parsed = cuadrillaAObraSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()
  const actividad = d.actividad_id || null
  const grupo = await integrantesNuevos(supabase, d, actividad)
  if ('error' in grupo) return { ok: false, error: grupo.error }
  if (grupo.nuevos.length === 0) return { ok: false, error: 'Todos los integrantes ya estaban asignados a esa obra.' }

  const desde = d.desde || (diaSanJuan(new Date()) as string)
  const cliente = supabase as unknown as SupabaseAsignacion
  const planes: { persona_id: string; plan: PlanDeAlta }[] = []
  for (const persona_id of grupo.nuevos) {
    const leido = await planDeAlta(cliente, persona_id, {
      obra_id: d.obra_id, rol: 'integrante', cuadrilla_id: d.cuadrilla_id, actividad_id: actividad, desde, hasta: null, notas: null,
    })
    if ('error' in leido) return { ok: false, error: leido.error }
    planes.push({ persona_id, plan: leido.plan })
  }
  const confirmado = d.confirmar === '1'
  const ajustes = planes.flatMap((p) => p.plan.ajustes)
  if (ajustes.length > 0 && !confirmado) return { ok: false, error: textoDeAjustes(ajustes), requiereConfirmar: ajustes }

  const nota = notaDeAjuste(await quienAsigna(supabase), { obra_id: d.obra_id, desde })
  const fallos: string[] = []
  for (const { persona_id, plan } of planes) {
    const fallo = await aplicarAlta(cliente, persona_id, plan, { confirmado, nota })
    if (fallo) fallos.push(fallo.code === '23505' ? YA_ASIGNADA : fallo.error)
  }
  revalidatePath(`/obras/${d.obra_id}`)
  revalidatePath('/administracion/personas/cuadrillas')
  revalidatePath('/administracion/personas')
  // CADA INTEGRANTE ES SU PROPIA TRANSACCIÓN: el que falló quedó exactamente como estaba, y se dice.
  if (fallos.length > 0) {
    return { ok: false, error: `${planes.length - fallos.length} de ${planes.length} asignados; los otros ${fallos.length} quedaron como estaban: ${fallos[0]}` }
  }
  return {
    ok: true,
    mensaje: grupo.yaEstaban > 0
      ? `${planes.length} asignados. ${grupo.yaEstaban} ya estaban en esa obra.`
      : `${planes.length} asignados a la obra.`,
  }
}

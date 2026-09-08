'use server'

// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA DESDE LA GRILLA DE ASISTENCIA.
//
// El dueño (08/09/2026): *"la asignación de personal en cada obra es imposible… por el momento que
// sea desde planilla asistencia con un dropdown de obra actual"*. Esta acción es lo que hay detrás
// de ese desplegable, y escribe la MISMA tabla que la solapa Personal de la obra y que la ficha de
// la persona: `obra_asignacion`. No existe un campo «obra actual» en `personas` — inventarlo sería
// la segunda definición de dónde trabaja alguien.
//
// ═══ LA ACCIÓN ES LA PUERTA, NO EL DESPLEGABLE ═══
//
// La pantalla ofrece obras activas; esta llamada puede venir de cualquier lado. Se vuelve a
// verificar que la obra exista y esté ACTIVA —igual que `guardarJornada`—: asignar gente a una obra
// cerrada le imputa costo de mano de obra a algo que ya nadie mira.
//
// ═══ LAS HORAS YA CARGADAS NO SE TOCAN ═══
//
// Cada `registros_hh` lleva su propia `obra_canonica_id`: son hechos del día en que ocurrieron.
// Cambiar la obra actual cambia de dónde en adelante, nunca hacia atrás. Si hay que mover un día ya
// cargado, eso es la corrección de jornada (`corregirJornada`), que además avisa a qué obra va.
//
// ═══ PRIMERO CIERRA, DESPUÉS ABRE ═══
//
// Al revés de `escribirPlan` —donde el riesgo es perder horas y por eso se inserta primero—, acá
// ninguna de las dos escrituras pierde nada: cerrar es un `update` reversible (se borra `hasta`).
// Si el `insert` falla después del cierre, la persona queda «Sin obra», que la grilla muestra y el
// mismo desplegable arregla. Abriendo primero, un cierre fallido dejaría DOS obras vigentes y la
// grilla elegiría una por horas: el error quedaría escondido detrás de un rótulo plausible.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { planDeCambioDeObra, puedeCambiarObraActual, type AsignacionVigente } from './planDeObraActual'

export type ResultadoObraActual = { ok: true; mensaje: string } | { ok: false; error: string }

// `obra_id` es TEXT (`obra_canonica.id` es un slug, no un uuid): pedir `.uuid()` acá rechazaría
// todas las obras reales. `null` es «Sin obra», que es una opción y no un error.
const cambioSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  obra_id: z.union([z.string().trim().min(1), z.literal(''), z.null()]).optional(),
})

export async function cambiarObraActual(entrada: unknown): Promise<ResultadoObraActual> {
  const parsed = cambioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const personaId = parsed.data.persona_id
  const obraId = parsed.data.obra_id ? parsed.data.obra_id : null
  const hoy = new Date().toISOString().slice(0, 10)

  const supabase = await createClient()

  // ═══ SÓLO DIRECCIÓN Y ADMINISTRACIÓN (dueño, 08/09/2026) ═══
  //
  // La pantalla no muestra el desplegable al jefe de obra, pero la pantalla es la cerradura y ésta
  // es la puerta: la llamada puede venir de cualquier lado, y la RLS de `obra_asignacion` NO alcanza
  // —deja escribir al jefe dentro de `ve_obra`, que es justo lo que el dueño excluyó—.
  const perfil = await getPerfilActual(supabase)
  if (perfil.error) return { ok: false, error: perfil.error }
  if (!puedeCambiarObraActual(perfil.data?.rol)) {
    return {
      ok: false,
      error: 'Cambiar la obra de una persona es de Administración. La asistencia se sigue cargando '
        + 'y corrigiendo normalmente.',
    }
  }

  // LA PERSONA TIENE QUE EXISTIR EN EL PLANTEL. `persona_plantel` publica sólo a quien está en la
  // empresa: asignar a alguien dado de baja le imputaría horas a un legajo cerrado.
  const persona = await supabase.from('persona_plantel')
    .select('id, nombre_completo').eq('id', personaId).maybeSingle()
  if (persona.error) return { ok: false, error: persona.error.message }
  if (!persona.data) return { ok: false, error: 'Esa persona no está en el plantel o no la ves.' }

  let destino: { id: string; nombre: string } | null = null
  if (obraId) {
    const obra = await supabase.from('obra_canonica')
      .select('id, nombre, estado').eq('id', obraId).maybeSingle()
    if (obra.error) return { ok: false, error: obra.error.message }
    if (!obra.data) return { ok: false, error: 'Esa obra no existe o no la ves.' }
    const o = obra.data as { id: string; nombre: string; estado: string | null }
    if (o.estado !== 'activa') {
      return {
        ok: false,
        error: `«${o.nombre}» no está activa (${o.estado ?? 'sin estado'}): no se le puede asignar `
          + 'gente. Si la obra volvió a arrancar, primero se reabre.',
      }
    }
    destino = { id: o.id, nombre: o.nombre }
  }

  const vigentes = await leerVigentes(supabase, personaId, hoy)
  if (vigentes.error) return { ok: false, error: vigentes.error }

  const plan = planDeCambioDeObra({ vigentes: vigentes.data, destino, hoy })
  if (plan.sinCambio) return { ok: true, mensaje: plan.acuse }

  for (const c of plan.cerrar) {
    // EL `eq('persona_id')` NO SOBRA: sin él un id copiado de otra ficha cerraría la asignación de
    // otro. Y `.select()` porque la evidencia es del efecto: un `update` que no afecta ninguna fila
    // —porque la policy la rechazó sin error— no puede acusar «cambiada».
    const { data, error } = await supabase.from('obra_asignacion')
      .update({ hasta: c.hasta }).eq('id', c.id).eq('persona_id', personaId).select('id')
    if (error) return { ok: false, error: `No pude cerrar la asignación anterior: ${error.message}` }
    if ((data ?? []).length === 0) {
      return {
        ok: false,
        error: 'No pude cerrar la asignación anterior: la base no cambió ninguna fila. '
          + 'Puede ser un permiso — no se abrió ninguna asignación nueva.',
      }
    }
  }

  if (plan.abrir) {
    const { data, error } = await supabase.from('obra_asignacion').insert({
      obra_id: plan.abrir.obra_id,
      persona_id: personaId,
      // ROL «INTEGRANTE» Y NADA MÁS. Cuadrilla, actividad y rol son lo que hacía incomprensible
      // asignar a alguien; el desplegable contesta una sola pregunta —dónde trabaja hoy— y lo demás
      // se sigue pudiendo editar desde la solapa Personal de la obra.
      rol: 'integrante',
      desde: plan.abrir.desde,
    }).select('id')
    if (error) {
      return {
        ok: false,
        error: error.code === '23505'
          ? 'Esa persona ya tiene una asignación vigente a esa obra.'
          : `Cerré la asignación anterior pero NO pude abrir la nueva: ${error.message}. `
            + 'La persona quedó sin obra — elegila de nuevo.',
      }
    }
    if ((data ?? []).length === 0) {
      return {
        ok: false,
        error: 'Cerré la asignación anterior y la nueva no quedó escrita (cero filas). '
          + 'La persona quedó sin obra — elegila de nuevo.',
      }
    }
  }

  revalidatePath('/administracion/personas')
  revalidatePath(`/administracion/personas/${personaId}`)
  revalidatePath('/campo/asistencia')
  return { ok: true, mensaje: plan.acuse }
}

/** Las asignaciones que hoy están abiertas, con el nombre de su obra resuelto. */
async function leerVigentes(
  supabase: Awaited<ReturnType<typeof createClient>>, personaId: string, hoy: string,
): Promise<{ data: AsignacionVigente[]; error: string | null }> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId)
    .or(`hasta.is.null,hasta.gte.${hoy}`)
  // UNA LECTURA QUE FALLA NO ES «NO TIENE NINGUNA». Seguir con la lista vacía abriría la obra nueva
  // sin cerrar la vieja y dejaría a la persona en dos obras a la vez.
  if (error) return { data: [], error: `No pude leer sus asignaciones: ${error.message}` }
  const filas = (data ?? []) as { id: string; obra_id: string; desde: string | null }[]
  if (filas.length === 0) return { data: [], error: null }

  const { data: obras } = await supabase.from('obra_canonica')
    .select('id, nombre').in('id', [...new Set(filas.map((f) => f.obra_id))])
  const nombres = new Map(((obras ?? []) as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre]))
  return {
    data: filas.map((f) => ({
      id: f.id,
      obra_id: f.obra_id,
      // Sin catálogo se escribe el id: es feo, pero el acuse tiene que poder nombrar lo que cerró.
      nombre: nombres.get(f.obra_id) ?? f.obra_id,
      desde: f.desde,
    })),
    error: null,
  }
}

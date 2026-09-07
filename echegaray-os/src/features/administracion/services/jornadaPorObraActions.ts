'use server'

// GUARDAR EL DÍA — la única escritura de la asistencia por obra.
//
// ═══ POR QUÉ NO ES `imputarHHMasivo` ═══
//
// Esa acción inserta y SALTEA a quien ya tenía horas: sirve para cargar una cuadrilla la primera vez
// y no sirve acá, donde reabrir el día y corregir un 8,8 a 5 es el caso normal — saltearlo dejaría
// la corrección afuera y diría que salió bien. El plan de qué insertar, corregir y reemplazar lo
// decide `planDeJornada.ts`, que se prueba sin base.
//
// ═══ EL AUSENTE NO SE GUARDA COMO CERO ═══
//
// `registros_hh` exige `horas > 0`. La ausencia se guarda con las horas de la jornada y
// `tipo_hora='ausencia'`, que es lo que `tipoHora.ts` ya declara: «una ausencia tiene horas y no es
// trabajo». Nadie la suma como trabajo.
//
// ═══ NO SE TOCAN LAS HORAS DE OTRA OBRA ═══
//
// Todo `update` y todo `delete` llevan `eq('obra_canonica_id', obraId)`. Sin eso, corregir el día en
// una obra podría borrar la imputación que esa misma persona tiene ese día en otra.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  acuseDe, cambiaDeObra, correccionSchema, envioSchema, planDeGuardado,
  type FilaExistente, type MarcaDeJornada,
} from './planDeJornada'

export type ResultadoJornada = { ok: true; mensaje: string } | { ok: false; error: string }

export async function guardarJornada(entrada: unknown): Promise<ResultadoJornada> {
  const parsed = envioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { obra_id: obraId, fecha, marcas } = parsed.data

  const supabase = await createClient()
  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora')
    .eq('obra_canonica_id', obraId).eq('fecha', fecha)
    .in('persona_id', marcas.map((m) => m.persona_id))
  if (previos.error) return { ok: false, error: previos.error.message }

  const plan = planDeGuardado(marcas, (previos.data ?? []) as FilaExistente[])
  const fallo = await escribirPlan(supabase, obraId, fecha, plan)
  if (fallo) return { ok: false, error: fallo }

  revalidar()
  return { ok: true, mensaje: acuseDe(plan) }
}

/** Aplica el plan contra la base. Devuelve el mensaje del primer error, o `null` si entró todo.
 *  Vive aparte porque lo usan las DOS escrituras —el día del jefe y la corrección de
 *  Administración— y dos copias de un `insert` a `registros_hh` es cómo aparecen dos formas
 *  distintas de escribir la misma hora. */
async function escribirPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string, fecha: string, plan: ReturnType<typeof planDeGuardado>,
): Promise<string | null> {
  if (plan.borrar.length > 0) {
    const { error } = await supabase.from('registros_hh').delete()
      .eq('obra_canonica_id', obraId).eq('fecha', fecha).in('id', plan.borrar)
    if (error) return error.message
  }
  if (plan.insertar.length > 0) {
    const { error } = await supabase.from('registros_hh').insert(plan.insertar.map((m) => ({
      obra_canonica_id: obraId,
      persona_id: m.persona_id,
      // SIN ACTIVIDAD, A PROPÓSITO. El diseño lo dice: «ni foto, ni tarea, ni plata». Exigir una
      // actividad obligaría al jefe a inventar una para poder declarar horas que sí se trabajaron.
      actividad_id: null,
      fecha,
      // La semana la deriva el trigger `registros_hh_normalizar`; se manda igual porque la columna
      // es `not null` y un insert sin ella fallaría si el trigger se cayera.
      fecha_inicio_semana: fecha,
      horas: m.horas,
      tipo_hora: m.estado === 'ausente' ? 'ausencia' : 'normal',
      fuente_legacy: 'web:asistencia-obra',
    })))
    if (error) return error.message
  }
  for (const { id, marca } of plan.actualizar) {
    const { error } = await supabase.from('registros_hh')
      .update({ horas: marca.horas }).eq('id', id).eq('obra_canonica_id', obraId)
    if (error) return error.message
  }
  return null
}

/**
 * CORREGIR UN DÍA — lo que sólo puede hacer Administración: cambiarle la obra, las horas, declararlo
 * ausencia o borrarlo.
 *
 * ═══ LA ASIGNACIÓN NO SE CREA EN SILENCIO ═══
 *
 * Si la persona no está asignada a la obra destino, la acción NO carga las horas: vuelve con
 * `necesitaAsignacion` y el nombre de la obra. La pantalla lo dice y ofrece asignarla; recién con
 * `asignar: true` —un acto de alguien— se crea la fila en `obra_asignacion`. Crearla sola haría que
 * un dedo mal puesto cambiara de obra a una persona sin que nadie lo decidiera, y esa asignación es
 * la que después decide a qué obra se le imputa el costo.
 *
 * ═══ QUIÉN CORRIGIÓ NO SE ESCRIBE ACÁ ═══
 *
 * `creado_por` tiene `default auth.uid()` y `actualizado_por` lo pone el trigger
 * `set_actualizado_en()`. Mandarlo desde el cliente sería un dato que se puede omitir o falsear;
 * así lo escribe Postgres con la identidad de la sesión, siempre.
 */
export type ResultadoCorreccion =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; necesitaAsignacion?: boolean }

export async function corregirJornada(entrada: unknown): Promise<ResultadoCorreccion> {
  const parsed = correccionSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const c = parsed.data
  const supabase = await createClient()

  if (c.estado !== 'borrar') {
    const falta = await faltaAsignacion(supabase, c.persona_id, c.obra_destino, c.fecha)
    if (falta) {
      if (!c.asignar) {
        return {
          ok: false,
          necesitaAsignacion: true,
          error: `Esa persona no está asignada a ${falta} el ${c.fecha}. Se puede asignar acá mismo, `
            + 'pero es una decisión: la asignación es la que después decide a qué obra se le imputa el costo.',
        }
      }
      const alta = await supabase.from('obra_asignacion').insert({
        obra_id: c.obra_destino, persona_id: c.persona_id, rol: 'integrante', desde: c.fecha,
      })
      if (alta.error) return { ok: false, error: `No pude asignarla: ${alta.error.message}` }
    }
  }

  const previos = await supabase.from('registros_hh')
    .select('id, persona_id, horas, tipo_hora, obra_canonica_id')
    .eq('persona_id', c.persona_id).eq('fecha', c.fecha)
    .in('obra_canonica_id', [c.obra_origen, c.obra_destino].filter((x): x is string => Boolean(x)))
  if (previos.error) return { ok: false, error: previos.error.message }
  const filas = (previos.data ?? []) as (FilaExistente & { obra_canonica_id: string })[]
  const enOrigen = filas.filter((f) => f.obra_canonica_id === c.obra_origen)

  if (c.estado === 'borrar') {
    if (enOrigen.length === 0) return { ok: false, error: 'Ese día no tiene nada cargado.' }
    const { error } = await supabase.from('registros_hh').delete()
      .in('id', enOrigen.map((f) => f.id))
    if (error) return { ok: false, error: error.message }
    revalidar()
    return { ok: true, mensaje: `Día borrado: ${enOrigen.length} ${enOrigen.length === 1 ? 'registro' : 'registros'}.` }
  }

  const marca: MarcaDeJornada = c.estado === 'ausente'
    ? { persona_id: c.persona_id, estado: 'ausente', horas: c.horas ?? 1 }
    : { persona_id: c.persona_id, estado: 'presente', horas: c.horas as number }

  // INSERTAR PRIMERO, BORRAR DESPUÉS (ver `ORDEN_DEL_MOVIMIENTO`): un duplicado visible le gana a
  // una pérdida silenciosa, y PostgREST no ofrece la transacción que haría innecesaria la elección.
  const enDestino = filas.filter((f) => f.obra_canonica_id === c.obra_destino)
  const escrito = await escribirPlan(supabase, c.obra_destino, c.fecha,
    planDeGuardado([marca], enDestino))
  if (escrito) return { ok: false, error: escrito }

  if (cambiaDeObra(c) && enOrigen.length > 0) {
    const { error } = await supabase.from('registros_hh').delete().in('id', enOrigen.map((f) => f.id))
    if (error) {
      return {
        ok: false,
        error: `Las horas quedaron cargadas en la obra nueva pero NO pude sacarlas de la vieja: `
          + `${error.message}. El día está en las dos obras — hay que borrar el de la vieja a mano.`,
      }
    }
  }

  revalidar()
  return {
    ok: true,
    mensaje: cambiaDeObra(c)
      ? `Día movido a la obra nueva${c.estado === 'ausente' ? ' como ausencia' : ''}.`
      : `Día corregido${c.estado === 'ausente' ? ': no vino' : `: ${c.horas} hs`}.`,
  }
}

/** El nombre de la obra si la persona NO tiene asignación vigente ese día; `null` si sí la tiene. */
async function faltaAsignacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personaId: string, obraId: string, fecha: string,
): Promise<string | null> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, desde, hasta').eq('persona_id', personaId).eq('obra_id', obraId)
  // UNA LECTURA QUE FALLA NO ES «NO ESTÁ ASIGNADA». Frenar la corrección por un error de RLS
  // pondría a Administración a pelear con un aviso falso; el `insert` de abajo tiene su propia
  // policy y es la que decide de verdad.
  if (error) return null
  const vigente = ((data ?? []) as { desde: string | null; hasta: string | null }[])
    .some((a) => (!a.desde || a.desde <= fecha) && (!a.hasta || a.hasta >= fecha))
  if (vigente) return null
  const { data: obra } = await supabase.from('obra_canonica').select('nombre').eq('id', obraId).maybeSingle()
  return (obra as { nombre: string } | null)?.nombre ?? obraId
}

function revalidar() {
  revalidatePath('/campo/asistencia')
  revalidatePath('/administracion/personas')
}

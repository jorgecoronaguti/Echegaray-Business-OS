// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA — la PUERTA, sin Next y sin cliente real.
//
// `obraActualActions.ts` es una server action: importa `next/cache` y `@/lib/supabase/server`
// —que lee `headers()`—, así que no se la puede llamar desde `node --test`. Por eso lo único que
// quedaba probado era `planDeObraActual` (la decisión pura) y la pantalla (que ni siquiera dibuja
// el desplegable para el jefe de obra). El control que de verdad frena la escritura —el rol— vivía
// en el único tramo sin test: borrarlo dejaba todo verde, y la RLS de `obra_asignacion` SÍ deja
// escribir al jefe de obra dentro de sus obras (20260822T7000, líneas 340-341). Nadie avisaba.
//
// Acá vive esa secuencia entera: validar, rechazar por rol, verificar persona y obra, leer las
// vigentes, cerrar y abrir. Las dependencias entran por parámetro para que un test pueda mirar
// —además del resultado— QUÉ TABLAS SE TOCARON: que un rechazo devuelva `{ ok: false }` no prueba
// que no haya escrito antes.
//
// El porqué de cada regla (cerrar antes de abrir, `hasta = ayer`, sólo Administración) está en
// `obraActualActions.ts` y en `planDeObraActual.ts`; no se repite acá.

import { z } from 'zod'
import { planDeCambioDeObra, puedeCambiarObraActual, type AsignacionVigente } from './planDeObraActual.ts'

export type ResultadoObraActual = { ok: true; mensaje: string } | { ok: false; error: string }

type Fila = Record<string, unknown>
type Respuesta<T> = { data: T | null; error: { message: string; code?: string } | null }

/** Lo único que esta acción le pide a PostgREST. Tipar el subconjunto —y no `SupabaseClient`— es
 *  lo que permite que el falso del test sea un objeto común: si le falta un verbo, no compila. */
export interface SupabaseLike {
  from(tabla: string): TablaLike
}

interface TablaLike {
  select(columnas: string): LecturaLike
  update(valores: Fila): EscrituraLike
  insert(fila: Fila): EscrituraLike
}

interface LecturaLike {
  eq(columna: string, valor: string): LecturaLike
  in(columna: string, valores: string[]): PromiseLike<Respuesta<Fila[]>>
  or(filtro: string): PromiseLike<Respuesta<Fila[]>>
  maybeSingle(): PromiseLike<Respuesta<Fila>>
}

interface EscrituraLike {
  eq(columna: string, valor: string): EscrituraLike
  select(columnas: string): PromiseLike<Respuesta<Fila[]>>
}

export interface DepsObraActual {
  supabase: SupabaseLike
  /** El perfil ya leído. `null` es «no hay perfil», y sin rol no se mueve a nadie de obra. */
  perfil: { rol: string | null } | null
  /** `YYYY-MM-DD`. Entra por parámetro: un test que dependiera del reloj se rompería a medianoche. */
  hoy: string
  /** Refrescar las pantallas afectadas. Recibe el `persona_id` YA VALIDADO —una de las rutas lleva
   *  el id adentro— y sólo corre cuando algo se escribió de verdad. */
  revalidar?: (personaId: string) => void
}

// `obra_id` es TEXT (`obra_canonica.id` es un slug, no un uuid): pedir `.uuid()` acá rechazaría
// todas las obras reales. `null` es «Sin obra», que es una opción y no un error.
const cambioSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  obra_id: z.union([z.string().trim().min(1), z.literal(''), z.null()]).optional(),
})

export async function cambiarObraActualCon(
  deps: DepsObraActual, entrada: unknown,
): Promise<ResultadoObraActual> {
  const parsed = cambioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const personaId = parsed.data.persona_id
  const obraId = parsed.data.obra_id ? parsed.data.obra_id : null
  const { supabase, hoy } = deps

  // ═══ SÓLO DIRECCIÓN Y ADMINISTRACIÓN (dueño, 08/09/2026) ═══
  //
  // Antes de tocar NADA: el rechazo por rol no puede quedar después de una lectura de
  // `obra_asignacion`, porque entonces el orden de las líneas sería el único control.
  if (!puedeCambiarObraActual(deps.perfil?.rol)) {
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

  const obra = await destinoValido(supabase, obraId)
  if (obra.error) return { ok: false, error: obra.error }

  const vigentes = await leerVigentes(supabase, personaId, hoy)
  if (vigentes.error) return { ok: false, error: vigentes.error }

  const plan = planDeCambioDeObra({ vigentes: vigentes.data, destino: obra.destino, hoy })
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

  deps.revalidar?.(personaId)
  return { ok: true, mensaje: plan.acuse }
}

/** La obra destino existe y está ACTIVA. «Sin obra» (`null`) es un destino legítimo. */
async function destinoValido(
  supabase: SupabaseLike, obraId: string | null,
): Promise<{ destino: { id: string; nombre: string } | null; error: string | null }> {
  if (!obraId) return { destino: null, error: null }
  const obra = await supabase.from('obra_canonica')
    .select('id, nombre, estado').eq('id', obraId).maybeSingle()
  if (obra.error) return { destino: null, error: obra.error.message }
  if (!obra.data) return { destino: null, error: 'Esa obra no existe o no la ves.' }
  const o = obra.data as unknown as { id: string; nombre: string; estado: string | null }
  if (o.estado !== 'activa') {
    return {
      destino: null,
      error: `«${o.nombre}» no está activa (${o.estado ?? 'sin estado'}): no se le puede asignar `
        + 'gente. Si la obra volvió a arrancar, primero se reabre.',
    }
  }
  return { destino: { id: o.id, nombre: o.nombre }, error: null }
}

/** Las asignaciones que hoy están abiertas, con el nombre de su obra resuelto. */
async function leerVigentes(
  supabase: SupabaseLike, personaId: string, hoy: string,
): Promise<{ data: AsignacionVigente[]; error: string | null }> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId)
    .or(`hasta.is.null,hasta.gte.${hoy}`)
  // UNA LECTURA QUE FALLA NO ES «NO TIENE NINGUNA». Seguir con la lista vacía abriría la obra nueva
  // sin cerrar la vieja y dejaría a la persona en dos obras a la vez.
  if (error) return { data: [], error: `No pude leer sus asignaciones: ${error.message}` }
  const filas = (data ?? []) as unknown as { id: string; obra_id: string; desde: string | null }[]
  if (filas.length === 0) return { data: [], error: null }

  const { data: obras } = await supabase.from('obra_canonica')
    .select('id, nombre').in('id', [...new Set(filas.map((f) => f.obra_id))])
  const nombres = new Map(((obras ?? []) as unknown as { id: string; nombre: string }[])
    .map((o) => [o.id, o.nombre]))
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

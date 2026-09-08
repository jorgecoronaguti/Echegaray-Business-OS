// CAMBIAR LA OBRA ACTUAL DE UNA PERSONA — la PUERTA, sin Next y sin cliente real.
//
// `obraActualActions.ts` es una server action: importa `next/cache` y `@/lib/supabase/server`
// —que lee `headers()`—, así que no se la puede llamar desde `node --test`. Por eso lo único que
// quedaba probado era `planDeObraActual` (la decisión pura) y la pantalla, que es una cerradura y
// no una puerta: se dibuja o no se dibuja, y la llamada puede venir de cualquier lado. El control
// que de verdad frena la escritura —el rol— vivía
// en el único tramo sin test: borrarlo dejaba todo verde y nadie avisaba. Desde el 08/09 a la
// tarde el jefe de obra SÍ puede mover gente, así que el rol que este control tiene que poder
// frenar es `campo` —el único que la RLS acota por obra— y el que no tiene perfil.
//
// Acá vive esa secuencia entera: validar, rechazar por rol, verificar persona y obra, leer las
// vigentes, cerrar y abrir. Las dependencias entran por parámetro para que un test pueda mirar
// —además del resultado— QUÉ TABLAS SE TOCARON: que un rechazo devuelva `{ ok: false }` no prueba
// que no haya escrito antes.
//
// El porqué de cada regla (cerrar antes de abrir, `hasta = ayer`, quién puede) está en
// `obraActualActions.ts` y en `planDeObraActual.ts`; no se repite acá.

import { z } from 'zod'
import {
  planDeCambioDeObra, puedeCambiarObraActual, validarProgramacion, type AsignacionAbierta,
} from './planDeObraActual.ts'

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
  /** `hasta is null` — abierta. Es un filtro distinto de `eq`: PostgREST no compara con null. */
  is(columna: string, valor: null): PromiseLike<Respuesta<Fila[]>>
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
//
// `desde`/`hasta` SON OPCIONALES Y VACÍO ES AUSENTE: la grilla manda el gesto de siempre sin
// nombrarlos, y el panel manda `hasta: ''` cuando eligieron «hasta nuevo aviso» —un `<input
// type=date>` en blanco produce `''`, no `undefined`—. Zod valida la FORMA; que la fecha sea
// programable (ni hacia atrás, ni a dos años, ni el fin antes del inicio) lo decide
// `validarProgramacion`, que depende de hoy y por eso no puede vivir en un esquema.
const fechaOpcional = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')])
  .optional().nullable()

const cambioSchema = z.object({
  persona_id: z.string().uuid('Elegí una persona del plantel'),
  obra_id: z.union([z.string().trim().min(1), z.literal(''), z.null()]).optional(),
  desde: fechaOpcional,
  hasta: fechaOpcional,
})

export async function cambiarObraActualCon(
  deps: DepsObraActual, entrada: unknown,
): Promise<ResultadoObraActual> {
  const parsed = cambioSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const personaId = parsed.data.persona_id
  const obraId = parsed.data.obra_id ? parsed.data.obra_id : null
  const { supabase, hoy } = deps
  const desde = parsed.data.desde || hoy
  const hasta = parsed.data.hasta || null

  // ═══ DIRECCIÓN, ADMINISTRACIÓN Y JEFE DE OBRA (dueño, 08/09/2026, tarde) ═══
  //
  // La lista vive en `planDeObraActual.ts` con su porqué. Acá lo que importa es DÓNDE está el `if`:
  // antes de tocar NADA. Un rechazo puesto después de la lectura de `obra_asignacion` devuelve el
  // mismo objeto y ya dejó rastro; el orden de las líneas sería el único control.
  if (!puedeCambiarObraActual(deps.perfil?.rol)) {
    return {
      ok: false,
      error: 'Tu usuario no puede cambiar la obra de una persona: lo hacen Dirección, '
        + 'Administración y los jefes de obra. La asistencia se sigue cargando y corrigiendo '
        + 'normalmente.',
    }
  }

  // LAS FECHAS SE VALIDAN ANTES DE TOCAR NADA, igual que el rol y por lo mismo. Un `desde` en el
  // pasado que llegara hasta el `update` ya habría cerrado la asignación vigente cuando el `insert`
  // rebota: la persona queda sin obra por una fecha mal escrita.
  const fechas = validarProgramacion({ hoy, desde, hasta })
  if (fechas) return { ok: false, error: fechas }

  // LA PERSONA TIENE QUE EXISTIR EN EL PLANTEL. `persona_plantel` publica sólo a quien está en la
  // empresa: asignar a alguien dado de baja le imputaría horas a un legajo cerrado.
  const persona = await supabase.from('persona_plantel')
    .select('id, nombre_completo').eq('id', personaId).maybeSingle()
  if (persona.error) return { ok: false, error: persona.error.message }
  if (!persona.data) return { ok: false, error: 'Esa persona no está en el plantel o no la ves.' }

  const obra = await destinoValido(supabase, obraId)
  if (obra.error) return { ok: false, error: obra.error }

  const abiertas = await leerAbiertas(supabase, personaId)
  if (abiertas.error) return { ok: false, error: abiertas.error }

  const plan = planDeCambioDeObra({ abiertas: abiertas.data, destino: obra.destino, hoy, desde, hasta })
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
      // `hasta` SÓLO CUANDO EL TRAMO TIENE FIN. Mandarlo como `null` sería idéntico para la base
      // —la columna ya es nullable— pero no para el test que mira QUÉ se escribió: el cambio de hoy
      // tiene que seguir insertando exactamente las cuatro claves de siempre.
      ...(plan.abrir.hasta ? { hasta: plan.abrir.hasta } : {}),
    }).select('id')
    if (error) {
      // EL MENSAJE DE LA BASE VA ENTERO, TAMBIÉN EL DEL ÍNDICE ÚNICO. Un 23505 acá ya no es «ya
      // estaba en esa obra» —el plan cierra todas las abiertas antes de abrir—: es una fila que la
      // lectura no vio (otra actividad, o una que la RLS esconde). Cambiarlo por una frase amable
      // borraba justo el dato con el que se encuentra cuál.
      return {
        ok: false,
        error: `Cerré la asignación anterior pero NO pude abrir la nueva: ${error.message}`
          + (error.code === '23505'
            ? ' (choca con otra asignación vigente a esa obra que la lectura no vio).'
            : '.')
          + ' La persona quedó sin obra — elegila de nuevo.',
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

  // ═══ EL REGRESO VA ÚLTIMO, Y SU FALLA NO SE TRAGA ═══
  //
  // Va después del tramo programado porque si el pase no se pudo abrir, el regreso no tiene de
  // dónde volver: sería una asignación futura a la obra donde la persona YA está, que dentro de
  // tres semanas aparece sola y sin explicación.
  //
  // Si el pase entró y el regreso no, la persona queda con fecha de fin y sin obra después. Eso se
  // dice con todas las letras: es exactamente el estado que la planificación tenía que evitar, y
  // callarlo lo convierte en una sorpresa el día que el tramo termine.
  if (plan.reabrir) {
    const { data, error } = await supabase.from('obra_asignacion').insert({
      obra_id: plan.reabrir.obra_id,
      persona_id: personaId,
      rol: 'integrante',
      desde: plan.reabrir.desde,
    }).select('id')
    if (error || (data ?? []).length === 0) {
      deps.revalidar?.(personaId)
      return {
        ok: false,
        error: `Programé el pase pero NO pude programar el regreso${error ? `: ${error.message}` : ' (cero filas)'}. `
          + 'La persona queda SIN OBRA cuando el tramo termine — cancelá el pase y volvé a programarlo.',
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

/**
 * TODAS las asignaciones ABIERTAS de la persona, con el nombre de su obra resuelto.
 *
 * ═══ ABIERTA ES `hasta is null`, Y NADA MÁS ═══
 *
 * Antes esta lectura traía también las cerradas con `hasta >= hoy`, y eso rompía el cambio de obra
 * dos veces el mismo día: la primera cierra la de hoy con `hasta = hoy` (su `desde` es hoy), la
 * segunda la vuelve a ver «vigente», cree que la persona YA está ahí, no abre nada — y la persona
 * queda con cero asignaciones abiertas. Es el índice único el que define qué es estar asignado:
 * `obra_asignacion_una_vigente ... WHERE hasta IS NULL`. Se lee lo mismo que la base restringe.
 *
 * Sin filtro de obra y sin filtro de `desde`: las filas sin `desde` son las que dejó la web y son
 * exactamente las que hay que cerrar.
 */
async function leerAbiertas(
  supabase: SupabaseLike, personaId: string,
): Promise<{ data: AsignacionAbierta[]; error: string | null }> {
  const { data, error } = await supabase.from('obra_asignacion')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId)
    .is('hasta', null)
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

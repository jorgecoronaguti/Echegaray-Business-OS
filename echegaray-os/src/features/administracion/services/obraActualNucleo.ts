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
// asignaciones, y escribir. Las dependencias entran por parámetro para que un test pueda mirar
// —además del resultado— QUÉ SE ESCRIBIÓ: que un rechazo devuelva `{ ok: false }` no prueba que no
// haya escrito antes.
//
// ═══ UNA SOLA ESCRITURA, Y NADA DE LO AJENO SIN CONFIRMAR (auditoría, 14/09/2026) ═══
//
// Antes eran varias llamadas sueltas —cerrar, borrar un pase futuro, abrir, reabrir— y un pase HOY
// borraba sin aviso un pase futuro de varios días a otra obra, antes del alta y fuera de toda
// transacción. Ahora:
//   · lo único automático es cerrar la asignación ABIERTA que cubre el día (con nota);
//   · anular, acortar o correr una fila cargada por una persona no se escribe: se devuelve
//     `requiereConfirmar` y la pantalla ofrece «Confirmar y ajustar»;
//   · todo va en UNA llamada a `asignar_obra_con_cronologia` (SECURITY INVOKER, manda la RLS): si el
//     alta rebota, no queda nada tocado y la persona sigue exactamente como estaba.
//
// El porqué de cada regla (cerrar antes de abrir, `hasta = ayer`, quién puede) está en
// `obraActualActions.ts` y en `planDeObraActual.ts`; no se repite acá.

import { z } from 'zod'
import {
  avisoDeAjustes, planDeCambioDeObra, puedeCambiarObraActual, validarProgramacion,
  type AjusteDeObra, type AsignacionAbierta, type PlanDeObraActual,
} from './planDeObraActual.ts'

export type ResultadoObraActual =
  | { ok: true; mensaje: string }
  | { ok: false; error: string; requiereConfirmar?: AjusteDeObra[] }

type Fila = Record<string, unknown>
type Respuesta<T> = { data: T | null; error: { message: string; code?: string } | null }

/** Lo único que esta acción le pide a PostgREST. Tipar el subconjunto —y no `SupabaseClient`— es
 *  lo que permite que el falso del test sea un objeto común: si le falta un verbo, no compila. */
export interface SupabaseLike {
  from(tabla: string): TablaLike
  rpc(funcion: string, argumentos: Fila): PromiseLike<Respuesta<unknown>>
}

interface TablaLike {
  select(columnas: string): LecturaLike
}

interface LecturaLike {
  eq(columna: string, valor: string): LecturaLike
  in(columna: string, valores: string[]): PromiseLike<Respuesta<Fila[]>>
  /** `hasta is null` — abierta. Es un filtro distinto de `eq`: PostgREST no compara con null. */
  is(columna: string, valor: null): PromiseLike<Respuesta<Fila[]>>
  /** Filtro PostgREST crudo (`hasta.gte.2026-09-14`): las cerradas que todavía cubren el tramo nuevo. */
  or(filtro: string): PromiseLike<Respuesta<Fila[]>>
  maybeSingle(): PromiseLike<Respuesta<Fila>>
}

export interface DepsObraActual {
  supabase: SupabaseLike
  /** El perfil ya leído. `null` es «no hay perfil», y sin rol no se mueve a nadie de obra. */
  perfil: { rol: string | null } | null
  /** `YYYY-MM-DD`. Entra por parámetro: un test que dependiera del reloj se rompería a medianoche. */
  hoy: string
  /** Quién mueve, para la nota que lleva toda fila tocada. */
  usuario?: string | null
  /** Refrescar las pantallas afectadas. Recibe el `persona_id` YA VALIDADO —una de las rutas lleva
   *  el id adentro— y sólo corre cuando algo se escribió de verdad. */
  revalidar?: (personaId: string) => void
}

export const FUNCION_ASIGNAR = 'asignar_obra_con_cronologia'

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
  /** Lo manda sólo el botón «Confirmar y ajustar», después de haber visto la lista. */
  confirmar: z.boolean().optional(),
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

  // LAS FECHAS SE VALIDAN ANTES DE TOCAR NADA, igual que el rol y por lo mismo.
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
  const cerradas = await leerCerradasDesde(supabase, personaId, desde)
  if (cerradas.error) return { ok: false, error: cerradas.error }

  const plan = planDeCambioDeObra({
    abiertas: abiertas.data, cerradas: cerradas.data, destino: obra.destino, hoy, desde, hasta,
  })
  if (plan.sinCambio) return { ok: true, mensaje: plan.acuse }

  const confirmado = parsed.data.confirmar === true
  if (plan.ajustes.length > 0 && !confirmado) {
    return { ok: false, error: avisoDeAjustes(plan.ajustes), requiereConfirmar: plan.ajustes }
  }

  const nota = `ajustada por ${deps.usuario || 'usuario sin perfil'} al asignar `
    + `${obra.destino?.nombre ?? 'Sin obra'} desde ${desde}`
  const { error } = await supabase.rpc(FUNCION_ASIGNAR, argumentosDelCambio(personaId, plan, confirmado, nota))
  if (error) {
    // EL MENSAJE DE LA BASE VA ENTERO, TAMBIÉN EL DEL ÍNDICE ÚNICO: es el único hilo para encontrar la
    // fila que la lectura no vio. Y como es una transacción, se puede decir con certeza que no cambió nada.
    return {
      ok: false,
      error: `No cambié nada: ${error.message}`
        + (error.code === '23505' ? ' (choca con otra asignación vigente a esa obra que la lectura no vio).' : '.')
        + ' La persona sigue como estaba.',
    }
  }
  deps.revalidar?.(personaId)
  return { ok: true, mensaje: plan.acuse }
}

/** Los argumentos de la función SQL. Lo que no es automático viaja sólo si se confirmó. */
function argumentosDelCambio(personaId: string, plan: PlanDeObraActual, confirmado: boolean, nota: string): Fila {
  const de = (efecto: AjusteDeObra['efecto']) => (confirmado ? plan.ajustes.filter((a) => a.efecto === efecto) : [])
  return {
    p_persona: personaId,
    p_cerrar: [...plan.cerrar, ...de('acortar').map((a) => ({ id: a.id, hasta: a.hastaNuevo }))],
    p_anular: de('anular').map((a) => ({ id: a.id })),
    p_recortar: de('recortar').map((a) => ({ id: a.id, desde: a.desdeNuevo })),
    // ROL «INTEGRANTE» Y NADA MÁS: el desplegable contesta una sola pregunta —dónde trabaja hoy— y
    // cuadrilla, actividad y rol se siguen editando desde la solapa Personal de la obra.
    p_altas: [
      ...(plan.abrir ? [{ obra_id: plan.abrir.obra_id, rol: 'integrante', desde: plan.abrir.desde, hasta: plan.abrir.hasta ?? null }] : []),
      // EL REGRESO DEL TRAMO SANDWICH va en la misma transacción: si no entra, tampoco el pase.
      ...(plan.reabrir ? [{ obra_id: plan.reabrir.obra_id, rol: 'integrante', desde: plan.reabrir.desde, hasta: null }] : []),
    ],
    p_nota: nota,
  }
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

/** Nombres de obra por id. Sin catálogo se usa el id: feo, pero el aviso tiene que poder nombrarla. */
async function nombresDeObras(supabase: SupabaseLike, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await supabase.from('obra_canonica').select('id, nombre').in('id', [...new Set(ids)])
  return new Map(((data ?? []) as unknown as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre]))
}

type TramoCerrado = { id: string; obra_id: string; nombre: string; desde: string | null; hasta: string | null }

/** Las asignaciones CON fin que todavía llegan al tramo nuevo. Las abiertas las lee `leerAbiertas`. */
async function leerCerradasDesde(
  supabase: SupabaseLike, personaId: string, desde: string,
): Promise<{ data: TramoCerrado[]; error: string | null }> {
  const { data, error } = await supabase.from('obra_asignacion_vigente')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId).or(`hasta.gte.${desde}`)
  // UNA LECTURA QUE FALLA NO ES «NO TIENE NINGUNA»: seguir dejaría el pase viejo debajo del nuevo.
  if (error) return { data: [], error: `No pude leer sus asignaciones: ${error.message}` }
  // El filtro se repite acá: la base lo aplica, y lo que se decide no depende de que lo haya hecho.
  const filas = ((data ?? []) as unknown as Omit<TramoCerrado, 'nombre'>[])
    .filter((f) => f.hasta != null && f.hasta >= desde)
  const nombres = await nombresDeObras(supabase, filas.map((f) => f.obra_id))
  return { data: filas.map((f) => ({ ...f, nombre: nombres.get(f.obra_id) ?? f.obra_id })), error: null }
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
  const { data, error } = await supabase.from('obra_asignacion_vigente')
    .select('id, obra_id, desde, hasta').eq('persona_id', personaId)
    .is('hasta', null)
  // UNA LECTURA QUE FALLA NO ES «NO TIENE NINGUNA». Seguir con la lista vacía abriría la obra nueva
  // sin cerrar la vieja y dejaría a la persona en dos obras a la vez.
  if (error) return { data: [], error: `No pude leer sus asignaciones: ${error.message}` }
  const filas = (data ?? []) as unknown as { id: string; obra_id: string; desde: string | null }[]
  if (filas.length === 0) return { data: [], error: null }
  const nombres = await nombresDeObras(supabase, filas.map((f) => f.obra_id))
  return {
    data: filas.map((f) => ({ id: f.id, obra_id: f.obra_id, nombre: nombres.get(f.obra_id) ?? f.obra_id, desde: f.desde })),
    error: null,
  }
}

// ASIGNAR DESDE LA OBRA RESPETA LA CRONOLOGÍA DE LA PERSONA — Y NUNCA BORRA LO QUE CARGÓ OTRO.
//
// `asignarPersona` y `asignarCuadrillaAObra` insertaban la fila nueva y nada más: quien estaba en Pisos
// y se sumaba a Quattropani quedaba guardado en las dos. La primera corrección (14/09/2026) cerraba la
// otra obra —bien— pero también REEMPLAZABA Y BORRABA, sin nota, lo que el tramo nuevo tapaba: un alta
// con fecha pasada se llevaba tres filas cargadas por personas (auditoría, mismo día).
//
// La regla ahora (auditoría 14/09/2026):
//   · lo ÚNICO automático es cerrar en D−1 la asignación ABIERTA que cubre D, con nota;
//   · cualquier otro efecto sobre una fila de persona —anular una que el tramo tapa, acortar una
//     cerrada, correr el `desde` de una futura— NO se aplica: se devuelve `requiereConfirmar` con la
//     lista y la pantalla ofrece «Confirmar y ajustar». Confirmado, se ajusta con nota y marca de
//     anulada, nunca con un borrado;
//   · todo va en UNA transacción (`asignar_obra_con_cronologia`, SECURITY INVOKER): si el alta falla,
//     no queda nada tocado.
//
// Qué se cierra o se ajusta lo decide `planDeAsignacion`, la misma regla del cambio de obra y de la
// normalización. Sin `next/*` y con la base por parámetro para que un test vea QUÉ se escribió.
import { planDeAsignacion } from '../../../../orquestador/lib/cronologia-asignaciones.mjs'

type Respuesta<T> = { data: T | null; error: { message: string; code?: string } | null }
type FilaAsignacion = {
  id: string; obra_id: string; desde: string | null; hasta: string | null; creado_en?: string | null
}

/** Lo único que esto le pide a PostgREST. El cliente real se pasa con un cast, como en `obraActualNucleo`. */
export interface SupabaseAsignacion {
  from(tabla: string): {
    select(columnas: string): { eq(columna: string, valor: string): PromiseLike<Respuesta<FilaAsignacion[]>> }
  }
  rpc(funcion: string, argumentos: Record<string, unknown>): PromiseLike<Respuesta<unknown>>
}

export interface AltaDeAsignacion {
  obra_id: string
  desde: string
  hasta: string | null
  rol: string
  cuadrilla_id: string | null
  actividad_id: string | null
  notas: string | null
}

/** Una fila de persona que asignar así cambiaría y que no se toca sin confirmar. */
export interface AjustePendiente {
  id: string
  obra_id: string
  desde: string | null
  hasta: string | null
  efecto: 'anular' | 'acortar' | 'recortar'
  /** Cómo quedaría: «hasta 2026-09-13», «desde 2026-09-26», o null si se anula. */
  queda: string | null
}

export interface PlanDeAlta {
  cerrar: { id: string; hasta: string }[]
  altas: Record<string, unknown>[]
  ajustes: AjustePendiente[]
  /** Lo que se escribe SÓLO si se confirmó. */
  confirmados: { cerrar: { id: string; hasta: string }[]; anular: { id: string }[]; recortar: { id: string; desde: string }[] }
}

export type ResultadoDeAlta =
  | { ok: true }
  | { ok: false; error: string; code?: string }
  | { ok: false; error: string; requiereConfirmar: AjustePendiente[] }

export const FUNCION_ASIGNAR = 'asignar_obra_con_cronologia'

/** Lee las asignaciones de la persona y arma qué se escribiría. No escribe. */
export async function planDeAlta(
  supabase: SupabaseAsignacion, personaId: string, alta: AltaDeAsignacion,
): Promise<{ plan: PlanDeAlta } | { error: string }> {
  const lectura = await supabase.from('obra_asignacion_vigente')
    .select('id, obra_id, desde, hasta, creado_en').eq('persona_id', personaId)
  // UNA LECTURA QUE FALLA NO ES «NO TIENE OTRAS OBRAS»: seguir la dejaría en dos obras.
  if (lectura.error) return { error: `No pude leer sus otras obras: ${lectura.error.message}. No se escribió nada.` }
  const filas = lectura.data ?? []
  const porId = new Map(filas.map((f) => [f.id, f]))
  const p = planDeAsignacion(filas, { obra_id: alta.obra_id, desde: alta.desde, hasta: alta.hasta })
  const ajuste = (id: string, efecto: AjustePendiente['efecto'], queda: string | null): AjustePendiente => {
    const f = porId.get(id) as FilaAsignacion
    return { id, obra_id: f.obra_id, desde: f.desde, hasta: f.hasta, efecto, queda }
  }
  return {
    plan: {
      cerrar: p.cerrar.map(({ id, hasta }) => ({ id, hasta })),
      // EL TRAMO QUE SEGUÍA DESPUÉS DEL NUEVO VUELVE AL DÍA SIGUIENTE: es el pase de tres días.
      altas: [alta, ...p.cerrar.flatMap((c) => (c.continua ? [{ ...c.continua, rol: 'integrante' }] : []))],
      ajustes: [
        ...p.reemplazar.map((r) => ajuste(r.id, 'anular', null)),
        ...p.acortar.map((a) => ajuste(a.id, 'acortar', `hasta ${a.hasta}`)),
        ...p.recortar.map((r) => ajuste(r.id, 'recortar', `desde ${r.desde}`)),
      ],
      confirmados: { cerrar: p.acortar, anular: p.reemplazar, recortar: p.recortar },
    },
  }
}

/** Escribe el plan en UNA transacción. Sin confirmar, sólo el cierre automático y el alta. */
export async function aplicarAlta(
  supabase: SupabaseAsignacion, personaId: string, plan: PlanDeAlta, { confirmado, nota }: { confirmado: boolean; nota: string },
): Promise<{ error: string; code?: string } | null> {
  const { error } = await supabase.rpc(FUNCION_ASIGNAR, {
    p_persona: personaId,
    p_cerrar: [...plan.cerrar, ...(confirmado ? plan.confirmados.cerrar : [])],
    p_anular: confirmado ? plan.confirmados.anular : [],
    p_recortar: confirmado ? plan.confirmados.recortar : [],
    p_altas: plan.altas,
    p_nota: nota,
  })
  return error ? { error: error.message, code: error.code } : null
}

/** El aviso que lee quien asignó cuando hay filas de otros que cambiarían. Nada se escribió todavía. */
export function textoDeAjustes(ajustes: AjustePendiente[]): string {
  const lista = ajustes.map((a) => `${a.obra_id} ${a.desde ?? '—'}→${a.hasta ?? 'abierta'} (${a.efecto}${a.queda ? `: ${a.queda}` : ''})`)
  return `Asignar así cambia ${ajustes.length === 1 ? 'una asignación cargada' : `${ajustes.length} asignaciones cargadas`} `
    + `por una persona: ${lista.join('; ')}. No se escribió nada. Si es correcto, tocá «Confirmar y ajustar».`
}

/** La nota que lleva toda fila tocada. */
export const notaDeAjuste = (usuario: string, alta: { obra_id: string; desde: string }) =>
  `ajustada por ${usuario} al asignar ${alta.obra_id} desde ${alta.desde}`

/** Alta de UNA persona: plan, pregunta si hace falta, y escritura atómica. */
export async function asignarConCronologia(
  supabase: SupabaseAsignacion,
  { personaId, alta, confirmado, usuario }: { personaId: string; alta: AltaDeAsignacion; confirmado: boolean; usuario: string },
): Promise<ResultadoDeAlta> {
  const leido = await planDeAlta(supabase, personaId, alta)
  if ('error' in leido) return { ok: false, error: leido.error }
  if (leido.plan.ajustes.length > 0 && !confirmado) {
    return { ok: false, error: textoDeAjustes(leido.plan.ajustes), requiereConfirmar: leido.plan.ajustes }
  }
  const fallo = await aplicarAlta(supabase, personaId, leido.plan, { confirmado, nota: notaDeAjuste(usuario, alta) })
  return fallo ? { ok: false, error: `No se escribió nada: ${fallo.error}`, code: fallo.code } : { ok: true }
}

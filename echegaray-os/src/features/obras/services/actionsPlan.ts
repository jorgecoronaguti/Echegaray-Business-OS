'use server'

// ESCRIBIR EL PLAN — las tres acciones que convierten las pantallas 07 y 08 de visores en editores.
//
// Hasta hoy las dos SIMULABAN: el Gantt dejaba arrastrar una barra y mostraba qué se llevaba puesto,
// la 08 dejaba mover el stepper y mostraba en cuántos días terminaba cada frente, y las dos
// terminaban en un botón apagado. La consecuencia no era «falta una feature»: el jefe de obra hacía
// la cuenta en la pantalla y después la escribía a mano en otro lado, así que el plan del sistema y
// el plan de la obra eran dos cosas distintas.
//
// ═══ LAS CUATRO REGLAS QUE NO SE NEGOCIAN ═══
//
// 1. LA LÍNEA BASE NO SE TOCA. Mover el plan cambia `inicio_plan`/`fin_plan` y NADA más.
//    `inicio_base`/`fin_base` son contra qué se mide el desvío: si se movieran al reprogramar, el
//    desvío daría siempre cero y el módulo entero perdería sentido. Sólo `sellarBaseline` los
//    escribe, y una sola vez.
// 2. LO QUE SE ESCRIBE SALE DE LA SIMULACIÓN QUE SE MOSTRÓ. `movimientosDelArrastre` corre el mismo
//    motor que dibujó el popover. Recalcular las fechas acá «a mano» sería una segunda definición
//    del plan, y la pantalla podría prometer una cosa y la base guardar otra.
// 3. LOS IDS VIENEN DEL NAVEGADOR Y NO SE CREEN. Todo `update` va acotado por `.eq('obra_id', …)`
//    además de por el id, y entra con la sesión del usuario: la RLS es la última palabra.
// 4. LO QUE ESCRIBE UNA PERSONA QUEDA `editado_a_mano`. Sin esa marca, la próxima corrida del
//    sincronizador de Drive pisa el plan recién reprogramado con lo que dice el Sheet.
//
// ═══ QUIÉN PUEDE ═══
//
// `esAdministracion`, que desde el 19/08 incluye al jefe de obra. Mover el plan de una obra no es
// mirarla: corre fechas de entrega. El rol de campo ve su cronograma y no lo reprograma. La guarda
// vive acá y no sólo en la pantalla, porque la misma acción se puede invocar sin pasar por el botón.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import type { Rol } from '@/features/auth/types'
import { getInsumosCronograma } from './cronogramaObraService'
import { armarCronograma, movimientosDelArrastre } from './cronogramaMotor'
import { claveDeFrente, frentesDe } from './dotacion'

/**
 * El resultado tiene la forma que `FormAccion` ya sabe mostrar (`ResultadoAccion`), con `tocadas`
 * de más: cuántas filas se escribieron DE VERDAD. El mensaje se arma con ese número y no con la
 * intención — una escritura de siete filas que tocó tres tiene que decir tres.
 */
export type ResultadoPlan =
  | { ok: true; tocadas: number; mensaje: string }
  | { ok: false; error: string }

/** Falla CERRADA: sin perfil legible no se escribe el plan. Un error de lectura del rol no es un
 *  permiso concedido. */
async function puedeEditarElPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const perfil = await getPerfilActual(supabase)
  if (perfil.error || !perfil.data) return false
  return esAdministracion((perfil.data as { rol?: Rol | null }).rol ?? null)
}

const SIN_PERMISO = 'Reprogramar el plan de la obra es de Administración y de la jefatura de obra.'

// ── MOVER UNA ACTIVIDAD EN EL GANTT (07) ─────────────────────────────────────

const moverSchema = z.object({
  actividadId: z.string().uuid('No reconozco esa actividad'),
  // El mismo tope que la pantalla: un `mover=99999` no puede hacer que el motor recorra un siglo.
  delta: z.coerce.number().int().min(-365).max(365).refine((n) => n !== 0, 'Mover 0 días no es un cambio'),
  resecuenciar: z.boolean(),
})

/**
 * MOVER UNA ACTIVIDAD `delta` DÍAS HÁBILES, con o sin arrastrar a las que dependen de ella.
 *
 * `resecuenciar: false` («Mover igual») escribe SÓLO la movida y deja al resto donde está: es
 * legítimo —«esto arranca más tarde y lo demás lo acomodo yo»— y por eso el plan puede quedar
 * inconsistente con sus dependencias a propósito. El motor lo va a seguir dibujando como lo que es.
 *
 * `resecuenciar: true` escribe además las arrastradas, con las fechas que el motor calculó. Ni una
 * fila más: las que el motor no movió no se tocan, porque escribirlas con «su misma fecha» las
 * marcaría `editado_a_mano` y las sacaría del alcance del sincronizador sin que nadie las editara.
 */
export async function moverActividad(
  obraId: string,
  actividadIdCrudo: string,
  deltaCrudo: number,
  form: FormData,
): Promise<ResultadoPlan> {
  const parsed = moverSchema.safeParse({
    actividadId: actividadIdCrudo,
    delta: deltaCrudo,
    resecuenciar: form.get('resecuenciar') === '1',
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { actividadId, delta, resecuenciar } = parsed.data

  const supabase = await createClient()
  if (!await puedeEditarElPlan(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: insumos, error } = await getInsumosCronograma(supabase, obraId)
  if (error || !insumos) return { ok: false, error: error ?? 'no pude leer el cronograma' }
  if (!insumos.actividades.some((a) => a.actividad_id === actividadId)) {
    return { ok: false, error: 'Esa actividad no es de esta obra' }
  }

  const { movimientos, sinPlan } = movimientosDelArrastre(
    insumos, actividadId, delta, { resecuenciar },
  )
  if (sinPlan) {
    return {
      ok: false,
      error: 'Esta actividad no tiene plan calculable: antes hay que cargarle días, o HH con una cuadrilla.',
    }
  }
  if (!movimientos.length) return { ok: false, error: 'El plan quedaría igual: no hay nada que escribir.' }

  // Una por una porque cada una lleva SU fecha. Si una falla se corta y se informa lo que ya se
  // escribió: decir «no se hizo nada» dejaría medio cronograma movido y a nadie buscándolo.
  let tocadas = 0
  for (const m of movimientos) {
    const { error: e } = await supabase.from('obra_actividad')
      .update({ inicio_plan: m.inicio_plan, fin_plan: m.fin_plan, editado_a_mano: true })
      .eq('obra_id', obraId).eq('id', m.id)
    if (e) return { ok: false, error: `Se movieron ${tocadas} y se cortó: ${e.message}` }
    tocadas++
  }

  revalidatePath(`/obras/${obraId}`)
  const arrastradas = tocadas - 1
  return {
    ok: true,
    tocadas,
    mensaje: arrastradas > 0
      ? `${movimientos[0].nombre} se movió ${movimientos[0].dias} días y arrastró ${arrastradas} ${arrastradas === 1 ? 'actividad' : 'actividades'}.`
      : `${movimientos[0].nombre} se movió ${movimientos[0].dias} días. No arrastró a ninguna otra.`,
  }
}

// ── LA DURACIÓN DE UNA ACTIVIDAD (07) ────────────────────────────────────────

const duracionSchema = z.object({
  actividadId: z.string().uuid('No reconozco esa actividad'),
  // El vacío BORRA la duración planificada, y es una respuesta legítima: «esto todavía no se sabe
  // cuánto dura» se escribe con null, nunca con 0 — 0 días dibuja una barra de ancho cero.
  dias: z.union([z.literal(''), z.coerce.number().int().min(0).max(3650)]),
})

/**
 * CAMBIAR LOS DÍAS DE PLAN DESDE LA 07. Escribe `dias_plan` y NADA MÁS.
 *
 * ═══ POR QUÉ NO SE REUSA `editarActividad` ═══
 *
 * `editarActividad` valida con el esquema en `partial` pero ESCRIBE todos los campos del esquema:
 * lo que no viene en el FormData se guarda como null. Mandarle un formulario con sólo la duración
 * le borraría a la actividad las fechas, las HH plan, el responsable, la cuadrilla y el comentario
 * — sin un solo error y sin que nadie lo pida. Por eso acá hay una acción angosta en vez de un
 * formulario recortado: la que existe no admite ser usada por partes.
 */
export async function editarDuracion(
  obraId: string,
  actividadIdCrudo: string,
  form: FormData,
): Promise<ResultadoPlan> {
  const parsed = duracionSchema.safeParse({
    actividadId: actividadIdCrudo,
    dias: String(form.get('dias') ?? '').trim(),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { actividadId, dias } = parsed.data

  const supabase = await createClient()
  if (!await puedeEditarElPlan(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data, error } = await supabase.from('obra_actividad')
    .update({ dias_plan: dias === '' ? null : dias, editado_a_mano: true })
    .eq('obra_id', obraId).eq('id', actividadId).eq('archivada', false)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!(data ?? []).length) return { ok: false, error: 'Esa actividad no es de esta obra' }

  revalidatePath(`/obras/${obraId}`)
  return {
    ok: true,
    tocadas: 1,
    mensaje: dias === ''
      ? 'La duración quedó sin cargar: la actividad vuelve a «sin plan».'
      : `La actividad dura ${dias} ${dias === 1 ? 'día' : 'días'} de plan.`,
  }
}

// ── APLICAR LA DOTACIÓN SIMULADA AL PLAN (08) ────────────────────────────────

const dotacionSchema = z.object({
  // Mismo formato y mismo tope que la URL de la 08: `frente~n`, 0–99.
  pares: z.array(z.string()).min(1, 'No hay ninguna dotación elegida').max(200),
})

/**
 * GUARDAR LA DOTACIÓN SIMULADA COMO LA DOTACIÓN PREVISTA DE CADA FRENTE.
 *
 * ═══ QUÉ ES `dotacion_prevista` Y POR QUÉ ESTO IMPORTA ═══
 *
 * No es un adorno de la 08: `duracionDe` la usa como capacidad cuando la actividad no tiene cuadrilla
 * asignada. O sea que aplicar la dotación al plan **cambia la duración calculada de las actividades
 * del frente y, con ella, el fin de obra**. Por eso se escribe con nombre y apellido —cuántas
 * actividades de qué frentes— y no con un «listo».
 *
 * Los frentes se recalculan ACÁ, del lado del servidor, con la misma `frentesDe` que dibujó la
 * pantalla. Recibir del navegador la lista de actividades de cada frente sería confiar en el
 * navegador para decidir a quién se le escribe.
 *
 * Un frente sin dotación elegida (0) NO se escribe: cero personas no es un plan, es la ausencia de
 * uno, y guardarlo dejaría la actividad «sin plan» sin que nadie lo haya decidido.
 */
export async function aplicarDotacionAlPlan(
  obraId: string,
  form: FormData,
): Promise<ResultadoPlan> {
  const parsed = dotacionSchema.safeParse({ pares: form.getAll('dot').map(String) })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const elegidas = dotacionesDeLosPares(parsed.data.pares)
  if (!Object.keys(elegidas).length) return { ok: false, error: 'No hay ninguna dotación elegida' }

  const supabase = await createClient()
  if (!await puedeEditarElPlan(supabase)) return { ok: false, error: SIN_PERMISO }

  const { data: insumos, error } = await getInsumosCronograma(supabase, obraId)
  if (error || !insumos) return { ok: false, error: error ?? 'no pude leer la obra' }

  const crono = armarCronograma(insumos, 'proyeccion')
  // El tope del frente ya lo recorta `frentesDe`: la dotación que se guarda es la que la pantalla
  // mostró, no la que pidió la URL. Guardar 99 en un frente que topa en 3 escribiría un plan que la
  // obra no puede ejecutar.
  const frentes = frentesDe(crono.actividades, { dotaciones: elegidas, jornada: crono.jornada })
  const porClave = new Map(frentes.map((f) => [f.clave, f]))

  const aEscribir = new Map<string, number>()
  for (const a of crono.actividades) {
    if (a.tipo === 'resumen') continue
    const clave = claveDeFrente(a)
    if (!(clave in elegidas)) continue
    const dotacion = porClave.get(clave)?.dotacion ?? 0
    if (dotacion <= 0) continue
    aEscribir.set(a.actividad_id, dotacion)
  }
  if (!aEscribir.size) {
    return { ok: false, error: 'Ningún frente elegido tiene gente asignada: 0 personas no es un plan.' }
  }

  let tocadas = 0
  for (const [id, dotacion] of aEscribir) {
    const { error: e } = await supabase.from('obra_actividad')
      .update({ dotacion_prevista: dotacion, editado_a_mano: true })
      .eq('obra_id', obraId).eq('id', id)
    if (e) return { ok: false, error: `Se aplicaron ${tocadas} y se cortó: ${e.message}` }
    tocadas++
  }

  revalidatePath(`/obras/${obraId}`)
  const nFrentes = new Set([...aEscribir.keys()].map((id) => {
    const a = crono.actividades.find((x) => x.actividad_id === id)
    return a ? claveDeFrente(a) : ''
  })).size
  return {
    ok: true,
    tocadas,
    mensaje: `Dotación aplicada a ${tocadas} ${tocadas === 1 ? 'actividad' : 'actividades'} de ${nFrentes} ${nFrentes === 1 ? 'frente' : 'frentes'}. La duración del plan se recalcula con esa gente.`,
  }
}

/** `Piso~4` → `{ Piso: 4 }`. Misma lectura que la URL de la 08, con el mismo tope: la pantalla y la
 *  escritura no pueden entender distinto el mismo texto. */
function dotacionesDeLosPares(pares: string[]): Record<string, number> {
  const salida: Record<string, number> = {}
  for (const par of pares) {
    const i = par.lastIndexOf('~')
    if (i <= 0) continue
    const n = Number(par.slice(i + 1))
    if (!Number.isInteger(n) || n < 0 || n > 99) continue
    salida[par.slice(0, i)] = n
  }
  return salida
}

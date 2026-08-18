'use server'

// PONER UNA OBRA EN MARCHA SIN EDITAR 344 ACTIVIDADES UNA POR UNA.
//
// ═══ EL PROBLEMA QUE RESUELVEN ESTAS TRES ACCIONES ═══
//
// Medido en la base el 19/08/2026: de 344 actividades cargadas, 0 tienen línea base, 0 tienen HH
// plan y 0 tienen responsable. El módulo estaba entero y la obra seguía sin poder configurarse,
// porque la única puerta de escritura era el panel lateral: una actividad, un formulario, una vuelta
// al servidor. 344 veces eso no lo hace nadie, y por eso el dato seguía en cero.
//
// NO SE INVENTA NADA. Estas acciones no rellenan un valor por defecto ni completan lo que falta: una
// persona elige QUÉ actividades y QUÉ valor, y esto lo escribe. Lo que no se puede escribir con
// certeza queda afuera y se informa — por eso el resultado es `{ tocadas, salteadas, motivo }` y no
// un «listo».
//
// ═══ LAS CUATRO GUARDAS ═══
//
// 1. LOS IDS VIENEN DEL NAVEGADOR Y NO SE CREEN. Todo `update` va acotado por `.eq('obra_id', …)`
//    además de por `.in('id', …)`: un id pegado a mano de la obra de al lado no escribe nada. La
//    escritura entra con la sesión del usuario, nunca con service role, así que el RLS es la última
//    palabra.
// 2. LA LÍNEA BASE NO SE PISA SIN QUE ALGUIEN LO PIDA. El baseline es contra qué se mide el desvío:
//    re-sellarlo en silencio deja el desvío en cero y borra la medición sin un solo error. Sólo se
//    pisa con `resellar` explícito, y la pantalla lo pone detrás de una casilla aparte.
// 3. SÓLO SE SELLA LO QUE TIENE LAS DOS FECHAS. Un baseline con el fin en null no mide nada:
//    `desvioDias` necesita `fin_base`. Las que tienen una sola fecha quedan afuera declaradas.
// 4. LO QUE TOCA UNA PERSONA QUEDA `editado_a_mano`, igual que en `editarActividad`: sin esa marca,
//    la próxima corrida del sincronizador de Drive pisa el responsable y las HH recién cargadas.
//
// ═══ CÓMO CONVIVE CON `sellarBaseline` (el de toda la obra) ═══
//
// `actions.ts` tiene un sellado de OBRA que corre una sola vez y después se niega: es el primer
// sello, el que congela el plan aprobado completo. Éste es distinto y no lo reemplaza: sella una
// SELECCIÓN, y por defecto sólo las que todavía no tienen base. Es lo que hacía falta para las
// actividades que nacen después del primer sello —hoy imposibles de sellar— y para la obra que se
// configura por partes. La regla de fondo es la misma en los dos: una línea base ya puesta no se
// mueve salvo que alguien lo pida por escrito.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { repartirHH } from './reparto'

/**
 * El resultado de una acción masiva. `tocadas` y `salteadas` son el EFECTO, no el intento: salen de
 * contar filas escritas y filas descartadas, y la pantalla muestra los dos números.
 */
export type ResultadoMasivo =
  | { ok: true; tocadas: number; salteadas: number; motivo: string | null }
  | { ok: false; error: string }

/** El tope no es capricho: `in (…)` con miles de uuid arma una consulta que Postgres no agradece.
 *  La obra más grande tiene 344 actividades; 2.000 deja margen sin dejar la puerta abierta. */
const idsSchema = z.array(z.string().uuid()).min(1, 'No hay ninguna actividad seleccionada').max(2000)

/** Lee las filas de ESTA obra que están entre las seleccionadas. Lo que no vuelve, no existe para
 *  esta obra: no se avisa fila por fila, pero tampoco se escribe sobre ella. */
async function actividadesDe<T extends string>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  obraId: string,
  ids: string[],
  columnas: T,
) {
  return supabase.from('obra_actividad')
    .select(columnas)
    .eq('obra_id', obraId)
    .eq('archivada', false)
    .in('id', ids)
}

// ── RESPONSABLE ──────────────────────────────────────────────────────────────

/**
 * ASIGNAR UNA PERSONA A TODAS LAS SELECCIONADAS.
 *
 * La persona se verifica contra `personas` antes de escribir: la clave foránea la rechazaría igual,
 * pero devolvería el error de Postgres en crudo a una pantalla que el jefe de obra no puede leer.
 *
 * `personaId` vacío QUITA el responsable, y eso es una acción legítima —«esto lo saqué de su
 * cargo»—, no un valor por defecto: la pantalla la ofrece como una opción escrita, no como el estado
 * inicial del desplegable.
 */
export async function asignarResponsableMasivo(
  obraId: string,
  ids: string[],
  personaId: string,
): Promise<ResultadoMasivo> {
  const parsed = z.object({
    ids: idsSchema,
    personaId: z.union([z.string().uuid('Elegí una persona del legajo'), z.literal('')]),
  }).safeParse({ ids, personaId })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  if (parsed.data.personaId) {
    const { data: p } = await supabase.from('personas').select('id').eq('id', parsed.data.personaId).maybeSingle()
    if (!p) return { ok: false, error: 'Esa persona no está en el legajo' }
  }

  const { data, error } = await supabase.from('obra_actividad')
    .update({ responsable_id: parsed.data.personaId || null, editado_a_mano: true })
    .eq('obra_id', obraId)
    .eq('archivada', false)
    .in('id', parsed.data.ids)
    .select('id')
  if (error) return { ok: false, error: error.message }

  const tocadas = (data ?? []).length
  const salteadas = parsed.data.ids.length - tocadas
  revalidatePath(`/obras/${obraId}`)
  return {
    ok: true,
    tocadas,
    salteadas,
    motivo: salteadas ? 'archivadas o de otra obra' : null,
  }
}

// ── HH PLAN ──────────────────────────────────────────────────────────────────

const hhSchema = z.discriminatedUnion('modo', [
  z.object({ modo: z.literal('fijo'), valor: z.coerce.number().positive('Las HH por actividad tienen que ser mayores que cero') }),
  z.object({
    modo: z.literal('total'),
    valor: z.coerce.number().positive('El total de HH tiene que ser mayor que cero'),
    criterio: z.enum(['proporcional', 'iguales']),
  }),
])
/** LO QUE MANDA LA PANTALLA, declarado UNA vez y consumido por las dos puntas. Derivarlo con
 *  `z.input` dejaba `valor: unknown` —`z.coerce` acepta cualquier cosa— y el componente podía
 *  mandar un texto sin que el compilador dijera nada. */
export type EntradaHH =
  | { modo: 'fijo'; valor: number }
  | { modo: 'total'; valor: number; criterio: 'proporcional' | 'iguales' }

/**
 * CARGAR HH PLAN — fijo por actividad, o un total repartido entre las seleccionadas.
 *
 * El reparto lo hace `repartirHH`, que vive aparte porque es lo que se puede equivocar en silencio.
 * Acá sólo se escribe lo que esa función devolvió, fila por fila: son valores distintos por
 * actividad, así que no hay un `update` masivo posible. En el modo `fijo` sí lo hay, y se usa: 344
 * viajes al servidor por un mismo número serían 344 oportunidades de cortarse a la mitad.
 *
 * NUNCA ESCRIBE 0. Poner HH plan en cero dice «esta actividad no lleva mano de obra», que es una
 * afirmación; «todavía no sé» se escribe dejándola en null, y para eso no hace falta esta acción.
 */
export async function cargarHHPlanMasivo(
  obraId: string,
  ids: string[],
  entrada: EntradaHH,
): Promise<ResultadoMasivo> {
  const idsOk = idsSchema.safeParse(ids)
  if (!idsOk.success) return { ok: false, error: idsOk.error.issues[0].message }
  const parsed = hhSchema.safeParse(entrada)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data

  const supabase = await createClient()

  if (d.modo === 'fijo') {
    const { data, error } = await supabase.from('obra_actividad')
      .update({ hh_plan: d.valor, editado_a_mano: true })
      .eq('obra_id', obraId).eq('archivada', false).in('id', idsOk.data)
      .select('id')
    if (error) return { ok: false, error: error.message }
    const tocadas = (data ?? []).length
    revalidatePath(`/obras/${obraId}`)
    return {
      ok: true,
      tocadas,
      salteadas: idsOk.data.length - tocadas,
      motivo: idsOk.data.length - tocadas ? 'archivadas o de otra obra' : null,
    }
  }

  const { data: acts, error: eLectura } = await actividadesDe(supabase, obraId, idsOk.data, 'id, inicio_plan, fin_plan')
  if (eLectura) return { ok: false, error: eLectura.message }
  const filas = (acts ?? []) as unknown as { id: string; inicio_plan: string | null; fin_plan: string | null }[]
  if (!filas.length) return { ok: false, error: 'Ninguna de las actividades seleccionadas es de esta obra' }

  const reparto = repartirHH(filas, d.valor, d.criterio)
  if (reparto.error) return { ok: false, error: reparto.error }

  // Se escribe una por una porque cada una lleva SU número. Si una falla se corta y se informa lo
  // que ya se escribió: mentir con «no se hizo nada» dejaría la mitad cargada y a nadie buscándola.
  let tocadas = 0
  for (const a of reparto.asignaciones) {
    const { error } = await supabase.from('obra_actividad')
      .update({ hh_plan: a.hh, editado_a_mano: true })
      .eq('obra_id', obraId).eq('id', a.id)
    if (error) return { ok: false, error: `Se cargaron ${tocadas} y se cortó: ${error.message}` }
    tocadas++
  }
  revalidatePath(`/obras/${obraId}`)

  const sinFechas = reparto.fuera.length
  const ajenas = idsOk.data.length - filas.length
  const motivos: string[] = []
  if (sinFechas) motivos.push(`${sinFechas} sin inicio y fin de plan`)
  if (ajenas) motivos.push(`${ajenas} archivadas o de otra obra`)
  return {
    ok: true,
    tocadas,
    salteadas: sinFechas + ajenas,
    motivo: motivos.length ? motivos.join(' · ') : null,
  }
}

// ── LÍNEA BASE ───────────────────────────────────────────────────────────────

/**
 * SELLAR LA LÍNEA BASE DE LAS SELECCIONADAS: copia `inicio_plan`/`fin_plan` a `inicio_base`/
 * `fin_base` y estampa `sellada_en`.
 *
 * ═══ POR QUÉ NO PISA LO YA SELLADO ═══
 *
 * El baseline es lo único contra lo que se mide el desvío de plazo. Una actividad que se atrasó
 * quince días, re-sellada, vuelve a decir «en fecha»: no hay error, no hay excepción, sólo una
 * medición que desapareció. Por eso lo ya sellado se saltea y se INFORMA cuántas fueron, y sólo se
 * pisa cuando alguien marcó `resellar` — que en la pantalla es una casilla aparte, con su
 * advertencia escrita al lado.
 *
 * `sellada_en` se vuelve a estampar al re-sellar: la fecha del sello tiene que decir cuándo se
 * congeló ESTE plan, no el anterior.
 */
export async function sellarBaselineMasivo(
  obraId: string,
  ids: string[],
  resellar: boolean,
): Promise<ResultadoMasivo> {
  const parsed = z.object({ ids: idsSchema, resellar: z.boolean() }).safeParse({ ids, resellar })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: acts, error: eLectura } = await actividadesDe(
    supabase, obraId, parsed.data.ids, 'id, inicio_plan, fin_plan, inicio_base, fin_base, sellada_en',
  )
  if (eLectura) return { ok: false, error: eLectura.message }
  const filas = (acts ?? []) as unknown as {
    id: string; inicio_plan: string | null; fin_plan: string | null
    inicio_base: string | null; fin_base: string | null; sellada_en: string | null
  }[]
  if (!filas.length) return { ok: false, error: 'Ninguna de las actividades seleccionadas es de esta obra' }

  // «Tiene línea base» se pregunta por los TRES campos, no por uno: cualquiera de ellos con valor ya
  // es una medición viva, y la guarda tiene que fallar cerrada.
  const yaTiene = (a: (typeof filas)[number]) => a.inicio_base != null || a.fin_base != null || a.sellada_en != null
  const sinFechas: string[] = []
  const yaSelladas: string[] = []
  const sellables: (typeof filas) = []
  for (const a of filas) {
    if (!a.inicio_plan || !a.fin_plan) sinFechas.push(a.id)
    else if (yaTiene(a) && !parsed.data.resellar) yaSelladas.push(a.id)
    else sellables.push(a)
  }

  if (!sellables.length) {
    const razon = yaSelladas.length && !sinFechas.length
      ? 'Todas las seleccionadas ya tienen línea base. Marcá «re-sellar» si de verdad querés reemplazarla.'
      : 'Ninguna de las seleccionadas tiene inicio y fin de plan: sin las dos fechas no hay plan que congelar.'
    return { ok: false, error: razon }
  }

  const sello = new Date().toISOString()
  let tocadas = 0
  for (const a of sellables) {
    const { error } = await supabase.from('obra_actividad')
      .update({ inicio_base: a.inicio_plan, fin_base: a.fin_plan, sellada_en: sello })
      .eq('obra_id', obraId).eq('id', a.id)
    if (error) return { ok: false, error: `Se sellaron ${tocadas} y se cortó: ${error.message}` }
    tocadas++
  }
  revalidatePath(`/obras/${obraId}`)

  const ajenas = parsed.data.ids.length - filas.length
  const motivos: string[] = []
  if (sinFechas.length) motivos.push(`${sinFechas.length} sin inicio y fin de plan`)
  if (yaSelladas.length) motivos.push(`${yaSelladas.length} ya tenían línea base`)
  if (ajenas) motivos.push(`${ajenas} archivadas o de otra obra`)
  return {
    ok: true,
    tocadas,
    salteadas: sinFechas.length + yaSelladas.length + ajenas,
    motivo: motivos.length ? motivos.join(' · ') : null,
  }
}

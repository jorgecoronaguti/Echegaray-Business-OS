'use server'

// CONVERTIR UNA PARTIDA EN PLAN DE OBRA.
//
// ═══ ACÁ NO VIVE NINGUNA REGLA DE NEGOCIO ═══
//
// «La cantidad se conserva o no genera», «obra chica sin burocracia», «sin análisis se convierte
// igual sin HH», la secuencia dentro del frente y la NO-secuencia entre frentes: todas viven en
// `convertir_partida_a_plan`, en Postgres. La migración lo dice con todas las letras y la razón es
// que la misma llamada entra por la web y mañana por el chat — una regla escrita en el formulario
// sólo protege al formulario.
//
// Lo de acá es: armar el `jsonb` de frentes, llamar, y MOSTRAR EL ERROR DE LA BASE TAL CUAL si
// vuelve uno. Traducirlo a «no se pudo convertir» borraría el único dato útil que trae —cuánto
// suman los frentes y cuánto tiene la partida—.
//
// El chequeo previo que sí se hace es el que la función NO hace: que el presupuesto esté adjudicado
// y congelado. Sin congelar, el plan saldría con el costo VIVO de la base maestra y la línea base
// de la obra se movería sola cada vez que cambia un precio.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { controlDeCierre, type Frente } from './frentes'

export type EstadoAccion = { error: string | null; ok?: boolean; mensaje?: string }
export const INICIAL: EstadoAccion = { error: null }

const metodoSchema = z.enum(['cantidad', 'pasos', 'manual'])

/** Los frentes llegan como pares repetidos del formulario: un nombre y una cantidad por frente. */
function leerFrentes(form: FormData): { frentes: Frente[]; error: string | null } {
  const nombres = form.getAll('frente_nombre').map((v) => String(v).trim())
  const cantidades = form.getAll('frente_cantidad').map((v) => String(v).trim())
  if (nombres.length === 0) return { frentes: [], error: 'No hay frentes que generar' }
  if (nombres.length !== cantidades.length) {
    return { frentes: [], error: 'Los frentes llegaron incompletos: cada uno necesita nombre y cantidad' }
  }
  const frentes: Frente[] = []
  for (let i = 0; i < nombres.length; i += 1) {
    const nombre = nombres[i] || `Frente ${i + 1}`
    const n = Number(cantidades[i].replace(',', '.'))
    if (!Number.isFinite(n)) return { frentes: [], error: `El frente «${nombre}» no tiene una cantidad válida` }
    frentes.push({ nombre, cantidad: n })
  }
  // Dos frentes con el mismo nombre generan dos contenedores indistinguibles en el árbol de la
  // obra, y la `clave` de la conversión —`conv:<partida>:<nombre>`— deja de identificar a uno solo.
  const repetido = frentes.find((f, i) => frentes.findIndex((g) => g.nombre === f.nombre) !== i)
  if (repetido) return { frentes: [], error: `Hay dos frentes llamados «${repetido.nombre}»` }
  return { frentes, error: null }
}

export async function convertirPartida(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const partida_id = String(form.get('partida_id') ?? '')
  const cotizacion_id = String(form.get('cotizacion_id') ?? '')
  if (!z.string().uuid().safeParse(partida_id).success) return { error: 'Falta la partida' }

  const plantillaCruda = String(form.get('plantilla_id') ?? '').trim()
  const plantilla_id = plantillaCruda === '' ? null : plantillaCruda
  if (plantilla_id && !z.string().uuid().safeParse(plantilla_id).success) {
    return { error: 'Esa plantilla no existe' }
  }
  const metodoCrudo = String(form.get('metodo') ?? '').trim()
  const metodo = metodoCrudo === '' ? null : metodoSchema.safeParse(metodoCrudo).data ?? null
  if (metodoCrudo !== '' && metodo === null) return { error: 'Ese método de medición no existe' }

  const { frentes, error: eF } = leerFrentes(form)
  if (eF) return { error: eF }

  let c
  try {
    c = await createClient()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'No pude conectar con la base' }
  }

  // 1 · el presupuesto tiene que estar adjudicado, congelado y con obra. Esto NO lo controla la
  //     función: es una decisión de gestión, no del modelo de datos.
  const { data: cab, error: eC } = await c.from('cotizaciones')
    .select('estado, congelada_en, obra_canonica_id').eq('id', cotizacion_id).maybeSingle()
  if (eC) return { error: eC.message }
  if (!cab) return { error: 'No encontré el presupuesto, o no tenés permiso para verlo.' }
  if (cab.estado !== 'adjudicada') return { error: 'El presupuesto todavía no está adjudicado.' }
  if (!cab.congelada_en) return { error: 'Congelá el presupuesto antes de convertir: el plan sale del costo que se ofertó.' }
  const obra_id = String(form.get('obra_id') ?? cab.obra_canonica_id ?? '').trim()
  if (!obra_id) return { error: 'Falta la obra: las actividades se crean dentro de una obra.' }

  // 2 · el control de cierre, para que el error llegue en castellano y con la cuenta hecha. Si por
  //     lo que sea pasara de largo, la función lo rechaza igual y sin generar nada: es la autoridad.
  const { data: partida, error: eP } = await c.from('cotizacion_partida')
    .select('cantidad').eq('id', partida_id).maybeSingle()
  if (eP) return { error: eP.message }
  const control = controlDeCierre(frentes, partida?.cantidad == null ? null : Number(partida.cantidad))
  if (!control.cierra) return { error: control.motivo! }

  const { data, error } = await c.rpc('convertir_partida_a_plan', {
    p_partida_id: partida_id,
    p_obra_id: obra_id,
    p_frentes: frentes.map((f) => ({ nombre: f.nombre, cantidad: f.cantidad })),
    p_plantilla_id: plantilla_id,
    p_metodo: metodo,
  })
  // EL ERROR DE LA BASE, TAL CUAL. Es el que dice cuánto suman los frentes y cuánto tiene la partida.
  if (error) return { error: error.message }

  const r = (data ?? {}) as { frentes?: number; actividades?: number; hh_total?: number | null; sin_analisis?: boolean }
  revalidatePath(`/presupuestos/${cotizacion_id}`, 'layout')
  revalidatePath(`/obras/${obra_id}`, 'layout')

  // El mensaje dice lo que quedó, incluido lo que NO quedó: una partida sin análisis genera el plan
  // sin HH, y eso es deuda de carga que alguien tiene que ver, no un detalle.
  const horas = r.sin_analisis || r.hh_total == null
    ? 'sin HH: la partida no tiene análisis cargado'
    : `${Math.round(Number(r.hh_total)).toLocaleString('es-AR')} HH`
  return {
    error: null, ok: true,
    mensaje: `${r.actividades ?? 0} actividades en ${r.frentes ?? 0} frente${(r.frentes ?? 0) === 1 ? '' : 's'} · ${horas}`,
  }
}

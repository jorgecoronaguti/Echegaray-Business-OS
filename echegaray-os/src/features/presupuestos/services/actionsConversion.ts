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
import { controlDeCierre, controlDeFechas, type Frente } from './frentes'
// Ver `./accion`: un archivo `'use server'` no puede exportar una constante.
import type { EstadoAccion } from './accion'


const metodoSchema = z.enum(['cantidad', 'pasos', 'manual'])

/** Un entero opcional del formulario: vacío es «no lo declaró», nunca cero. */
const enteroOpcional = z.string().trim().transform((v) => (v === '' ? null : Number(v)))
  .refine((n) => n === null || (Number.isInteger(n) && n > 0), 'Tiene que ser un número entero de personas')

const fechaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va como AAAA-MM-DD')

/**
 * Los frentes llegan como listas paralelas del formulario: nombre, cantidad, inicio, dotación y
 * tope, uno por frente. El inicio es OBLIGATORIO y la validación está también en la base — acá se
 * comprueba para que el mensaje llegue nombrando el frente y no como una excepción de Postgres.
 */
function leerFrentes(form: FormData): { frentes: Frente[]; error: string | null } {
  const nombres = form.getAll('frente_nombre').map((v) => String(v).trim())
  const cantidades = form.getAll('frente_cantidad').map((v) => String(v).trim())
  const inicios = form.getAll('frente_inicio').map((v) => String(v).trim())
  const dotaciones = form.getAll('frente_dotacion').map((v) => String(v).trim())
  const topes = form.getAll('frente_tope').map((v) => String(v).trim())
  if (nombres.length === 0) return { frentes: [], error: 'No hay frentes que generar' }
  if (nombres.length !== cantidades.length || nombres.length !== inicios.length) {
    return { frentes: [], error: 'Los frentes llegaron incompletos: cada uno necesita nombre, cantidad y fecha de inicio' }
  }
  const frentes: Frente[] = []
  for (let i = 0; i < nombres.length; i += 1) {
    const nombre = nombres[i] || `Frente ${i + 1}`
    const n = Number(cantidades[i].replace(',', '.'))
    if (!Number.isFinite(n)) return { frentes: [], error: `El frente «${nombre}» no tiene una cantidad válida` }

    const fecha = fechaSchema.safeParse(inicios[i])
    if (!fecha.success) {
      return { frentes: [], error: `El frente «${nombre}» no tiene fecha de inicio: sin fecha se crearían actividades que parecen planificadas y no lo están` }
    }
    const dot = enteroOpcional.safeParse(dotaciones[i] ?? '')
    if (!dot.success) return { frentes: [], error: `La dotación del frente «${nombre}» no es un número de personas` }
    const tope = enteroOpcional.safeParse(topes[i] ?? '')
    if (!tope.success) return { frentes: [], error: `El tope del frente «${nombre}» no es un número de personas` }

    frentes.push({ nombre, cantidad: n, inicio: fecha.data, dotacion: dot.data, tope: tope.data })
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
  const fechas = controlDeFechas(frentes)
  if (!fechas.ok) return { error: fechas.motivo! }

  const { data, error } = await c.rpc('convertir_partida_a_plan', {
    p_partida_id: partida_id,
    p_obra_id: obra_id,
    p_frentes: frentes.map((f) => ({
      nombre: f.nombre, cantidad: f.cantidad, inicio: f.inicio,
      dotacion: f.dotacion ?? null, tope: f.tope ?? null,
    })),
    p_plantilla_id: plantilla_id,
    p_metodo: metodo,
  })
  // EL ERROR DE LA BASE, TAL CUAL. Es el que dice cuánto suman los frentes y cuánto tiene la partida.
  if (error) return { error: error.message }

  const r = (data ?? {}) as {
    frentes?: number; actividades?: number; hh_total?: number | null; sin_analisis?: boolean
    subcontratada?: boolean; paquete_sin_precio?: boolean | null; sin_dotacion?: boolean
    fechas?: string; desde?: string | null; hasta?: string | null
  }
  revalidatePath(`/presupuestos/${cotizacion_id}`, 'layout')
  revalidatePath(`/obras/${obra_id}`, 'layout')

  // El mensaje dice lo que quedó, incluido lo que NO quedó: una partida sin análisis genera el plan
  // sin HH, y un plan sin dotación sale con inicio y sin fin. Las dos son deuda que alguien tiene
  // que ver, no un detalle.
  const partes: string[] = [
    `${r.actividades ?? 0} actividades en ${r.frentes ?? 0} frente${(r.frentes ?? 0) === 1 ? '' : 's'}`,
  ]
  if (r.subcontratada) {
    partes.push('paquete subcontratado creado, sin HH propias')
    if (r.paquete_sin_precio) partes.push('el paquete quedó SIN precio: cargalo desde la obra')
  } else if (r.sin_analisis || r.hh_total == null) {
    partes.push('sin HH: la partida no tiene análisis cargado')
  } else {
    partes.push(`${Math.round(Number(r.hh_total)).toLocaleString('es-AR')} HH`)
  }
  if (r.fechas) partes.push(`fechas ${r.fechas}`)

  return { error: null, ok: true, mensaje: partes.join(' · ') }
}

'use server'

// LAS HORAS TRABAJADAS — la punta REAL del plan contra real de HH.
//
// ═══ EL GRANO CANÓNICO (19/08/2026) ═══
//
// El dueño: *"Cada imputación es `persona_id · fecha · obra_id · actividad_id opcional · horas ·
// observación opcional`"*. Hasta hoy la tabla guardaba `trabajador_o_cuadrilla` en TEXTO LIBRE y la
// SEMANA, heredados del Sheet de JORNALES, y el cruce persona↔horas se hacía comparando nombres
// normalizados: alcanzaba para pintar una columna y no alcanzaba para nada más — con un apodo, una
// tilde o un segundo nombre, las horas de esa persona desaparecían de su ficha sin un error.
//
// Ahora la fila apunta a `personas.id` y al DÍA. `fecha_inicio_semana` sigue existiendo y sigue
// siendo `not null` —es el grano de las 19 filas históricas y de `obra_hh_resumen`— pero ya NO se
// pide: la deriva el trigger `registros_hh_normalizar` desde la fecha. Pedirle el lunes a quien
// carga un martes es pedirle que calcule a mano una clave única.
//
// ═══ LO QUE ESTA ACCIÓN SIGUE SIN HACER ═══
//
// No calcula costo. `horas × tarifa` no se guarda acá: el costo de mano de obra ya se registra en su
// propia fuente y valorizarlo también acá crearía la segunda versión del mismo peso.
// Tampoco es un fichaje de entrada/salida: para el MVP se trabaja por DURACIÓN.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import { leerReparto, totalDelReparto } from './repartoHH'
import { TIPOS_HORA, esTipoHora } from './tipoHora'

const HORAS = z.coerce.number()
  .positive('Las horas tienen que ser mayores que cero')
  .max(24, 'En un día no se pueden trabajar más de 24 horas')

// LA CLASE DE HORA VIAJA CON LA HORA. Sin default en el schema no: `normal` es lo que se carga el
// 95% de los días y exigirlo en cada envío sólo agrega una forma de que falle.
const TIPO = z.enum(TIPOS_HORA).default('normal')

const imputacionSchema = z.object({
  persona_id: z.string().uuid('Elegí a quién le imputás las horas'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  // Opcional a propósito: no toda obra tiene el cronograma cargado, y exigir una actividad
  // obligaría a inventar una para poder registrar horas que sí se trabajaron.
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  horas: HORAS,
  tipo_hora: TIPO,
  notas: z.string().trim().max(300).optional(),
  // ═══ LA HORA IMPRODUCTIVA LLEVA SU CAUSA (22/08 · E2E Quattropani, §19) ═══
  // El modelo las distingue desde T4500 (la captura del estándar descuenta improductivas y la
  // causa alimenta el aprendizaje), pero ninguna pantalla las escribía: toda hora entraba como
  // productiva y el desvío quedaba sin causa. El CHECK de la base exige causa si es improductiva;
  // acá está la primera línea con su mensaje.
  improductiva: z.union([z.literal('on'), z.literal('')]).optional(),
  causa_desvio: z.string().trim().optional(),
}).refine((d) => d.improductiva !== 'on' || Boolean(d.causa_desvio), {
  message: 'Una hora improductiva lleva su causa: elegila para que el desvío se pueda explicar',
})

const YA_CARGADO =
  'Esa persona ya tiene horas cargadas ese día para esa actividad. Corregí el registro en vez de agregar otro.'

function traducir(error: { code?: string; message: string }): string {
  if (error.code === '23505') return YA_CARGADO
  // El trigger `registros_hh_normalizar` rechaza imputar a una actividad de OTRA obra: su mensaje ya
  // dice cuál es cuál, así que se muestra tal cual en vez de taparlo con un texto genérico.
  return error.message
}

export async function imputarHH(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = imputacionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('registros_hh').insert({
    // El eje canónico y SÓLO el canónico. `obra_id` queda null: es la columna legacy.
    obra_canonica_id: obraId,
    persona_id: d.persona_id,
    actividad_id: d.actividad_id || null,
    fecha: d.fecha,
    // La semana la deriva el trigger. Se manda igual para no depender de un default: la columna es
    // `not null` y un insert sin ella fallaría si el trigger se cayera.
    fecha_inicio_semana: d.fecha,
    horas: d.horas,
    tipo_hora: d.tipo_hora,
    fuente_legacy: 'web:obra',
    notas: d.notas || null,
    improductiva: d.improductiva === 'on',
    causa_desvio: d.improductiva === 'on' ? d.causa_desvio : null,
  })
  if (error) return { ok: false, error: traducir(error) }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

const masivaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  actividad_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  tipo_hora: TIPO,
  notas: z.string().trim().max(300).optional(),
})

/**
 * Carga masiva: una obra, un día, y las horas de cada integrante.
 *
 * ═══ POR QUÉ SE CONSULTA ANTES DE INSERTAR ═══
 *
 * Un insert de 15 filas es UNA sentencia: si una sola choca contra la clave única, se caen las
 * quince. En una cuadrilla donde ya se cargó a uno por separado, eso significa no poder cargar a los
 * otros catorce y no saber por quién. Se leen primero los que ya tienen horas ese día, se los saltea
 * y SE DICE cuántos fueron. Saltear en silencio sería peor que fallar.
 */
export async function imputarHHMasivo(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = masivaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const reparto = leerReparto(form.entries())
  if (reparto.length === 0) return { ok: false, error: 'No pusiste horas en ninguna persona.' }

  const supabase = await createClient()
  const actividad = d.actividad_id || null

  // EL REPETIDO SE MIDE POR (persona, día, actividad, TIPO), que es la clave única real desde que
  // existe el tipo de hora: alguien con 8 normales cargadas SÍ puede recibir 2 al 50% el mismo día.
  // Sin el tipo acá, la carga masiva de extras se saltearía a toda la cuadrilla en silencio.
  const tipoDe = (r: { tipo_hora?: string }) => (esTipoHora(r.tipo_hora) ? r.tipo_hora : d.tipo_hora)
  let yaCargados = supabase.from('registros_hh').select('persona_id, tipo_hora')
    .eq('obra_canonica_id', obraId).eq('fecha', d.fecha)
    .in('tipo_hora', [...new Set(reparto.map(tipoDe))])
    .in('persona_id', reparto.map((r) => r.persona_id))
  yaCargados = actividad ? yaCargados.eq('actividad_id', actividad) : yaCargados.is('actividad_id', null)
  const { data: existentes, error: errorLectura } = await yaCargados
  if (errorLectura) return { ok: false, error: errorLectura.message }

  const repetidos = new Set((existentes ?? [])
    .map((f) => `${(f as { persona_id: string }).persona_id}·${(f as { tipo_hora: string }).tipo_hora}`))
  const nuevos = reparto.filter((r) => !repetidos.has(`${r.persona_id}·${tipoDe(r)}`))
  if (nuevos.length === 0) {
    return { ok: false, error: `Las ${reparto.length} personas ya tenían esas horas cargadas ese día.` }
  }

  const { error } = await supabase.from('registros_hh').insert(nuevos.map((r) => ({
    obra_canonica_id: obraId,
    persona_id: r.persona_id,
    actividad_id: actividad,
    fecha: d.fecha,
    fecha_inicio_semana: d.fecha,
    horas: r.horas,
    tipo_hora: tipoDe(r),
    fuente_legacy: 'web:masiva',
    notas: d.notas || null,
  })))
  if (error) return { ok: false, error: traducir(error) }

  revalidatePath(`/obras/${obraId}`)
  const total = totalDelReparto(nuevos)
  return {
    ok: true,
    mensaje: repetidos.size > 0
      ? `${nuevos.length} imputaciones (${total} HH). ${repetidos.size} ya tenían horas ese día y se saltearon.`
      : `${nuevos.length} imputaciones (${total} HH).`,
  }
}

export async function borrarHH(obraId: string, registroId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_canonica_id')` no sobra: sin él, un id de otra obra borraría horas ajenas.
  const { error } = await supabase
    .from('registros_hh').delete().eq('id', registroId).eq('obra_canonica_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

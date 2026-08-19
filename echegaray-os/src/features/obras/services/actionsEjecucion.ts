'use server'

// EJECUCIÓN — el parte diario de una obra. UNA CARGA, MUCHOS EFECTOS.
//
// ═══ QUÉ ES UN PARTE ═══
//
// Lo que pasó un día en una actividad: cuánto se produjo, quiénes trabajaron y cuántas horas. Es un
// HECHO con fecha y NO SE REESCRIBE para representar el acumulado — el acumulado se suma. Es la
// misma regla por la que `registros_hh` guarda las horas de cada día en vez de un total.
//
// ═══ LAS HORAS NO SE ESCRIBEN ACÁ ═══
//
// `obra_ejecucion` no tiene columna de horas ni de personas. Las horas de esa jornada van a
// `registros_hh` —la fuente canónica de tiempo desde el 19/08— llamando a la MISMA acción que usa
// la pestaña Personal. No es una comodidad: si el parte escribiera sus propias horas, la misma hora
// quedaría cargada dos veces y la liquidación futura no sabría cuál contar.
//
// Por eso este archivo hace dos escrituras y no una sola con todo adentro: cada hecho a su fuente.
//
//   +15 m² de mampostería      → obra_ejecucion   → avance de la actividad, acumulado, productividad
//   5 personas × 8 h           → registros_hh     → HH de la actividad, de la obra, de cada persona
//
// ═══ EL PARTE ENTRA AUNQUE LAS HORAS FALLEN ═══
//
// Si la imputación de horas rebota —alguien ya tenía esas horas cargadas ese día—, la producción NO
// se pierde: ya está escrita y se dice qué pasó con las horas. Perder el dato de campo por un
// choque de horas sería cambiar lo importante por lo accesorio.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Resultado } from './actions'
import { imputarHHMasivo } from './actionsHH'
import { leerReparto, totalDelReparto } from './repartoHH'

const parteSchema = z.object({
  actividad_id: z.string().uuid('Elegí la actividad'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elegí el día'),
  // Una u otra según el método de la actividad. Las dos vacías no es un parte: es nada.
  cantidad: z.union([z.coerce.number().min(0, 'La cantidad no puede ser negativa'), z.literal('')]).optional(),
  avance_pct: z.union([
    z.coerce.number().min(0, 'El avance va de 0 a 100').max(100, 'El avance va de 0 a 100'),
    z.literal(''),
  ]).optional(),
  comentario: z.string().trim().max(500).optional(),
})

const vacio = (v: unknown) => v === '' || v === undefined || v === null

/**
 * Registrar la ejecución de un día.
 *
 * El formulario trae el parte y, opcionalmente, el reparto de horas por persona (`hh_<uuid>`), que
 * es exactamente el mismo formato que usa la carga masiva de Personal. Se reenvía tal cual: una
 * segunda implementación de "imputar horas a una cuadrilla" sería la segunda definición de las HH.
 */
export async function registrarEjecucion(obraId: string, form: FormData): Promise<Resultado> {
  const parsed = parteSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  if (vacio(d.cantidad) && vacio(d.avance_pct)) {
    return { ok: false, error: 'Poné la cantidad ejecutada o el avance del día.' }
  }

  const supabase = await createClient()

  // EL MÉTODO DE LA ACTIVIDAD MANDA. Cargar cantidad en una actividad que se mide por porcentaje
  // guardaría un número que después nadie usa para nada, y al revés dejaría el avance quieto
  // mientras alguien carga producción todos los días sin entender por qué no se mueve.
  const { data: act, error: errAct } = await supabase
    .from('obra_actividad_control')
    .select('actividad_id, nombre, metodo_avance, unidad, cantidad_objetivo, obra_id')
    .eq('actividad_id', d.actividad_id).maybeSingle()
  if (errAct) return { ok: false, error: errAct.message }
  if (!act) return { ok: false, error: 'Esa actividad no existe o no es de esta obra.' }
  const a = act as { metodo_avance: string; unidad: string | null; obra_id: string; nombre: string }
  if (a.obra_id !== obraId) return { ok: false, error: 'Esa actividad es de otra obra.' }

  const porCantidad = a.metodo_avance === 'cantidad'
  if (porCantidad && vacio(d.cantidad)) {
    return { ok: false, error: `«${a.nombre}» se mide en ${a.unidad ?? 'unidades'}: poné la cantidad ejecutada.` }
  }
  if (!porCantidad && vacio(d.avance_pct) && vacio(d.cantidad)) {
    return { ok: false, error: 'Poné el avance del día.' }
  }

  const { error } = await supabase.from('obra_ejecucion').insert({
    obra_id: obraId,
    actividad_id: d.actividad_id,
    fecha: d.fecha,
    cantidad: vacio(d.cantidad) ? null : Number(d.cantidad),
    avance_pct: vacio(d.avance_pct) ? null : Number(d.avance_pct),
    comentario: d.comentario || null,
    fuente: 'web',
  })
  if (error) return { ok: false, error: error.message }

  // CARGAR UN AVANCE DEL DÍA ES ELEGIR EL MÉTODO. Sin esto, alguien carga partes toda la semana y el
  // porcentaje de la actividad no se mueve porque sigue mandando el número que declaró el Sheet.
  if (!porCantidad && !vacio(d.avance_pct) && a.metodo_avance === 'manual') {
    await supabase.from('obra_actividad')
      .update({ metodo_avance: 'partes' }).eq('id', d.actividad_id)
  }

  const efectos = [porCantidad ? `+${d.cantidad} ${a.unidad ?? ''}`.trim() : `+${d.avance_pct}% de avance`]

  const reparto = leerReparto(form.entries())
  if (reparto.length > 0) {
    const horas = await imputarHHMasivo(obraId, form)
    efectos.push(horas.ok
      ? `${totalDelReparto(reparto)} HH de ${reparto.length} persona(s)`
      : `las horas NO se cargaron: ${horas.error}`)
  }

  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: `Parte del ${d.fecha}: ${efectos.join(' · ')}.` }
}

/** Borrar un parte. Se corrige un error de carga; no se usa para "cerrar" una actividad. */
export async function borrarParte(obraId: string, parteId: string): Promise<Resultado> {
  const supabase = await createClient()
  // El `eq('obra_id')` no sobra: sin él, un id de otra obra borraría un parte ajeno.
  const { error } = await supabase
    .from('obra_ejecucion').delete().eq('id', parteId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Parte borrado.' }
}

const medicionSchema = z.object({
  unidad: z.string().trim().max(12).optional(),
  cantidad_objetivo: z.union([z.coerce.number().positive('La cantidad objetivo tiene que ser mayor que cero'), z.literal('')]).optional(),
  metodo_avance: z.enum(['cantidad', 'partes', 'manual']),
})

/**
 * Cómo se mide esta actividad.
 *
 * Medir en cantidad exige unidad y objetivo: sin el total, el porcentaje no existe. La base tiene el
 * mismo CHECK — acá se valida para poder decirlo en castellano en vez de mostrar el error de Postgres.
 */
export async function definirMedicion(obraId: string, actividadId: string, form: FormData): Promise<Resultado> {
  const parsed = medicionSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const d = parsed.data
  const objetivo = vacio(d.cantidad_objetivo) ? null : Number(d.cantidad_objetivo)
  if (d.metodo_avance === 'cantidad' && (!d.unidad || objetivo === null)) {
    return { ok: false, error: 'Para medir por cantidad hacen falta la unidad y la cantidad objetivo.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad').update({
    unidad: d.unidad || null,
    cantidad_objetivo: objetivo,
    metodo_avance: d.metodo_avance,
  }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true, mensaje: 'Guardado.' }
}

const ESTADOS = ['pendiente', 'lista', 'en_curso', 'hecha'] as const

/**
 * Mover una actividad de estado.
 *
 * NO EXISTE «bloqueada» ACÁ, y es a propósito: bloqueada se deriva de tener un impedimento abierto.
 * Un botón que la marcara dejaría la actividad trabada para siempre el día que el impedimento se
 * resuelva, porque nadie se acuerda de volver a tocarlo.
 */
export async function cambiarEstado(obraId: string, actividadId: string, estado: string): Promise<Resultado> {
  if (!(ESTADOS as readonly string[]).includes(estado)) {
    return { ok: false, error: 'Ese estado no existe. Una actividad bloqueada se destraba resolviendo su impedimento.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('obra_actividad')
    .update({ estado }).eq('id', actividadId).eq('obra_id', obraId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/obras/${obraId}`)
  return { ok: true }
}

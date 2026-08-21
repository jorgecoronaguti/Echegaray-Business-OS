'use server'

// LAS PARTIDAS — alta, edición inline y baja.
//
// ═══ LA EDICIÓN INLINE GUARDA AL SALIR DEL CAMPO, NO AL TECLEAR ═══
//
// Cada campo manda su propio formulario y la acción escribe SÓLO esa columna. Un `update` con el
// objeto entero desde un formulario parcial pisa con `null` todo lo que ese formulario no traía —
// es el defecto que ya borró notas de estado en Herramientas—, y acá borraría el cómputo al
// corregir una unidad.
//
// ═══ POR QUÉ SE PUEDE ESCRIBIR `hs_unitarias` EN BORRADOR ═══
//
// `cotizacion_partida_valorizada` hace `coalesce(p.hs_unitarias, ac.hs_unitarias)`: lo que se
// escribe en la partida GANA sobre el rendimiento del análisis. Es la manera que el modelo da de
// decir «para esta obra, esta tarea rinde distinto» sin tocar la base maestra — y es lo que
// implementa el «Usar 37,60» de la pantalla 16.
//
// LO QUE ESTE OVERRIDE **NO** HACE: cambiar el COSTO. El costo sigue saliendo del análisis. Subir
// el rendimiento sube las HH previstas y el plazo, no el precio. Es una limitación del modelo, no
// una decisión de esta pantalla, y la pantalla la dice al lado del botón en vez de dejar creer que
// recotizó.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
// Ver `./accion`: un archivo `'use server'` no puede exportar una constante.
import type { EstadoAccion, Resultado } from './accion'


const RAIZ = '/presupuestos'

async function sb() {
  try {
    return { c: await createClient(), error: null as string | null }
  } catch (err) {
    return { c: null, error: err instanceof Error ? err.message : 'No pude conectar con la base' }
  }
}

/** Un número que llega vacío es «sin cargar» y se guarda NULL. Coma o punto, los dos entran. */
function aNumeroOpcional(v: FormDataEntryValue | null): number | null | 'error' {
  const t = String(v ?? '').trim()
  if (t === '') return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 'error'
}

const altaSchema = z.object({
  cotizacion_id: z.string().uuid(),
  descripcion: z.string().trim().min(2, 'La partida necesita una descripción'),
  rubro: z.string().trim().max(120).optional(),
  codigo: z.string().trim().max(40).optional(),
  unidad: z.string().trim().max(20).optional(),
  // El análisis viaja junto con la tarea tipo: elegir uno sin la otra dejaría la partida sin el
  // vínculo que después usa la conversión para sembrar el `tarea_tipo_id` de cada actividad.
  tarea_tipo_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  analisis_id: z.union([z.string().uuid(), z.literal('')]).optional(),
  subcontratada: z.union([z.literal('on'), z.literal('')]).optional(),
})

export async function crearPartida(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const parsed = altaSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const cantidad = aNumeroOpcional(form.get('cantidad'))
  if (cantidad === 'error') return { error: 'La cantidad tiene que ser un número de 0 para arriba' }
  const precio = aNumeroOpcional(form.get('precio_subcontrato'))
  if (precio === 'error') return { error: 'El precio del subcontrato tiene que ser un número' }

  const { c, error } = await sb()
  if (!c) return { error: error! }
  const d = parsed.data

  // El orden se deriva: pedirlo sería pedirle a alguien que administre a mano la posición de una
  // fila. La partida nueva va al final de su presupuesto.
  const { data: ultimo } = await c.from('cotizacion_partida')
    .select('orden').eq('cotizacion_id', d.cotizacion_id).order('orden', { ascending: false }).limit(1)
  const orden = Number(ultimo?.[0]?.orden ?? 0) + 1

  const { error: e } = await c.from('cotizacion_partida').insert({
    cotizacion_id: d.cotizacion_id,
    orden,
    descripcion: d.descripcion,
    rubro: d.rubro || null,
    codigo: d.codigo || null,
    unidad: d.unidad || null,
    cantidad,
    tarea_tipo_id: d.tarea_tipo_id || null,
    analisis_id: d.analisis_id || null,
    subcontratada: d.subcontratada === 'on',
    precio_subcontrato: precio,
  })
  if (e) return { error: e.message }
  revalidatePath(`${RAIZ}/${d.cotizacion_id}`, 'layout')
  return { error: null, ok: true }
}

/** Los campos que la tabla deja editar en línea. Cada uno viaja solo y pisa sólo su columna. */
const CAMPOS_TEXTO = ['descripcion', 'rubro', 'codigo', 'unidad'] as const
const CAMPOS_NUMERO = ['cantidad', 'hs_unitarias', 'precio_subcontrato'] as const
type CampoEditable = (typeof CAMPOS_TEXTO)[number] | (typeof CAMPOS_NUMERO)[number]

export async function editarCampoPartida(_prev: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const partida_id = String(form.get('partida_id') ?? '')
  const campo = String(form.get('campo') ?? '') as CampoEditable
  const cotizacion_id = String(form.get('cotizacion_id') ?? '')
  if (!z.string().uuid().safeParse(partida_id).success) return { error: 'Falta la partida' }

  let valor: string | number | null
  if ((CAMPOS_TEXTO as readonly string[]).includes(campo)) {
    const t = String(form.get('valor') ?? '').trim()
    if (campo === 'descripcion' && t.length < 2) return { error: 'La partida necesita una descripción' }
    // Vacío es SIN DATO, no cadena vacía: una unidad `''` no se distingue de una unidad que nadie
    // cargó, y las dos se leerían como «tiene unidad».
    valor = t === '' ? null : t
  } else if ((CAMPOS_NUMERO as readonly string[]).includes(campo)) {
    const n = aNumeroOpcional(form.get('valor'))
    if (n === 'error') return { error: 'Tiene que ser un número de 0 para arriba' }
    valor = n
  } else {
    return { error: `«${campo}» no es un campo editable de la partida` }
  }

  const { c, error } = await sb()
  if (!c) return { error: error! }

  // UN PRESUPUESTO CONGELADO NO SE EDITA. La RLS deja escribir la partida —su policy mira el
  // permiso económico, no el estado— así que el freno vive acá. Se verifica contra la base y no
  // contra lo que dice la pantalla: la misma acción entra por un formulario y mañana por el chat.
  const { data: cong } = await c.from('cotizacion_partida')
    .select('cotizacion_id, cotizaciones!inner(congelada_en)').eq('id', partida_id).maybeSingle()
  const congelada = (cong as { cotizaciones?: { congelada_en?: string | null } } | null)?.cotizaciones?.congelada_en
  if (congelada) {
    return { error: 'Este presupuesto está congelado: para cambiarlo se crea una versión nueva.' }
  }

  const { error: e } = await c.from('cotizacion_partida').update({ [campo]: valor }).eq('id', partida_id)
  if (e) return { error: e.message }
  if (cotizacion_id) revalidatePath(`${RAIZ}/${cotizacion_id}`, 'layout')
  return { error: null, ok: true }
}

/**
 * QUITAR UNA PARTIDA.
 *
 * Firma `(id, id) => Resultado` y no `(prev, FormData)`: es la que espera `BotonAccion`, que es el
 * control del sistema para una acción sin campos. Así el botón vive en una tabla que ya es de
 * cliente sin arrastrar un formulario entero por fila.
 */
export async function quitarPartida(partidaId: string, cotizacionId: string): Promise<Resultado> {
  if (!z.string().uuid().safeParse(partidaId).success) return { ok: false, error: 'Falta la partida' }
  const { c, error } = await sb()
  if (!c) return { ok: false, error: error! }

  // UN PRESUPUESTO CONGELADO NO SE EDITA, y borrar es la edición más definitiva de todas.
  const { data: cong } = await c.from('cotizacion_partida')
    .select('cotizaciones!inner(congelada_en)').eq('id', partidaId).maybeSingle()
  if ((cong as { cotizaciones?: { congelada_en?: string | null } } | null)?.cotizaciones?.congelada_en) {
    return { ok: false, error: 'Este presupuesto está congelado: para cambiarlo se crea una versión nueva.' }
  }

  // BORRAR UNA PARTIDA YA CONVERTIDA DEJARÍA ACTIVIDADES HUÉRFANAS. `obra_actividad` la referencia
  // con `on delete set null`: las actividades no se caen, pero pierden la trazabilidad hacia lo
  // cotizado — que es justamente lo que conecta el avance físico con el costo.
  const { count } = await c.from('obra_actividad')
    .select('id', { count: 'exact', head: true }).eq('cotizacion_partida_id', partidaId)
  if ((count ?? 0) > 0) {
    return { ok: false, error: `Ya generó ${count} actividades en la obra: borrarla las dejaría sin origen.` }
  }

  const { error: e } = await c.from('cotizacion_partida').delete().eq('id', partidaId)
  if (e) return { ok: false, error: e.message }
  if (cotizacionId) revalidatePath(`${RAIZ}/${cotizacionId}`, 'layout')
  return { ok: true }
}

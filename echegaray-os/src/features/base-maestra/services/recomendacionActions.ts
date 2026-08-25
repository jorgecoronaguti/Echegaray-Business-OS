'use server'

// BASE MAESTRA · QUÉ SE HACE CON LO QUE LA OBRA ENSEÑÓ.
//
// ═══ LA DECISIÓN ES DE UNA PERSONA, SIEMPRE ═══
//
// `capturar_rendimientos()` corre solo todos los días a las 11:20 porque registrar un hecho —esta
// actividad terminó, costó estas horas productivas— no requiere el juicio de nadie. CAMBIAR EL
// ANÁLISIS sí lo requiere y por eso pasa por acá: un sistema que se recalibra solo con la última
// obra medida termina cotizando con el rendimiento de la obra más rara que hizo.
//
// ═══ ACÁ NO VIVE NINGUNA REGLA ═══
//
// `aceptar_recomendacion` y `descartar_recomendacion` están en Postgres, con el portero económico
// adentro, porque la misma decisión va a entrar mañana por el chat. Esta capa arma el FormData,
// llama y MUESTRA EL ERROR DE LA BASE TAL CUAL — el mensaje de «no hay recomendación que aceptar»
// trae la lectura completa («muestra chica: es un dato, no una recomendación») y traducirlo a un
// «no se pudo» borraría el único dato útil.
//
// Aceptar crea una VERSIÓN NUEVA del análisis. Los presupuestos ya congelados NO se mueven: apuntan
// a la versión vieja y guardan su propia copia de la composición. Eso tiene un test que lo mide.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/shared/components/ui'

const RUTA = '/administracion/base-maestra/tareas'

const idSchema = z.string().uuid()

async function sb() {
  try {
    return { c: await createClient(), error: null as string | null }
  } catch (err) {
    return { c: null, error: err instanceof Error ? err.message : 'No pude conectar con la base' }
  }
}

/**
 * ACEPTAR: versiona el análisis escalando la mano de obra al rendimiento aprendido.
 *
 * El motivo es opcional porque la función arma uno solo con la muestra que lo sostiene —«mediana de
 * 7 muestras en 3 obras, dispersión 0,21; vigente anterior 2,4»—, que es lo que hace falta para
 * poder auditar la decisión seis meses después. Lo que escriba la persona se antepone.
 */
export async function aceptarRecomendacion(form: FormData): Promise<ResultadoAccion> {
  const id = String(form.get('tarea_tipo_id') ?? '')
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Falta la tarea tipo' }
  const motivo = String(form.get('motivo') ?? '').trim()

  const { c, error } = await sb()
  if (!c) return { ok: false, error: error! }
  const { data, error: e } = await c.rpc('aceptar_recomendacion', {
    p_tarea_tipo_id: id,
    p_motivo: motivo === '' ? null : motivo,
  })
  if (e) return { ok: false, error: e.message }
  revalidatePath(RUTA)
  return {
    ok: true,
    id: String(data ?? ''),
    mensaje: 'Versión nueva del análisis creada con el rendimiento aprendido. Los presupuestos ya congelados no se movieron.',
  }
}

/**
 * DESCARTAR: registra la decisión y saca la recomendación de la lista hasta que llegue una muestra
 * nueva. El motivo es OBLIGATORIO y lo exige la base — sin él, mañana nadie sabe contra qué se
 * comparó, y la misma recomendación vuelve a evaluarse de cero.
 */
export async function descartarRecomendacion(form: FormData): Promise<ResultadoAccion> {
  const id = String(form.get('tarea_tipo_id') ?? '')
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Falta la tarea tipo' }
  const motivo = String(form.get('motivo') ?? '').trim()
  if (motivo === '') {
    return { ok: false, error: 'Escribí por qué se descarta: sin motivo, mañana nadie sabe contra qué se comparó.' }
  }

  const { c, error } = await sb()
  if (!c) return { ok: false, error: error! }
  const { error: e } = await c.rpc('descartar_recomendacion', { p_tarea_tipo_id: id, p_motivo: motivo })
  if (e) return { ok: false, error: e.message }
  revalidatePath(RUTA)
  return { ok: true, mensaje: 'Descartada, con el motivo registrado. Vuelve a la lista si llega una muestra nueva.' }
}

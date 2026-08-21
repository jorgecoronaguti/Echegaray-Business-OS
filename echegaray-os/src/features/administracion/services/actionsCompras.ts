'use server'

// LO QUE SE ESCRIBE DESDE LA PANTALLA 24 · COMPRAS — dos hechos distintos, dos acciones.
//
// ═══ CONFIRMAR NO ES IMPUTAR, Y POR ESO NO SE GUARDAN JUNTOS ═══
//
// `estado_control` responde «¿alguien miró este papel y qué decidió?». `obra_texto` responde «¿quién
// paga este gasto?». Meterlos en un solo botón haría que confirmar un comprobante lo diera por
// imputado, y el costo terminaría fuera de la obra que lo consumió sin que nadie lo note.
//
// ═══ LA IMPUTACIÓN NO SE REESCRIBE ACÁ: SE DELEGA ═══
//
// El encargo decía «reusá `resolverImputacion`, la resolución de imputación YA existe». Es la acción
// equivocada para esta pantalla, y la diferencia importa: `resolverImputacion` escribe una fila en
// `obra_alias` —el diccionario que traduce un TEXTO DE OBRA ya presente en la fila a una obra
// canónica—. Un comprobante de ARCA no trae ningún texto de obra: ARCA no sabe a qué obra fue. No
// hay clave que mapear, y llamarla acá crearía una entrada del diccionario para un texto que no
// existe, ensuciando el mismo diccionario que usan Compras, Pedidos, Herramientas y Movimientos.
//
// La acción que SÍ hace este trabajo también existe desde la Fase 3 de Control de Obras:
// `asignarComprobanteObraAction` escribe `obra_texto` + quién y cuándo sobre `comprobantes_arca`.
// Acá se la llama tal cual, sin copiarle una línea; lo único que se agrega es adaptar su forma de
// respuesta a la de los formularios del módulo y revalidar esta pantalla, que ella no conoce.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  asignarComprobanteObraAction,
  desasignarComprobanteObraAction,
} from '@/features/control-obras/services/costosActions'

/** La misma forma que espera `FormAccion` del design system. */
export type Resultado = { ok: true; mensaje?: string } | { ok: false; error: string }

const RUTA = '/administracion/compras'

const controlSchema = z.object({
  id: z.string().uuid('Falta el comprobante'),
  // Los tres valores del CHECK de la base menos el default: `sin_revisar` es el estado del que llega
  // de ARCA, no una decisión que alguien pueda tomar. Poder «desdecidir» desde la pantalla borraría
  // el registro de quién miró qué.
  estado: z.enum(['confirmado', 'en_revision']),
})

const MENSAJE: Record<'confirmado' | 'en_revision', string> = {
  confirmado: 'Confirmado. Deja de figurar como posible duplicado.',
  en_revision: 'Marcado para revisar. Queda en la cola de «por revisar».',
}

/**
 * Guarda qué decidió una persona sobre el papel, con su nombre y la hora.
 *
 * SIN EL AUTOR NO ES UN CONTROL. «Está confirmado» sin decir quién lo confirmó no se puede auditar
 * ni preguntar; es exactamente la clase de afirmación que el OS no acepta de sí mismo.
 */
export async function marcarControlComprobante(form: FormData): Promise<Resultado> {
  const parsed = controlSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { id, estado } = parsed.data

  const supabase = await createClient()
  const { data: sesion } = await supabase.auth.getUser()
  const por = sesion?.user?.email ?? null
  if (!por) return { ok: false, error: 'Sin sesión: no se puede firmar el control.' }

  const { data, error } = await supabase
    .from('comprobantes_arca')
    .update({ estado_control: estado, estado_control_por: por, estado_control_en: new Date().toISOString() })
    .eq('id', id)
    // EL 204 NO PRUEBA LA ESCRITURA. Un update que no tocó ninguna fila —porque la RLS la escondió—
    // devuelve éxito igual. Se pide la fila de vuelta y se mira lo que quedó.
    .select('id, estado_control')

  if (error) {
    return {
      ok: false,
      error: error.code === '42501'
        ? 'Sólo Administración puede marcar el control de un comprobante.'
        : error.message,
    }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: 'La base no devolvió el comprobante: la marca no quedó guardada.' }
  }
  if (data[0].estado_control !== estado) {
    return { ok: false, error: `La base guardó «${data[0].estado_control}» en vez de «${estado}».` }
  }

  revalidatePath(RUTA)
  return { ok: true, mensaje: MENSAJE[estado] }
}

const imputarSchema = z.object({
  id: z.string().uuid('Falta el comprobante'),
  // `''` es «sacarle la obra», y es una respuesta: un comprobante mal imputado tiene que poder
  // volver a la cola en vez de quedar pegado a la obra equivocada.
  obra_texto: z.string().trim().max(80, 'El nombre de obra es demasiado largo'),
  /** La obra que tenía antes: hace falta para revalidar la pantalla de esa obra. */
  obra_previa: z.string().trim().max(80).optional(),
})

/** Imputa el comprobante a una obra —o se la saca— delegando en la acción que ya hace esa escritura. */
export async function imputarComprobante(form: FormData): Promise<Resultado> {
  const parsed = imputarSchema.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { id, obra_texto, obra_previa } = parsed.data

  const datos = new FormData()
  datos.set('id', id)
  if (obra_texto) datos.set('obra_texto', obra_texto)
  else if (obra_previa) datos.set('obra_texto', obra_previa)

  const r = obra_texto
    ? await asignarComprobanteObraAction({ error: null }, datos)
    : await desasignarComprobanteObraAction({ error: null }, datos)

  if (r.error) return { ok: false, error: r.error }
  revalidatePath(RUTA)
  return {
    ok: true,
    mensaje: obra_texto ? `Imputado a ${obra_texto}.` : 'Sin obra: vuelve a la cola de sin imputar.',
  }
}

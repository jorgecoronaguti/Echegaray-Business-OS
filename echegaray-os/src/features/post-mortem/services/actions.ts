'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { postMortemInputSchema, actualizarPostMortemInputSchema, construirResumenSnapshot } from '../types'
import { insertPostMortem, actualizarPostMortem, cerrarPostMortem } from './postMortemService'
import { getObraById } from '@/features/obras/services/obrasService'
import { getResumenEconomicoPorObra } from '@/features/control-economico/services/controlEconomicoService'
import {
  getCertificadosPorObra,
  getEjecucionFinancieraPorObra,
} from '@/features/ejecucion-financiera/services/ejecucionFinancieraService'
import { getRegistrosHHPorObra, getHHResumenPorObra } from '@/features/hh-productividad/services/hhProductividadService'
import { getAdicionalesPorObra } from '@/features/adicionales/services/adicionalesService'
import { getComprasPorObra, getComprasResumenPorObra } from '@/features/compras/services/comprasService'
import { getObligacionesResumenPorObra } from '@/features/obligaciones/services/obligacionesService'

export type ActionState = { error: string | null }

async function createClientOrError(): Promise<
  { supabase: Awaited<ReturnType<typeof createClient>>; error: null } | { supabase: null; error: string }
> {
  try {
    return { supabase: await createClient(), error: null }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { supabase: null, error }
  }
}

export async function iniciarPostMortemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const obraId = formData.get('obra_id')
  const parsed = postMortemInputSchema.safeParse({ obra_id: obraId })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await insertPostMortem(client.supabase, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function guardarBorradorPostMortemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const postMortemId = formData.get('post_mortem_id')
  const obraId = formData.get('obra_id_para_revalidar')
  if (typeof postMortemId !== 'string' || !postMortemId) return { error: 'Post mortem inválido' }

  const parsed = actualizarPostMortemInputSchema.safeParse({
    causas_desvio: formData.get('causas_desvio') || undefined,
    aprendizajes: formData.get('aprendizajes') || undefined,
    acciones_recomendadas: formData.get('acciones_recomendadas') || undefined,
    cambios_sugeridos_cotizacion: formData.get('cambios_sugeridos_cotizacion') || undefined,
    notas: formData.get('notas') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }

  const { error } = await actualizarPostMortem(client.supabase, postMortemId, parsed.data)
  if (error) return { error }

  if (typeof obraId === 'string' && obraId) revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

export async function cerrarPostMortemAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const postMortemId = formData.get('post_mortem_id')
  const obraId = formData.get('obra_id')
  if (typeof postMortemId !== 'string' || !postMortemId) return { error: 'Post mortem inválido' }
  if (typeof obraId !== 'string' || !obraId) return { error: 'Obra inválida' }

  const client = await createClientOrError()
  if (!client.supabase) return { error: client.error }
  const supabase = client.supabase

  const obra = await getObraById(supabase, obraId)
  if (obra.error) return { error: obra.error }
  if (!obra.data) return { error: 'Obra no encontrada' }
  // Regla de negocio: no tiene sentido cerrar el aprendizaje de una obra que la
  // empresa todavía considera en curso — evita cerrar un post mortem prematuro.
  if (obra.data.estado !== 'cerrada') {
    return { error: 'Solo se puede cerrar el Post Mortem de una obra en estado "cerrada"' }
  }

  const [resumenEconomico, ejecucionFinanciera, resumenHH, registrosHH, adicionales, certificados, compras, comprasResumen, obligacionesResumen] =
    await Promise.all([
      getResumenEconomicoPorObra(supabase, obraId),
      getEjecucionFinancieraPorObra(supabase, obraId),
      getHHResumenPorObra(supabase, obraId),
      getRegistrosHHPorObra(supabase, obraId),
      getAdicionalesPorObra(supabase, obraId),
      getCertificadosPorObra(supabase, obraId),
      getComprasPorObra(supabase, obraId),
      getComprasResumenPorObra(supabase, obraId),
      getObligacionesResumenPorObra(supabase, obraId),
    ])

  const primerError =
    resumenEconomico.error ??
    ejecucionFinanciera.error ??
    resumenHH.error ??
    registrosHH.error ??
    adicionales.error ??
    certificados.error ??
    compras.error ??
    comprasResumen.error ??
    obligacionesResumen.error
  if (primerError) return { error: primerError }

  const snapshot = construirResumenSnapshot({
    resumenEconomico: resumenEconomico.data,
    ejecucionFinanciera: ejecucionFinanciera.data,
    resumenHH: resumenHH.data,
    registrosHH: registrosHH.data ?? [],
    adicionales: adicionales.data ?? [],
    certificados: certificados.data ?? [],
    compras: compras.data ?? [],
    comprasResumen: comprasResumen.data ?? [],
    obligacionesResumen: obligacionesResumen.data ?? [],
  })

  const hoy = new Date().toISOString().slice(0, 10)
  const { error } = await cerrarPostMortem(supabase, postMortemId, snapshot, hoy)
  if (error) return { error }

  revalidatePath(`/obras/${obraId}`)
  return { error: null }
}

// LA QUINCENA DE RECIBOS: una fila por persona de la liquidación, con su recibo vigente si lo tiene.
//
// ═══ LA LIQUIDACIÓN SE LEE CON LA MISMA FUNCIÓN QUE LA PANTALLA DE LIQUIDACIÓN ═══
//
// `getLiquidacionDeLaQuincena` arma las líneas que el cuadro muestra —abierta con los valores manuales,
// cerrada con la foto del sello—. Leerlas de otra forma sería un segundo número para el mismo pago.
// Las personas que la liquidación no liquida (sin tarifa, sin línea sellada) quedan en la lista como
// «Bloqueado», con su motivo: la lista no se acorta en silencio.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getLiquidacionDeLaQuincena } from '@/features/administracion/services/liquidacionQuincenaService'
import { estadoDelCuadro } from '@/features/administracion/services/estadoDelCuadro'
import { leerRegistrosHH } from '@/features/administracion/services/registrosHHService'
import type { Quincena } from '@/features/administracion/services/quincena'
import type { LineaConOverrides } from '@/features/administracion/services/liquidacionOverrides'
import { leerRecibosDeLaQuincena, obraPorPersona, type ReciboDePago } from './datos'
import { armarRecibo, marcaDeFila, type FotoDeRecibo, type MarcaDeFila } from './logica'

export interface FilaDeRecibo {
  personaId: string
  nombre: string
  /** `Oficial · UOCRA`; `null` = sin categoría de convenio cargada. */
  categoria: string | null
  obra: string | null
  grupo: string
  cerrada: boolean
  /** Lo que se va a firmar (vista previa) o lo que se firmó (foto del recibo). `null` = no liquida. */
  foto: FotoDeRecibo | null
  sinTarifa: boolean
  bloqueo: string | null
  recibo: ReciboDePago | null
  marca: MarcaDeFila
  /** ¿«Enviar a firmar» la incluye? Cerrada, sin bloqueo, y sin recibo vigente al día. */
  emitible: boolean
}

export interface QuincenaDeRecibos {
  filas: FilaDeRecibo[]
  /** Todas las versiones, para el historial (los reemplazados no se borran). */
  historial: ReciboDePago[]
  errores: { que: string; error: string }[]
}

/** Pura: la fila de una persona. La vista previa sale de la línea; si hay recibo, manda su foto. */
export function filaDeRecibo(e: {
  linea: LineaConOverrides; grupo: string; cerrada: boolean; recibo: ReciboDePago | null
  categoria: string | null; obra: string | null
}): FilaDeRecibo {
  const armado = armarRecibo(e.linea)
  const r = e.recibo
  const bloqueo = r ? null : armado.bloqueo
  const marca = marcaDeFila({ recibo: r, bloqueo, quincenaCerrada: e.cerrada })
  const reemitible = r != null && (r.estado === 'observado' || r.desactualizado != null)
  return {
    personaId: e.linea.personaId, nombre: e.linea.nombre, categoria: e.categoria, obra: r?.obra ?? e.obra,
    grupo: e.grupo, cerrada: e.cerrada, foto: r ?? armado.foto, sinTarifa: e.linea.sinTarifa, bloqueo, recibo: r, marca,
    emitible: e.cerrada && armado.bloqueo == null && (r == null || reemitible),
  }
}

export async function getQuincenaDeRecibos(supabase: SupabaseClient, q: Quincena): Promise<QuincenaDeRecibos> {
  const [liq, recibos, registros, obras] = await Promise.all([
    getLiquidacionDeLaQuincena(supabase, q),
    leerRecibosDeLaQuincena(supabase, q.desde, q.hasta),
    // PAGINADA: PostgREST corta en 1.000 filas con 200 y sin error (`registrosHHService.ts`).
    leerRegistrosHH(supabase, { desde: q.desde, hasta: q.hasta, columnas: 'persona_id, obra_canonica_id, horas' }),
    supabase.from('obra_canonica').select('id, nombre'),
  ])
  const errores = [...liq.errores]
  if (recibos.error) errores.push({ que: 'los recibos de pago', error: recibos.error })
  if (registros.error) errores.push({ que: 'la obra de cada uno (horas imputadas)', error: registros.error })
  if (obras.error) errores.push({ que: 'el índice de obras', error: obras.error.message })

  const historial = recibos.data ?? []
  const vigentes = new Map(historial.filter((r) => r.vigente).map((r) => [r.personaId, r]))
  const obraDe = obraPorPersona(
    (registros.data ?? []) as { persona_id: string; obra_canonica_id: string | null; horas: number | null }[],
    new Map(((obras.data ?? []) as { id: string; nombre: string }[]).map((o) => [o.id, o.nombre])),
  )
  const categoriaDe = new Map(liq.exposicion.lineas.map((l) => [
    l.personaId, [l.categoria, l.convenio].filter(Boolean).join(' · ') || null,
  ]))

  const filas = liq.cuadros.flatMap((c) => {
    const cerrada = estadoDelCuadro(liq.estados, c.grupo).estado === 'cerrada'
    return c.lineas.map((linea) => filaDeRecibo({
      linea, grupo: c.grupo, cerrada, recibo: vigentes.get(linea.personaId) ?? null,
      categoria: categoriaDe.get(linea.personaId) ?? null, obra: obraDe.get(linea.personaId) ?? null,
    }))
  })
  return { filas, historial, errores }
}

// LOS RECIBOS YA EMITIDOS DE UNA QUINCENA — para la marca «impreso dd/mm hh:mm» del cuadro de Liquidación.
//
// Dueño, 01/10/2026 (rehacer la impresión en lote): los sistemas de sueldos guardan cuándo se imprimió cada recibo
// y dejan reimprimir. Acá no se guarda nada nuevo: el dato YA ESTÁ en `recibo_liquidacion.emitido_en`, que escribe
// «Guardar e imprimir» (de a uno o en lote). Se lee el último de cada persona; los archivados no cuentan.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReciboImpreso {
  id: string
  /** «impreso 01/10 14:32», en hora de San Juan. */
  texto: string
  /** Para el `title`: fecha larga y el código del recibo. */
  titulo: string
}

interface Fila { id: string; persona_id: string; emitido_en: string; codigo: string | null }

const PARTES = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/San_Juan', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
})

/** `2026-10-01T17:32:10Z` → `{ corta: '01/10 14:32', larga: '01/10/2026 14:32' }`. `null` si no es una fecha. */
export function horaDeSanJuan(iso: string): { corta: string; larga: string } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = PARTES.formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  const hora = `${v('hour')}:${v('minute')}`
  return { corta: `${v('day')}/${v('month')} ${hora}`, larga: `${v('day')}/${v('month')}/${v('year')} ${hora}` }
}

/** El último recibo de cada persona. Sin base: se prueba solo. */
export function ultimoPorPersona(filas: readonly Fila[]): Record<string, ReciboImpreso> {
  const ultimo = new Map<string, Fila>()
  for (const f of filas) {
    const ya = ultimo.get(f.persona_id)
    if (!ya || f.emitido_en > ya.emitido_en) ultimo.set(f.persona_id, f)
  }
  const mapa: Record<string, ReciboImpreso> = {}
  for (const [persona, f] of ultimo) {
    const h = horaDeSanJuan(f.emitido_en)
    if (!h) continue
    mapa[persona] = {
      id: f.id,
      texto: `impreso ${h.corta}`,
      titulo: `Recibo${f.codigo ? ` ${f.codigo}` : ''} guardado en el legajo el ${h.larga}`,
    }
  }
  return mapa
}

export async function leerRecibosDeLaQuincena(
  supabase: SupabaseClient, quincena: { desde: string; hasta: string },
): Promise<{ impresos: Record<string, ReciboImpreso>; error: string | null }> {
  const { data, error } = await supabase
    .from('recibo_liquidacion')
    .select('id, persona_id, emitido_en, codigo')
    .eq('quincena_desde', quincena.desde).eq('quincena_hasta', quincena.hasta)
    .is('archivado_en', null)
    // «Impreso» es lo vigente: un reemplazado ya no es el recibo de la persona.
    .neq('estado', 'reemplazado')
  if (error) return { impresos: {}, error: error.message }
  return { impresos: ultimoPorPersona((data ?? []) as Fila[]), error: null }
}

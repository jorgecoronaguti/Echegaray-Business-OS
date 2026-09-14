// LOS CONCEPTOS DE LOS RECIBOS (`recibo_sueldo_concepto`), UNA LECTURA POR RENDER.
//
// De estas filas salen las reglas del recibo estimado (`reglasDelRecibo`) y la columna «Real» del panel.
// Se pagina: PostgREST corta en `db-max-rows` (1.000 en esta base) y devuelve 200 sin error, y ~300
// recibos × ~20 conceptos pasan ese tope. Una regla derivada de la primera página sería una regla
// derivada de enero.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConceptoDeRecibo, SeccionDelConcepto } from './reglasDelRecibo.ts'

const PAGINA = 1000
const TOPE_FILAS = 50_000
const SECCIONES: readonly SeccionDelConcepto[] = ['remunerativo', 'no_remunerativo', 'descuento', 'contribucion']

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

const n = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))

/** Una fila cruda → concepto, o `null` si la sección no es una de las cuatro (no se adivina). */
export function conceptoDeFila(r: Record<string, unknown>): { reciboId: string; concepto: ConceptoDeRecibo } | null {
  const seccion = SECCIONES.find((s) => s === r.seccion)
  const monto = n(r.monto)
  if (!seccion || monto == null || typeof r.recibo_id !== 'string' || typeof r.codigo !== 'string') return null
  return {
    reciboId: r.recibo_id,
    concepto: { codigo: r.codigo, descripcion: String(r.descripcion ?? ''), seccion, unidad: n(r.unidad), base: n(r.base), monto },
  }
}

/**
 * LOS CONCEPTOS AGRUPADOS POR RECIBO, en el orden impreso. Sin la tabla (migración sin aplicar):
 * `hay: false` sin error, y el estimado dice que no tiene reglas. Otro error se devuelve con su texto.
 */
export async function leerConceptosDeRecibos(
  supabase: SupabaseClient,
): Promise<{ porRecibo: Map<string, ConceptoDeRecibo[]>; hay: boolean; error: string | null }> {
  const porRecibo = new Map<string, ConceptoDeRecibo[]>()
  for (let desde = 0; desde < TOPE_FILAS; desde += PAGINA) {
    const { data, error } = await supabase.from('recibo_sueldo_concepto')
      .select('recibo_id, orden, codigo, descripcion, seccion, unidad, base, monto')
      .order('recibo_id').order('orden')
      .range(desde, desde + PAGINA - 1)
    if (error) {
      if (sinTabla(error)) return { porRecibo: new Map(), hay: false, error: null }
      return { porRecibo: new Map(), hay: false, error: error.message?.trim() || `la base rechazó la consulta (${error.code ?? 'sin código'})` }
    }
    const filas = (data ?? []) as Record<string, unknown>[]
    for (const f of filas) {
      const c = conceptoDeFila(f)
      if (!c) return { porRecibo: new Map(), hay: true, error: `concepto ilegible en el recibo ${String(f.recibo_id)}: ${String(f.codigo)} ${String(f.seccion)}` }
      porRecibo.set(c.reciboId, [...(porRecibo.get(c.reciboId) ?? []), c.concepto])
    }
    if (filas.length < PAGINA) return { porRecibo, hay: true, error: null }
  }
  return { porRecibo: new Map(), hay: true, error: `llegó al tope de ${TOPE_FILAS} conceptos: no puedo afirmar que están todos` }
}

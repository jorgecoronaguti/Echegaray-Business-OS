// LA LECTURA DE `recibo_sueldo_linea`, UNA VEZ POR RENDER.
//
// La usan la exposición al convenio (el $/h del recibo contra el piso) y, a través de ella, la
// liquidación (el blanco y la mediana del neto estimado). Estaba dentro de la liquidación; al necesitarla
// también Convenios se mudó acá, y la liquidación reusa lo que leyó la exposición: dos lecturas serían
// dos fotos de los recibos en la misma pantalla.

import { cuilNormalizado } from './cuil.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReciboDeSueldo } from './sueldoBlancoNegro.ts'

const TOPE_RECIBOS = 5000

const sinTabla = (e: { code?: string; message: string }): boolean =>
  e.code === '42P01' || /does not exist/i.test(e.message)

/**
 * TODAS LAS LÍNEAS. Sin la tabla (42P01) devuelve `hay: false` sin error: la migración la aplica otra
 * persona. Cualquier otro error se devuelve con su texto —fingir que no hay recibo estimaría el blanco
 * de alguien que sí lo tiene— y llegar al tope es un error, no una lista completa.
 */
export async function leerRecibosDeSueldo(
  supabase: SupabaseClient,
): Promise<{ filas: ReciboDeSueldo[]; hay: boolean; error: string | null }> {
  const { data, error } = await supabase.from('recibo_sueldo_linea')
    .select('persona_id, cuil, periodo, categoria, valor_hora, horas_blanco, bruto, neto, drive_file_id')
    .range(0, TOPE_RECIBOS - 1)
  if (error) {
    if (sinTabla(error)) return { filas: [], hay: false, error: null }
    return { filas: [], hay: false, error: error.message?.trim() || `la base rechazó la consulta (${error.code ?? 'sin código'})` }
  }
  const filas = (data ?? []) as Record<string, unknown>[]
  if (filas.length >= TOPE_RECIBOS) return { filas: [], hay: true, error: `llegó al tope de ${TOPE_RECIBOS} líneas: no puedo afirmar que están todas` }
  const n = (v: unknown): number | null => (v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const s = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)
  return {
    hay: true,
    error: null,
    filas: filas.map((r) => ({
      personaId: s(r.persona_id), cuil: cuilNormalizado(s(r.cuil)), periodo: String(r.periodo ?? ''), categoria: s(r.categoria),
      valorHora: n(r.valor_hora), horasBlanco: n(r.horas_blanco), bruto: n(r.bruto), neto: n(r.neto),
      driveFileId: s(r.drive_file_id),
    })),
  }
}

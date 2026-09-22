// LAS LECTURAS DE LOS RECIBOS DE PAGO. Ni una regla acá: trae filas y las pasa a la forma de `logica.ts`.
//
// Todo sale de `recibo_pago_estado`, que ya trae `vigente` y `desactualizado` calculados en la base y
// lleva el portero en el WHERE (la persona lo suyo; `liquida_sueldos()` todo). Una tabla que no existe
// todavía (la migración 20260922T1600 sin aplicar) se dice con su nombre: no es «sin recibos».

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoRecibo, FotoDeRecibo } from './logica'

export interface ReciboDePago extends FotoDeRecibo {
  id: string
  codigo: string
  personaId: string
  personaNombre: string
  categoria: string | null
  obra: string | null
  desde: string
  hasta: string
  grupo: string
  estado: EstadoRecibo
  emitidoEn: string
  emitidoPor: string
  trazo: string | null
  firmadoEn: string | null
  papelPath: string | null
  papelSubidoEn: string | null
  papelSubidoPor: string | null
  verificacion: Record<string, boolean> | null
  archivadoEn: string | null
  observacion: string | null
  observadoEn: string | null
  driveFileId: string | null
  vigente: boolean
  desactualizado: string | null
  reemplazadoPor: string | null
}

export type Lectura<T> = { data: T; error: null } | { data: null; error: string }

/** La migración que crea la tabla no está aplicada: se dice, no se dibuja «sin recibos». */
export const SIN_MIGRACION = 'Los recibos de pago todavía no están habilitados en la base (falta aplicar la migración 20260922T1600).'

const n = (v: unknown): number => Number(v ?? 0)
const nn = (v: unknown): number | null => (v == null ? null : Number(v))
const s = (v: unknown): string | null => (v == null ? null : String(v))

type Fila = Record<string, unknown>

export function reciboDeFila(f: Fila): ReciboDePago {
  return {
    id: String(f.id), codigo: String(f.codigo), personaId: String(f.persona_id), personaNombre: String(f.persona_nombre),
    categoria: s(f.categoria), obra: s(f.obra), desde: String(f.desde).slice(0, 10), hasta: String(f.hasta).slice(0, 10),
    grupo: String(f.grupo), horas: nn(f.horas), valorHora: nn(f.valor_hora), bruto: n(f.bruto), adelanto: n(f.adelanto),
    yaTransferido: n(f.ya_transferido), total: n(f.total), porBanco: n(f.por_banco), enEfectivo: n(f.en_efectivo),
    estado: f.estado as EstadoRecibo, emitidoEn: String(f.emitido_en), emitidoPor: String(f.emitido_por),
    trazo: s(f.trazo), firmadoEn: s(f.firmado_en), papelPath: s(f.papel_path), papelSubidoEn: s(f.papel_subido_en),
    papelSubidoPor: s(f.papel_subido_por),
    verificacion: (f.verificacion && typeof f.verificacion === 'object' ? f.verificacion : null) as Record<string, boolean> | null,
    archivadoEn: s(f.archivado_en), observacion: s(f.observacion), observadoEn: s(f.observado_en),
    driveFileId: s(f.drive_file_id), vigente: f.vigente === true, desactualizado: s(f.desactualizado),
    reemplazadoPor: s(f.reemplazado_por),
  }
}

const traducir = (e: { code?: string; message: string }): string =>
  e.code === '42P01' || /recibo_pago/.test(e.message) && /does not exist|schema cache/i.test(e.message) ? SIN_MIGRACION : e.message

/** Todos los recibos de una quincena (vigentes y reemplazados), ordenados por número. */
export async function leerRecibosDeLaQuincena(
  supabase: SupabaseClient, desde: string, hasta: string,
): Promise<Lectura<ReciboDePago[]>> {
  const { data, error } = await supabase.from('recibo_pago_estado').select('*')
    .eq('desde', desde).eq('hasta', hasta).order('numero')
  if (error) return { data: null, error: traducir(error) }
  return { data: ((data ?? []) as Fila[]).map(reciboDeFila), error: null }
}

export async function leerRecibo(supabase: SupabaseClient, id: string): Promise<Lectura<ReciboDePago | null>> {
  const { data, error } = await supabase.from('recibo_pago_estado').select('*').eq('id', id).maybeSingle()
  if (error) return { data: null, error: traducir(error) }
  return { data: data ? reciboDeFila(data as Fila) : null, error: null }
}

/** Los recibos de UNA persona, del más nuevo al más viejo. El teléfono pide los suyos con su `persona_id`. */
export async function leerRecibosDePersona(supabase: SupabaseClient, personaId: string): Promise<Lectura<ReciboDePago[]>> {
  const { data, error } = await supabase.from('recibo_pago_estado').select('*')
    .eq('persona_id', personaId).order('numero', { ascending: false })
  if (error) return { data: null, error: traducir(error) }
  return { data: ((data ?? []) as Fila[]).map(reciboDeFila), error: null }
}

/** La foto del papel, por diez minutos. El bucket es privado: sin URL firmada no se ve. */
export async function urlDelPapel(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await supabase.storage.from('recibos').createSignedUrl(path, 600)
  return data?.signedUrl ?? null
}

/**
 * LA OBRA DE LA QUINCENA de cada persona: la de más horas imputadas en la ventana. Es la misma regla que
 * `emitir_recibos_pago()` congela en el recibo; acá sólo sirve para las filas que todavía no lo tienen.
 */
export function obraPorPersona(
  registros: readonly { persona_id: string; obra_canonica_id: string | null; horas: number | string | null }[],
  nombreDeObra: ReadonlyMap<string, string>,
): Map<string, string> {
  const suma = new Map<string, Map<string, number>>()
  for (const r of registros) {
    const obra = r.obra_canonica_id ? nombreDeObra.get(r.obra_canonica_id) : undefined
    if (!obra) continue
    const deLaPersona = suma.get(r.persona_id) ?? new Map<string, number>()
    deLaPersona.set(obra, (deLaPersona.get(obra) ?? 0) + Number(r.horas ?? 0))
    suma.set(r.persona_id, deLaPersona)
  }
  const out = new Map<string, string>()
  for (const [persona, obras] of suma) {
    const [primera] = [...obras.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    if (primera) out.set(persona, primera[0])
  }
  return out
}

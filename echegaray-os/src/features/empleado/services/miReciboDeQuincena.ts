// M09 · MI RECIBO DE PAGO — el recibo que la empresa me emitió por la quincena, en mi teléfono.
//
// ═══ NO ES `mi_recibo`, Y POR ESO NO LLEGABA ═══
//
// `mi_recibo` publica los PDF de sueldo que liquida el ESTUDIO: sale de `documentacion_legajo`, cuya clave
// útil es un `drive_file_id`. El recibo que arma el OS en Liquidación —horas, depositado, efectivo— vive en
// `recibo_liquidacion` y NO escribe en Drive, así que hasta hoy la persona no veía lo que se le emitía: se
// le pagaba la quincena, se imprimía un papel, y del otro lado no había nada. Este archivo es ese eslabón.
//
// Los dos conviven en la pantalla de Recibos y se dicen distinto, porque son cosas distintas.
//
// ═══ NO SE FILTRA POR PERSONA ACÁ ═══
//
// Lo filtra la policy `recibo_liquidacion_mio` (migración 20260922T2900). Un filtro en el cliente dejaría la
// base abierta: una llamada directa a PostgREST traería los recibos del plantel entero.
//
// ═══ NUNCA $ 0 POR FALTA DE DATO ═══
//
// Si el papel no decía un medio, la columna viaja `null` y la pantalla escribe que el recibo no lo decía.
// Un cero afirma «no cobraste nada», y eso es otra cosa.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/auth/services/authService'
import { esEstado, type CicloDelRecibo } from '@/shared/recibo/ciclo'
import type { RenglonesSellados } from '@/features/administracion/services/reciboEmitido'

/** El nombre de la migración que lo trae, para poder decirlo si falta en vez de mostrarse vacío. */
export const MIGRACION_DEL_CICLO = '20260922T2900_el_recibo_emitido_se_firma'

export interface MiReciboDeQuincena extends CicloDelRecibo {
  id: string
  codigo: string | null
  quincenaDesde: string
  quincenaHasta: string
  nombre: string
  categoria: string | null
  horas: number | null
  banco: number | null
  efectivo: number | null
  total: number | null
  renglones: RenglonesSellados
  emitidoEn: string
  /** El papel firmado que YO subí, si lo subí. */
  papelPath: string | null
}

const numero = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v)
const texto = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

function renglonesDe(v: unknown): RenglonesSellados {
  const o = (v ?? {}) as { horas?: unknown; medios?: unknown }
  return {
    horas: Array.isArray(o.horas) ? (o.horas as RenglonesSellados['horas']) : [],
    medios: Array.isArray(o.medios) ? (o.medios as RenglonesSellados['medios']) : [],
  }
}

function deLaFila(f: Record<string, unknown>): MiReciboDeQuincena {
  return {
    id: String(f.id),
    codigo: texto(f.codigo),
    quincenaDesde: String(f.quincena_desde ?? '').slice(0, 10),
    quincenaHasta: String(f.quincena_hasta ?? '').slice(0, 10),
    nombre: String(f.nombre ?? ''),
    categoria: texto(f.categoria),
    horas: numero(f.horas),
    banco: numero(f.banco),
    efectivo: numero(f.efectivo),
    total: numero(f.total),
    renglones: renglonesDe(f.renglones),
    emitidoEn: String(f.emitido_en ?? ''),
    // Un estado que esta versión no conoce no se dibuja como «emitido» —eso invitaría a firmar algo que
    // quizá ya está archivado—: se deja `observado`, que es el que obliga a preguntar.
    estado: esEstado(f.estado) ? f.estado : 'observado',
    enviadoEn: texto(f.enviado_en),
    trazo: texto(f.trazo),
    firmadoEn: texto(f.firmado_en),
    firmadoDesde: texto(f.firmado_desde),
    papelPath: texto(f.papel_path),
    papelSubidoEn: texto(f.papel_subido_en),
    archivadoEn: texto(f.archivado_en),
    observacion: texto(f.observacion),
  }
}

/** Los míos, el más reciente primero. */
export async function getMisRecibosDeQuincena(
  supabase: SupabaseClient,
): Promise<ServiceResult<MiReciboDeQuincena[]>> {
  const { data, error } = await supabase
    .from('recibo_liquidacion_emitido')
    .select('id, codigo, quincena_desde, quincena_hasta, nombre, categoria, horas, banco, efectivo, total, renglones, emitido_en, estado, enviado_en, trazo, firmado_en, firmado_desde, papel_path, papel_subido_en, archivado_en, observacion')
    .order('quincena_desde', { ascending: false })
    .order('emitido_en', { ascending: false })
  if (error) {
    // FALTA LA MIGRACIÓN vs NO TENÉS RECIBOS: no se dibujan iguales.
    const falta = error.code === '42P01' || error.code === '42703' || /recibo_liquidacion/.test(error.message)
    return {
      data: null,
      error: falta
        ? `Todavía no puedo mostrar tus recibos de quincena: falta aplicar en la base la migración ${MIGRACION_DEL_CICLO}.`
        : error.message,
    }
  }
  return { data: (data ?? []).map((f) => deLaFila(f as Record<string, unknown>)), error: null }
}

/** Uno solo. `null` sin error = no es tuyo o no existe, y las dos cosas se contestan igual: no está. */
export async function getMiReciboDeQuincena(
  supabase: SupabaseClient, id: string,
): Promise<ServiceResult<MiReciboDeQuincena | null>> {
  const todos = await getMisRecibosDeQuincena(supabase)
  if (todos.error) return { data: null, error: todos.error }
  return { data: (todos.data ?? []).find((r) => r.id === id) ?? null, error: null }
}

const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «16 al 30 de septiembre», como lo encabeza el papel. La quincena se dice, no se numera. */
export function periodoDicho(r: Pick<MiReciboDeQuincena, 'quincenaDesde' | 'quincenaHasta'>): string {
  const [, m1, d1] = r.quincenaDesde.split('-')
  const [a2, m2, d2] = r.quincenaHasta.split('-')
  const mes = MES[Number(m2) - 1] ?? m2
  if (m1 === m2) return `${Number(d1)} al ${Number(d2)} de ${mes} de ${a2}`
  const mes1 = MES[Number(m1) - 1] ?? m1
  return `${Number(d1)} de ${mes1} al ${Number(d2)} de ${mes} de ${a2}`
}

/** Corto, para la fila de la lista: «16–30/09». */
export const periodoCorto = (r: Pick<MiReciboDeQuincena, 'quincenaDesde' | 'quincenaHasta'>): string =>
  `${r.quincenaDesde.slice(8, 10)}–${r.quincenaHasta.slice(8, 10)}/${r.quincenaHasta.slice(5, 7)}`

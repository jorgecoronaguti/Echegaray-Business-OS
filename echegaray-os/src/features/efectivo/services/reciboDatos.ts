// LO QUE LEEN LA FICHA, LA PANTALLA DE FIRMA Y EL PDF DEL RECIBO FIRMADO. Todo con la sesión de quien mira: la RLS
// de `efectivo_recibo_firma` ya es «quien ve la entrega». Si la tabla todavía no existe (migración 20261001T0900
// sin aplicar) NO se dice «sin firmar»: se devuelve `null` y la ficha no ofrece nada que la base no puede hacer.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { nombresDePersonas } from '@/shared/personas/nombresDePersonas'
import { armarRecibo, type ObraDelGasto, type ReciboParaFirmar } from '../logica/recibo'
import { fraseDelRecibo, type FirmaDelRecibo } from '../logica/reciboFirma'
import { COLUMNAS_ENTREGA, COLUMNAS_RENDICION, type Entrega, type Rendicion } from '../types'

export interface ReciboFirmadoGuardado extends FirmaDelRecibo {
  rendicion_id: string
  entrega_id: string
  monto: number
  fecha: string
  concepto: string | null
  proveedor: string | null
}

const COLUMNAS = 'rendicion_id, entrega_id, monto, fecha, concepto, proveedor, trazo, aclaracion, dni, firmado_en'
// El número (RP-000123) llega con la migración 20261002T1200. El código se publica antes que la base: si la
// columna todavía no está, se lee sin ella. Sin esto un recibo firmado se leería como «sin firmar».
const COLUMNAS_CON_NUMERO = `${COLUMNAS}, codigo`
const SIN_COLUMNA = '42703'

/** Los ids de rendición que ya tienen el recibo firmado; `null` si no se pudo leer. */
export async function leerRendicionesFirmadas(ids: string[]): Promise<Set<string> | null> {
  if (!ids.length) return new Set()
  const supabase = await createClient()
  const { data, error } = await supabase.from('efectivo_recibo_firma').select('rendicion_id').in('rendicion_id', ids)
  if (error) return null
  return new Set((data ?? []).map((f: { rendicion_id: string }) => f.rendicion_id))
}

/** El recibo firmado de una rendición, con lo que se firmó; `null` si no está firmado (o no se puede ver). */
export async function leerReciboFirmado(supabase: SupabaseClient, rendicion: string): Promise<ReciboFirmadoGuardado | null> {
  const leer = (columnas: string) =>
    supabase.from('efectivo_recibo_firma').select(columnas).eq('rendicion_id', rendicion).maybeSingle()
  let { data, error } = await leer(COLUMNAS_CON_NUMERO)
  if (error?.code === SIN_COLUMNA) ({ data, error } = await leer(COLUMNAS))
  if (!data) return null
  const f = data as unknown as ReciboFirmadoGuardado
  return { ...f, monto: Number(f.monto) }
}

/** Lo que se firma ahora: el recibo armado desde la rendición viva y la frase que lee quien firma. */
export interface ReciboPorFirmar { rendicion: string; recibo: ReciboParaFirmar; frase: string }

type RendicionDelRecibo = Pick<Rendicion, 'id' | 'monto' | 'imputada_en' | 'fecha' | 'concepto' | 'proveedor'>
type EntregaDelRecibo = Pick<Entrega, 'codigo' | 'obra' | 'estructura' | 'obra_id' | 'persona_id' | 'persona'>

/** `null` si el gasto no tiene un importe válido para un recibo (monto cero o negativo). */
export async function leerReciboParaFirmar(r: RendicionDelRecibo, e: EntregaDelRecibo): Promise<ReciboPorFirmar | null> {
  const supabase = await createClient()
  const [codigos, nombres, gasto] = await Promise.all([
    codigosDeObra(supabase, [e.obra_id]), nombresDePersonas(supabase, [e.persona_id]), leerObraDelGasto(supabase, r.id),
  ])
  const recibo = armarRecibo({
    rendicion: r, entrega: e, gasto,
    codigoObra: e.obra_id ? codigos.get(e.obra_id) ?? null : null,
    pagador: nombres.get(e.persona_id) ?? e.persona,
  })
  return recibo ? { rendicion: r.id, recibo, frase: fraseDelRecibo(recibo) } : null
}

/**
 * La obra del gasto, leída de su fila de Compras (`compra_sheet`). `null` si el gasto todavía no tiene fila o la
 * sesión no la ve: en ese caso el recibo dice lo de la entrega, que es lo que se sabía antes.
 */
export async function leerObraDelGasto(supabase: SupabaseClient, rendicion: string): Promise<ObraDelGasto | null> {
  const { data: r } = await supabase.from('efectivo_rendicion').select('fila').eq('id', rendicion).maybeSingle()
  const fila = (r as { fila: number | null } | null)?.fila
  if (fila == null) return null
  const { data: c } = await supabase.from('compra_sheet').select('destino, obra_celda').eq('fila', fila).maybeSingle()
  const f = c as { destino: string | null; obra_celda: string | null } | null
  return f ? { destino: f.destino, obraCelda: f.obra_celda } : null
}

/**
 * La rendición MANUAL y su entrega, leídas con la sesión de quien pide: si la RLS no se las deja ver, vuelve
 * `null` igual que si no existieran. Un ticket no lleva recibo firmado (ya tiene su comprobante).
 */
export async function leerManualConEntrega(supabase: SupabaseClient, id: string): Promise<{ rendicion: Rendicion; entrega: Entrega } | null> {
  const { data: r } = await supabase.from('efectivo_rendicion').select(COLUMNAS_RENDICION).eq('id', id).maybeSingle()
  const rendicion = r as unknown as Rendicion | null
  if (!rendicion || rendicion.origen !== 'manual') return null
  const { data: en } = await supabase.from('efectivo_entrega_saldo').select(COLUMNAS_ENTREGA).eq('id', rendicion.entrega_id).maybeSingle()
  const entrega = en as unknown as Entrega | null
  return entrega ? { rendicion, entrega } : null
}

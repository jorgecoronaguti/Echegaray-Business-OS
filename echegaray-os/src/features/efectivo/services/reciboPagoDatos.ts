// LAS LECTURAS DEL RECIBO DE PAGO EN EFECTIVO A UN TERCERO — la lista de emitidos, lo que el panel ofrece
// para precargar, y un recibo para volver a imprimirlo.
//
// ═══ SIN LA MIGRACIÓN, LO DICE ═══
// Mientras `20261002T2300` no esté aplicada, `recibo_pago_efectivo` no existe: la lista dice que falta y el
// botón de emitir devuelve el mismo motivo. Nunca «no hay recibos»: eso sería afirmar que no se emitió ninguno.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { faltaMigracion } from '../logica/formularios'
import { DIAS_DE_COMPRAS, pagadaEnEfectivo, type CompraParaRecibo, type ReciboPagoImpreso } from '../logica/reciboPago'
import { diaAR } from '../logica/entregas'
import { nombreDeProveedor } from '../../../shared/proveedores/nombre.ts'
import { compararPorApellido, nombreLegal, nombreDePersona } from '../../../shared/personas/nombre.ts'

export const MIGRACION_RECIBO_PAGO = '20261002T2300'
/** La lista muestra los últimos; un recibo viejo se busca por su código en el PDF que ya se entregó. */
const ULTIMOS = 50

export interface ReciboEmitido extends ReciboPagoImpreso { id: string; emitidoEn: string; anuladoMotivo: string | null }

export type LecturaRecibos =
  | { estado: 'ok'; recibos: ReciboEmitido[] }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

const COLUMNAS = 'id, codigo, fecha, a_nombre_de, documento, importe, concepto, obra, emitido_en, anulado_en, anulado_motivo'
interface Fila {
  id: string; codigo: string; fecha: string; a_nombre_de: string; documento: string | null; importe: number | string
  concepto: string; obra: string | null; emitido_en: string; anulado_en: string | null; anulado_motivo: string | null
}

const aRecibo = (f: Fila): ReciboEmitido => ({
  id: f.id, codigo: f.codigo, fecha: f.fecha, aNombreDe: f.a_nombre_de, documento: f.documento, importe: Number(f.importe),
  concepto: f.concepto, obra: f.obra, anulado: f.anulado_en != null, emitidoEn: f.emitido_en, anuladoMotivo: f.anulado_motivo,
})

export async function leerRecibosEmitidos(): Promise<LecturaRecibos> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('recibo_pago_efectivo').select(COLUMNAS)
      .order('serie_numero', { ascending: false }).limit(ULTIMOS)
    if (faltaMigracion(error)) return { estado: 'falta_migracion' }
    if (error) return { estado: 'error', mensaje: error.message }
    return { estado: 'ok', recibos: ((data ?? []) as Fila[]).map(aRecibo) }
  } catch (err) {
    return { estado: 'error', mensaje: err instanceof Error ? err.message : 'No se pudo conectar con la base' }
  }
}

/** Un recibo para el PDF. `null` = no existe o la sesión no lo ve (la RLS decide: mismo 404). */
export async function leerReciboEmitido(supabase: SupabaseClient, id: string): Promise<ReciboEmitido | 'falta_migracion' | null> {
  const { data, error } = await supabase.from('recibo_pago_efectivo').select(COLUMNAS).eq('id', id).maybeSingle()
  if (faltaMigracion(error)) return 'falta_migracion'
  if (error || !data) return null
  return aRecibo(data as Fila)
}

/** Alguien del padrón a quien se le puede emitir: el documento precarga el campo si el padrón lo tiene. */
export interface DestinatarioDelPadron {
  tipo: 'proveedor' | 'persona'
  id: string
  nombre: string
  documento: string | null
}

export interface OpcionesReciboPago {
  padron: DestinatarioDelPadron[]
  compras: CompraParaRecibo[]
  hoy: string
}

const restarDias = (dia: string, n: number): string => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/**
 * LO QUE EL PANEL OFRECE. Proveedores activos con su CUIT; personas en la empresa con su DNI (por
 * `persona_legajo`: el grant por columna le niega dni/cuil a la tabla); filas de Compras pagadas en efectivo de
 * los últimos 15 días. Una lectura que falla deja su lista vacía: el nombre siempre se puede escribir a mano.
 */
export async function leerOpcionesReciboPago(): Promise<OpcionesReciboPago> {
  const hoy = diaAR(new Date().toISOString())
  const supabase = await createClient()
  const [prov, pers, legajo, compras] = await Promise.all([
    supabase.from('proveedores').select('id, nombre, razon_social, cuit').eq('activo', true).limit(3000),
    supabase.from('personas').select('id, nombre_completo, nombre_para_mostrar').eq('en_la_empresa', true).eq('es_prueba', false).limit(1000),
    supabase.from('persona_legajo').select('id, dni, cuil').limit(3000),
    supabase.from('compra_sheet').select('fila, fecha, proveedor, concepto, total, obra_texto, obra_id, cuit, tipo_pago, anulada')
      .gte('fecha', restarDias(hoy, DIAS_DE_COMPRAS)).ilike('tipo_pago', '%efectivo%')
      .order('fecha', { ascending: false }).order('fila', { ascending: false }).limit(200),
  ])
  const docDe = new Map<string, string>()
  for (const l of (legajo.data ?? []) as { id: string; dni: string | null; cuil: string | null }[]) {
    const d = String(l.dni ?? '').replace(/\D/g, '') || String(l.cuil ?? '').replace(/\D/g, '')
    if (d) docDe.set(l.id, d)
  }
  const proveedores: DestinatarioDelPadron[] = ((prov.data ?? []) as { id: string; nombre: string | null; razon_social: string | null; cuit: string | null }[])
    .map((p) => ({ tipo: 'proveedor' as const, id: p.id, nombre: nombreDeProveedor(p) ?? '', documento: String(p.cuit ?? '').replace(/\D/g, '') || null }))
    .filter((p) => p.nombre)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const personas: DestinatarioDelPadron[] = ((pers.data ?? []) as { id: string; nombre_completo: string | null; nombre_para_mostrar: string | null }[])
    .filter((p) => p.nombre_completo)
    .sort(compararPorApellido)
    // El papel lleva el nombre LEGAL: es un documento que se firma, no una pantalla.
    .map((p) => ({ tipo: 'persona' as const, id: p.id, nombre: nombreLegal(p.nombre_completo) ?? nombreDePersona(p), documento: docDe.get(p.id) ?? null }))
  type FilaCompra = { fila: number; fecha: string | null; proveedor: string | null; concepto: string | null; total: number | string | null; obra_texto: string | null; obra_id: string | null; cuit: string | null; tipo_pago: string | null; anulada: boolean | null }
  const filas = ((compras.data ?? []) as FilaCompra[])
    .filter((c) => pagadaEnEfectivo(c.tipo_pago) && !c.anulada)
    .map((c) => ({ fila: c.fila, fecha: c.fecha, proveedor: c.proveedor, concepto: c.concepto, total: c.total == null ? null : Number(c.total), obra: c.obra_texto, obraId: c.obra_id, cuit: c.cuit }))
  return { padron: [...proveedores, ...personas], compras: filas, hoy }
}

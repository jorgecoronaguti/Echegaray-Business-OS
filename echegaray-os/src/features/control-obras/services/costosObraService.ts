import type { SupabaseClient } from '@supabase/supabase-js'

// CONTROL DE OBRAS Fase 3 — COSTO POR OBRA. Lee los comprobantes reales de ARCA
// (public.comprobantes_arca, tipo_libro='R' = compras recibidas) y su atribución a obra.
// ARCA no trae la obra: la asigna el dueño (atribución humana asistida). Cero dato fabricado:
// un comprobante sin obra_texto es "sin asignar", no se adivina.

const COMPRAS = 'R' // tipo_libro de comprobantes recibidos (compras)

export interface ComprobanteArca {
  id: string
  fecha_emision: string | null
  emisor_nombre: string | null
  emisor_cuit: string | null
  numero: string | null
  imp_total: number | null
  periodo: string | null
  obra_texto: string | null
}

export interface CostoProveedor {
  proveedor: string
  cuit: string | null
  comprobantes: number
  total: number
}

export interface CostosObra {
  obra: string
  total: number
  comprobantes: number
  porProveedor: CostoProveedor[]
}

export interface ResumenAsignacion {
  sinAsignar: number
  montoSinAsignar: number
  asignados: number
  montoAsignado: number
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

// Lista canónica de obras para el selector: unión de las fuentes operativas (avance, pedidos,
// herramientas), deduplicada sin distinguir mayúsculas y con la mejor grafía (prefiere la del
// tracker de avance; si no, una con minúsculas antes que TODO EN MAYÚSCULAS).
export async function getObrasCanonicas(supabase: SupabaseClient): Promise<string[]> {
  const fuentes = await Promise.all([
    supabase.from('avance_obra').select('obra'),
    supabase.from('pedidos_materiales').select('obra_texto'),
    supabase.from('herramientas').select('ubicacion_actual'),
  ])
  const [avance, pedidos, herr] = fuentes
  const conteo = new Map<string, { display: string; deAvance: boolean }>()
  const add = (raw: unknown, deAvance: boolean) => {
    const v = String(raw ?? '').trim()
    if (!v) return
    const key = v.toLowerCase()
    const prev = conteo.get(key)
    if (!prev) {
      conteo.set(key, { display: v, deAvance })
      return
    }
    // Mejor grafía: la del tracker de avance gana; si no, la que tenga minúsculas (no gritada).
    if ((deAvance && !prev.deAvance) || (!/[a-z]/.test(prev.display) && /[a-z]/.test(v))) {
      conteo.set(key, { display: v, deAvance: prev.deAvance || deAvance })
    }
  }
  for (const r of avance.data ?? []) add((r as { obra: string }).obra, true)
  for (const r of pedidos.data ?? []) add((r as { obra_texto: string }).obra_texto, false)
  for (const r of herr.data ?? []) add((r as { ubicacion_actual: string }).ubicacion_actual, false)
  return [...conteo.values()].map((x) => x.display).sort((a, b) => a.localeCompare(b, 'es'))
}

// Comprobantes de compra SIN asignar a obra, mayor monto primero (los de más impacto para
// atribuir). Limit alto pero acotado para no traer las 443 de una.
export async function getComprobantesSinAsignar(supabase: SupabaseClient, limit = 200): Promise<ComprobanteArca[]> {
  const { data, error } = await supabase
    .from('comprobantes_arca')
    .select('id, fecha_emision, emisor_nombre, emisor_cuit, numero, imp_total, periodo, obra_texto')
    .eq('tipo_libro', COMPRAS)
    .is('obra_texto', null)
    .order('imp_total', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error || !data) return []
  return data as ComprobanteArca[]
}

// Resumen para el encabezado de la pantalla de asignación (cuánto falta atribuir).
export async function getResumenAsignacion(supabase: SupabaseClient): Promise<ResumenAsignacion> {
  const { data } = await supabase
    .from('comprobantes_arca')
    .select('imp_total, obra_texto')
    .eq('tipo_libro', COMPRAS)
  const r: ResumenAsignacion = { sinAsignar: 0, montoSinAsignar: 0, asignados: 0, montoAsignado: 0 }
  for (const c of (data ?? []) as { imp_total: number | null; obra_texto: string | null }[]) {
    const m = num(c.imp_total)
    if (c.obra_texto) { r.asignados++; r.montoAsignado += m } else { r.sinAsignar++; r.montoSinAsignar += m }
  }
  return r
}

// Costo real de UNA obra = comprobantes de ARCA asignados a ella, agrupado por proveedor.
export async function getCostosPorObra(supabase: SupabaseClient, obra: string): Promise<CostosObra> {
  const { data } = await supabase
    .from('comprobantes_arca')
    .select('emisor_nombre, emisor_cuit, imp_total')
    .eq('tipo_libro', COMPRAS)
    .eq('obra_texto', obra)
  const porProv = new Map<string, CostoProveedor>()
  let total = 0
  let n = 0
  for (const c of (data ?? []) as { emisor_nombre: string | null; emisor_cuit: string | null; imp_total: number | null }[]) {
    const m = num(c.imp_total)
    total += m
    n++
    const key = c.emisor_cuit || c.emisor_nombre || 'sin proveedor'
    const prev = porProv.get(key)
    if (prev) { prev.comprobantes++; prev.total += m } else {
      porProv.set(key, { proveedor: c.emisor_nombre || 'Sin nombre', cuit: c.emisor_cuit, comprobantes: 1, total: m })
    }
  }
  return {
    obra,
    total,
    comprobantes: n,
    porProveedor: [...porProv.values()].sort((a, b) => b.total - a.total),
  }
}

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

// Clave de proveedor para cruzar historial: CUIT primero (confiable), nombre normalizado si no.
// La MISMA clave se usa al construir el historial y al buscarle sugerencia a un comprobante.
export function provKey(cuit: string | null, nombre: string | null): string {
  const c = String(cuit ?? '').replace(/\D/g, '')
  if (c) return `cuit:${c}`
  const n = String(nombre ?? '').trim().toLowerCase()
  return n ? `name:${n}` : ''
}

// Fase 3.1 — sugerencia de obra por HISTORIAL del proveedor. `veces` de `deTotal` comprobantes
// ya asignados de ese proveedor fueron a `obra`. unánime = todos fueron a la misma obra.
export interface SugerenciaObra {
  obra: string
  veces: number
  deTotal: number
  unanime: boolean
}

export type ComprobanteConSugerencia = ComprobanteArca & { sugerencia: SugerenciaObra | null }

// Historial de atribución por proveedor: a qué obra imputaste antes cada uno. 0-API, solo lee lo
// que VOS ya asignaste — no adivina. Si un proveedor no tiene historial, no hay sugerencia; si
// imputaste a varias obras, propone la dominante mostrando la evidencia (N de M). Propone, no aplica.
export async function getSugerenciasProveedor(supabase: SupabaseClient): Promise<Map<string, SugerenciaObra>> {
  const { data } = await supabase
    .from('comprobantes_arca')
    .select('emisor_nombre, emisor_cuit, obra_texto')
    .eq('tipo_libro', COMPRAS)
    .not('obra_texto', 'is', null)
  const porProv = new Map<string, Map<string, number>>()
  for (const c of (data ?? []) as { emisor_nombre: string | null; emisor_cuit: string | null; obra_texto: string | null }[]) {
    const key = provKey(c.emisor_cuit, c.emisor_nombre)
    const obra = String(c.obra_texto ?? '').trim()
    if (!key || !obra) continue
    if (!porProv.has(key)) porProv.set(key, new Map())
    const m = porProv.get(key)!
    m.set(obra, (m.get(obra) ?? 0) + 1)
  }
  const out = new Map<string, SugerenciaObra>()
  for (const [key, obras] of porProv) {
    let total = 0
    let top = ''
    let topN = 0
    for (const [obra, n] of obras) {
      total += n
      if (n > topN) { topN = n; top = obra }
    }
    if (top) out.set(key, { obra: top, veces: topN, deTotal: total, unanime: obras.size === 1 })
  }
  return out
}

// Comprobantes sin asignar YA con su sugerencia de obra adjunta (Fase 3.1). Una sola pasada,
// 0-API: cruza cada comprobante con el historial de su proveedor.
export async function getComprobantesSinAsignarConSugerencia(
  supabase: SupabaseClient,
  limit = 200,
): Promise<ComprobanteConSugerencia[]> {
  const [comprobantes, sugerencias] = await Promise.all([
    getComprobantesSinAsignar(supabase, limit),
    getSugerenciasProveedor(supabase),
  ])
  return comprobantes.map((c) => ({
    ...c,
    sugerencia: sugerencias.get(provKey(c.emisor_cuit, c.emisor_nombre)) ?? null,
  }))
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

// Normaliza un nombre de obra para cruzar grafías ("LA ESTRELLA"/"Estrella", "MESSINAS"/"Messina",
// "SAN FRANCISCO"/"San Francisco"). Saca acentos, artículos y puntuación.
function normObra(s: string): string {
  return String(s ?? '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\b(la|el|los|las|de|del)\b/g, ' ')
    .replace(/\s+/g, ' ').trim()
}
function obraMatch(a: string, b: string): boolean {
  const na = normObra(a), nb = normObra(b)
  if (!na || !nb) return false
  if (na === nb || na.includes(nb) || nb.includes(na)) return true
  const wa = na.split(' ')[0], wb = nb.split(' ')[0]
  return wa.length > 3 && wa === wb
}

// Costo real de UNA obra = compras del Sheet Flujo de Caja (pestaña Compras) que el dueño YA
// asignó a esa obra (public.costos_obra, sincronizado por sync-compras.mjs), agrupado por proveedor.
// Antes leía comprobantes_arca sin asignar → siempre $0. El match es por nombre normalizado
// (las obras viven como texto con grafías distintas entre fuentes).
export async function getCostosPorObra(supabase: SupabaseClient, obra: string): Promise<CostosObra> {
  const { data } = await supabase
    .from('costos_obra')
    .select('proveedor, total, obra_texto')
  const porProv = new Map<string, CostoProveedor>()
  let total = 0
  let n = 0
  for (const c of (data ?? []) as { proveedor: string | null; total: number | null; obra_texto: string }[]) {
    if (!obraMatch(c.obra_texto, obra)) continue
    const m = num(c.total)
    total += m
    n++
    const key = c.proveedor || 'sin proveedor'
    const prev = porProv.get(key)
    if (prev) { prev.comprobantes++; prev.total += m } else {
      porProv.set(key, { proveedor: c.proveedor || 'Sin proveedor', cuit: null, comprobantes: 1, total: m })
    }
  }
  return {
    obra,
    total,
    comprobantes: n,
    porProveedor: [...porProv.values()].sort((a, b) => b.total - a.total),
  }
}

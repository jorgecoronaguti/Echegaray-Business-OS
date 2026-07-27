import type { SupabaseClient } from '@supabase/supabase-js'
import type { Capacidad, ChatDato, ChatRespuesta } from '../types'

// BACKEND DEL CHAT INTERNO (F7) — 0 API. Recibe la capacidad ya ruteada (por
// orquestador/lib/chat-intents.mjs · routeConsulta) y arma la respuesta LEYENDO las tablas que el OS ya
// materializó (patrón la-web-lee): nunca recalcula un peso ni llama al orquestador. Cada número sale de
// una fila que un sync escribió; la propiedad del dato queda en `fuente` (fuente única, no se duplica).
//
// HONESTIDAD: lo que una capacidad no trae se muestra como 'sin_datos' (nunca un peso inventado); una
// pregunta sin capacidad se responde en el route handler con cubierta:false.

// numeric de Postgres llega por PostgREST como STRING. Coerción sin inventar (null si no es finito).
function aNumero(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

type Unidad = 'pesos' | 'porcentaje' | 'dias' | 'cantidad' | 'texto'

// Presentación pura: el número YA viene calculado desde la tabla, acá sólo se formatea a es-AR.
function fmtValor(valor: number | null, unidad: Unidad): string {
  if (valor === null) return 'aún sin datos'
  switch (unidad) {
    case 'pesos':
      return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
    case 'porcentaje':
      return `${valor.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
    case 'dias':
      return `${valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })} días`
    case 'cantidad':
      return valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })
    default:
      return String(valor)
  }
}

interface FilaScorecard {
  metrica: string
  etiqueta: string
  valor: string | number | null
  unidad: string
  estado: string
  fuente_unica: string
  seccion: string
  orden: number
  capturado_en: string
}

// Métricas del scorecard vigente que expone cada capacidad financiera (todas viven en la MISMA tabla
// materializada; acá sólo elegimos el subconjunto que responde la pregunta).
const METRICAS_POR_CAPACIDAD: Record<'caja' | 'cobranzas' | 'obligaciones', string[]> = {
  caja: ['caja_hoy', 'proyeccion_7dias', 'colchon_total'],
  cobranzas: ['cobranzas_por_cobrar_mes', 'cobranzas_vencidas'],
  obligaciones: ['obligaciones_saldo', 'obligaciones_vencido', 'deuda_comercial_vencida'],
}

const TITULO: Record<Capacidad, string> = {
  caja: 'Posición de caja',
  cobranzas: 'Cobranzas',
  obligaciones: 'Obligaciones y deuda',
  obra: 'Obras — costo real y avance',
  scorecard: 'Scorecard Admin/Finanzas',
}

function filaDato(f: FilaScorecard): ChatDato {
  return {
    etiqueta: f.etiqueta,
    valor: fmtValor(aNumero(f.valor), (f.unidad as Unidad) ?? 'texto'),
    fuente: f.fuente_unica,
    estado: f.estado === 'sin_datos' ? 'sin_datos' : 'ok',
  }
}

async function leerScorecardVigente(supabase: SupabaseClient): Promise<{ filas: FilaScorecard[]; error: string | null }> {
  const { data, error } = await supabase
    .from('finanzas_scorecard_vigente')
    .select('metrica, etiqueta, valor, unidad, estado, fuente_unica, seccion, orden, capturado_en')
    .eq('area', 'admin_finanzas')
    .order('seccion', { ascending: true })
    .order('orden', { ascending: true })
  if (error) return { filas: [], error: error.message }
  return { filas: (data ?? []) as FilaScorecard[], error: null }
}

// ── Capacidades financieras: leen el scorecard vigente (fuente única de la LECTURA fechada) ──
async function responderFinanciera(
  supabase: SupabaseClient,
  capacidad: 'caja' | 'cobranzas' | 'obligaciones' | 'scorecard',
): Promise<ChatRespuesta> {
  const { filas, error } = await leerScorecardVigente(supabase)
  if (error) {
    return {
      cubierta: true, capacidad, titulo: TITULO[capacidad], intro: null, datos: [],
      nota: `No pude leer el scorecard (${error}). Si no hay sesión, el error es de permisos (RLS).`,
      capturadoEn: null,
    }
  }
  if (!filas.length) {
    return {
      cubierta: true, capacidad, titulo: TITULO[capacidad], intro: null, datos: [],
      nota: 'El scorecard todavía no tiene una corrida materializada. Cuando el sync corra, esto se responde solo.',
      capturadoEn: null,
    }
  }
  const capturadoEn = filas[0]?.capturado_en ?? null
  const seleccion =
    capacidad === 'scorecard'
      ? filas
      : filas.filter((f) => METRICAS_POR_CAPACIDAD[capacidad].includes(f.metrica))
  const datos = seleccion.map(filaDato)
  const intro =
    capacidad === 'scorecard'
      ? 'Estado del área y del propio OS, leído del scorecard materializado (fuente única por fila).'
      : 'Leído del scorecard vigente. Cada fila apunta a su fuente única (no se recalcula acá).'
  return { cubierta: true, capacidad, titulo: TITULO[capacidad], intro, datos, nota: null, capturadoEn }
}

// ── Obra: costo real (suma de comprobantes por obra) + avance físico, ambas tablas ya materializadas ──
interface FilaCosto { obra_texto: string | null; total: number | string | null }
interface FilaAvance { obra: string | null; avance_promedio: number | string | null; sincronizado_en: string | null }

function normObra(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

async function responderObra(supabase: SupabaseClient, texto: string): Promise<ChatRespuesta> {
  const [costosRes, avanceRes] = await Promise.all([
    supabase.from('costos_obra').select('obra_texto, total'),
    supabase.from('avance_obra').select('obra, avance_promedio, sincronizado_en'),
  ])
  if (costosRes.error || avanceRes.error) {
    const err = costosRes.error?.message ?? avanceRes.error?.message ?? 'error de lectura'
    return {
      cubierta: true, capacidad: 'obra', titulo: TITULO.obra, intro: null, datos: [],
      nota: `No pude leer las obras (${err}). Sin sesión el error es de permisos (RLS).`, capturadoEn: null,
    }
  }
  // Costo real por obra = suma de comprobantes imputados (HECHO, respaldado por costos_obra).
  const costoPorObra = new Map<string, number>()
  for (const f of (costosRes.data ?? []) as FilaCosto[]) {
    const nombre = (f.obra_texto ?? '').trim()
    if (!nombre) continue
    costoPorObra.set(nombre, (costoPorObra.get(nombre) ?? 0) + (aNumero(f.total) ?? 0))
  }
  const avancePorObra = new Map<string, number | null>()
  let capturadoEn: string | null = null
  for (const f of (avanceRes.data ?? []) as FilaAvance[]) {
    const nombre = (f.obra ?? '').trim()
    if (!nombre) continue
    avancePorObra.set(nombre, aNumero(f.avance_promedio))
    if (f.sincronizado_en && (!capturadoEn || f.sincronizado_en > capturadoEn)) capturadoEn = f.sincronizado_en
  }
  const nombres = Array.from(new Set([...costoPorObra.keys(), ...avancePorObra.keys()]))
  if (!nombres.length) {
    return {
      cubierta: true, capacidad: 'obra', titulo: TITULO.obra, intro: null, datos: [],
      nota: 'Todavía no hay costos ni avance materializados por obra.', capturadoEn: null,
    }
  }
  // Si la pregunta nombra una obra concreta, filtramos a esa; si no, listamos todas.
  const q = normObra(texto)
  const mencionadas = nombres.filter((n) => n.length >= 3 && q.includes(normObra(n)))
  const objetivo = mencionadas.length ? mencionadas : nombres
  const datos: ChatDato[] = []
  for (const n of objetivo.sort((a, b) => a.localeCompare(b))) {
    const costo = costoPorObra.get(n)
    const avance = avancePorObra.get(n)
    const partes: string[] = []
    if (costo !== undefined) partes.push(`costo real ${fmtValor(costo, 'pesos')}`)
    if (avance !== undefined && avance !== null) partes.push(`avance ${fmtValor(avance, 'porcentaje')}`)
    datos.push({
      etiqueta: n,
      valor: partes.length ? partes.join(' · ') : 'aún sin datos',
      fuente: 'costos_obra · avance_obra',
      estado: partes.length ? 'ok' : 'sin_datos',
    })
  }
  const intro = mencionadas.length
    ? 'Costo real (suma de comprobantes imputados) y avance físico de la obra. No incluye margen: eso necesita certificación, que el chat todavía no cruza.'
    : 'Costo real y avance por obra. Preguntá por una obra puntual para acotar. No incluye margen (falta cruzar certificación).'
  return { cubierta: true, capacidad: 'obra', titulo: TITULO.obra, intro, datos, nota: null, capturadoEn }
}

/**
 * Ejecuta la capacidad ya ruteada y devuelve la respuesta lista para pintar. `capacidad` viene de
 * routeConsulta (chat-intents.mjs); el caso null (no cubierto) lo maneja el route handler.
 */
export async function responderCapacidad(
  supabase: SupabaseClient,
  capacidad: Capacidad,
  texto: string,
): Promise<ChatRespuesta> {
  if (capacidad === 'obra') return responderObra(supabase, texto)
  return responderFinanciera(supabase, capacidad)
}

// Qué SÍ puede responder hoy — se muestra cuando la pregunta no matchea (honestidad, sin inventar).
export const CAPACIDADES_DISPONIBLES = [
  'Caja y liquidez (caja hoy, proyección 7 días, colchón)',
  'Cobranzas (por cobrar del mes, vencidas)',
  'Obligaciones y deuda (saldo, vencido, deuda comercial)',
  'Obras (costo real y avance físico por obra)',
  'Scorecard Admin/Finanzas y métricas del propio OS (precisión del forecast, frescura de fuentes)',
] as const

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

// ── Obra: costo real + avance físico, los dos de `obra_panel` ───────────────────────────────
//
// ═══ ESTA FUNCIÓN PUBLICABA OTRO AVANCE QUE LA WEB (17/08/2026) ═══
//
// Cruzaba `costos_obra` con `avance_obra` pegándolas por texto. Dos defectos, los dos corregidos:
// el avance venía de un cálculo distinto al de /obras —el chat decía San Francisco 85% y la web
// 44%, leyendo el mismo archivo de Drive en el mismo minuto— y el cruce por grafía dejaba
// "LE - Comedor" y "Comedor" como si fueran dos obras. `obra_panel` resuelve las dos: alias
// canónico para el nombre y `obra_avance` —la definición única— para el porcentaje.
interface FilaPanel {
  nombre: string
  costo_real: number | string | null
  avance_pct: number | string | null
  n_actividades_medidas: number | null
  n_actividades_sin_planificar: number | null
  avance_sincronizado_en: string | null
}

function normObra(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

async function responderObra(supabase: SupabaseClient, texto: string): Promise<ChatRespuesta> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('nombre, costo_real, avance_pct, n_actividades_medidas, n_actividades_sin_planificar, avance_sincronizado_en')
  if (error) {
    return {
      cubierta: true, capacidad: 'obra', titulo: TITULO.obra, intro: null, datos: [],
      nota: `No pude leer las obras (${error.message}). Sin sesión el error es de permisos (RLS).`, capturadoEn: null,
    }
  }
  const filas = (data ?? []) as FilaPanel[]
  let capturadoEn: string | null = null
  for (const f of filas) {
    if (f.avance_sincronizado_en && (!capturadoEn || f.avance_sincronizado_en > capturadoEn)) {
      capturadoEn = f.avance_sincronizado_en
    }
  }
  if (!filas.length) {
    return {
      cubierta: true, capacidad: 'obra', titulo: TITULO.obra, intro: null, datos: [],
      nota: 'Todavía no hay obras cargadas.', capturadoEn: null,
    }
  }
  // Si la pregunta nombra una obra concreta, filtramos a esa; si no, listamos todas.
  const q = normObra(texto)
  const mencionadas = filas.filter((f) => f.nombre.length >= 3 && q.includes(normObra(f.nombre)))
  const objetivo = mencionadas.length ? mencionadas : filas
  const datos: ChatDato[] = []
  for (const f of [...objetivo].sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const costo = aNumero(f.costo_real)
    const avance = aNumero(f.avance_pct)
    const partes: string[] = []
    if (costo !== null && costo !== 0) partes.push(`costo real ${fmtValor(costo, 'pesos')}`)
    if (avance !== null) {
      // EL PROMEDIO NO VA SOLO: sobre cuántas actividades se tomó es parte del número, no una nota
      // al pie. Publicar "85%" sin decir que salía de 24 de 119 actividades fue el defecto entero.
      const medidas = f.n_actividades_medidas ?? 0
      const sinFecha = f.n_actividades_sin_planificar ?? 0
      const cobertura = sinFecha > 0 ? `${medidas} actividades, ${sinFecha} sin fecha` : `${medidas} actividades`
      partes.push(`avance ${fmtValor(avance, 'porcentaje')} (${cobertura})`)
    }
    datos.push({
      etiqueta: f.nombre,
      valor: partes.length ? partes.join(' · ') : 'aún sin datos',
      fuente: 'obra_panel · obra_avance',
      estado: partes.length ? 'ok' : 'sin_datos',
    })
  }
  const intro = mencionadas.length
    ? 'Costo real (suma de comprobantes imputados) y avance físico de la obra, del mismo cálculo que publica /obras. No incluye margen: eso necesita certificación, que el chat todavía no cruza.'
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

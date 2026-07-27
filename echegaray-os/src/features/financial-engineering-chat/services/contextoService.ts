import type { SupabaseClient } from '@supabase/supabase-js'
import { getModeloLiquidez, getPriorizarPagos } from '@/features/ingenieria-financiera/services/tableroService'

// Arma el CONTEXTO FINANCIERO que consumen las tres lentes — SÓLO-LECTURA. No recalcula un peso: lee
// las salidas que el motor de Ingeniería Financiera YA materializó (finanzas_modelo_liquidez, que
// consolida caja + cobranzas + obligaciones + descubierto + colchón, y finanzas_priorizar_pagos para
// los próximos pagos como señal). Si una fuente no está, el campo queda null y el núcleo lo declara
// "No tengo ese dato" — nunca se inventa una cifra. El OS NO toca el Google Sheet.

// El shape que espera construirContextoTexto en el núcleo (orquestador/lib/fe-multiexperto.mjs).
export interface ContextoFinanciero {
  caja: { hoy: number | null; proyeccion7: number | null; colchon: number | null }
  cobranzas: { porCobrarMes: number | null; vencidas: number | null }
  obligaciones: { saldo: number | null; vencido: number | null; deudaComercialVencida: number | null }
  descubierto: { cftAnual: number | null; limite: number | null; usado: number | null }
  notas: string[]
  capturadoEn: string | null
}

// numeric de Postgres puede llegar como string; coerción honesta (null si no es finito).
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Lee el contexto financiero vigente. Devuelve { contexto } o { error } si no hay ni siquiera un
 * modelo de liquidez materializado (el OS todavía no corrió el motor / no hay sesión con permisos).
 */
export async function leerContextoFinanciero(
  supabase: SupabaseClient,
): Promise<{ contexto?: ContextoFinanciero; error?: string }> {
  const [modeloRes, pagosRes] = await Promise.all([getModeloLiquidez(supabase), getPriorizarPagos(supabase)])

  if (!modeloRes.data) {
    // Sin el modelo de liquidez no hay contexto real que darle a las lentes: honesto, no inventamos.
    return { error: modeloRes.error ?? 'Todavía no hay un modelo de liquidez materializado por el motor.' }
  }

  const m = modeloRes.data.modelo
  const disp = m.disponible ?? {}
  const comp = m.comprometido ?? {}
  const comercial = m.deuda_comercial ?? {}
  const desc = m.lineas?.descubierto ?? { limite: null, cft: undefined, usado_aprox: null }
  const cft = num(desc.cft)

  // Señales de texto que el motor ya produjo (recomendaciones + próximos pagos priorizados). Son TEXTO,
  // no cifras nuevas: se pasan tal cual para que las lentes las lean. Acotadas para no inflar el prompt.
  const notas: string[] = []
  for (const rec of (modeloRes.data.recomendaciones ?? []).slice(0, 3)) {
    if (rec?.titulo) notas.push(`Recomendación del motor: ${rec.titulo}${rec.explicacion ? ` — ${rec.explicacion}` : ''}`)
  }
  const pagos = pagosRes.data?.priorizacion?.pagos ?? []
  for (const p of pagos.slice(0, 4)) {
    if (!p?.proveedor) continue
    const monto = num(p.monto)
    const montoTxt = monto !== null ? `$${Math.round(monto).toLocaleString('es-AR')}` : 's/monto'
    notas.push(`Pago priorizado: ${p.proveedor} ${montoTxt} → ${p.decision ?? 's/decisión'}${p.motivo ? ` (${p.motivo})` : ''}`)
  }

  const contexto: ContextoFinanciero = {
    caja: {
      hoy: num(disp.caja_hoy),
      proyeccion7: num(disp.proyeccion_7dias),
      colchon: num(m.colchon_total),
    },
    cobranzas: {
      porCobrarMes: num(disp.cobranzas_por_cobrar_mes),
      vencidas: num(disp.cobranzas_vencidas),
    },
    obligaciones: {
      saldo: num(comp.saldo_total),
      vencido: num(comp.vencido),
      deudaComercialVencida: num(comercial.vencido),
    },
    descubierto: {
      // El motor guarda cft/tna como FRACCIÓN (0,6278 = 62,78%), igual que lo trata el tablero
      // (shared/utils/format · pct multiplica ×100). El núcleo espera cftAnual ya en % → convertimos acá.
      cftAnual: cft === null ? null : cft * 100,
      limite: num(desc.limite),
      usado: num(desc.usado_aprox),
    },
    notas,
    capturadoEn: modeloRes.data.calculado_en ?? m.fecha ?? null,
  }

  return { contexto }
}

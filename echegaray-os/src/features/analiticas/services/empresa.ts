// CAJA, NÓMINA Y COBRANZA: LO QUE NO ES DE UNA OBRA SINO DE LA EMPRESA.
//
// Tres lecturas puras sobre filas ya leídas (`egreso_por_area`, `nomina_por_mes`, `personas`,
// `cuenta_corriente_de_clientes`, `certificado_cliente`). Ninguna inventa un dato para completar el
// gráfico: una estimación se marca como tal, y un cliente sin certificado no se ubica en la línea
// de antigüedad —no hay fecha de la que medirla—.
import type { CertificadoCliente } from '../../clientes/types/cobranzas.ts'
import { planDeCobranza } from '../../clientes/services/reglasCobranza.ts'

const n = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const mes = (v: unknown): string | null => (typeof v === 'string' && v.length >= 7 ? v.slice(0, 7) : null)

// ─── Caja ───────────────────────────────────────────────────────────────────────────────────────

export type Destino = 'obra' | 'estructura' | 'sinDestino'
export interface Egreso { area: string | null; grupo: string | null; total: number; mes: string }

/** Las ramas de Estructura, en el orden del árbol. */
export const RAMAS_ESTRUCTURA: Record<string, string> = {
  personas: 'Nómina',
  compras: 'Taller, estructura y flota',
  contabilidad_legales: 'Impuestos',
  administracion_finanzas: 'Bancario y financiero',
}

export function destinoDe(area: string | null): Destino {
  if (area === 'obras') return 'obra'
  if (area == null || area === 'sin_clasificar' || !(area in RAMAS_ESTRUCTURA)) return 'sinDestino'
  return 'estructura'
}

export function leerEgresos(filas: unknown[]): Egreso[] {
  return filas.flatMap((f) => {
    const r = f as Record<string, unknown>
    const total = n(r.total)
    const m = mes(r.fecha) ?? mes(r.mes)
    return total == null || m == null ? [] : [{ area: typeof r.area === 'string' ? r.area : null, grupo: typeof r.grupo === 'string' ? r.grupo : null, total, mes: m }]
  })
}

export interface Caja {
  salio: number
  aObra: number
  estructura: number
  sinDestino: number
  nSinDestino: number
  ramas: { rotulo: string; total: number }[]
  /** Pesos de estructura por cada peso que va a una obra. `null` sin egreso a obras. */
  estructuraPorPesoDeObra: number | null
  meses: { mes: string; aObra: number; estructura: number }[]
}

export function caja(egresos: Egreso[]): Caja {
  const c: Caja = { salio: 0, aObra: 0, estructura: 0, sinDestino: 0, nSinDestino: 0, ramas: [], estructuraPorPesoDeObra: null, meses: [] }
  const ramas = new Map<string, number>()
  const meses = new Map<string, { aObra: number; estructura: number }>()
  for (const e of egresos) {
    c.salio += e.total
    const d = destinoDe(e.area)
    const mm = meses.get(e.mes) ?? { aObra: 0, estructura: 0 }
    if (d === 'obra') { c.aObra += e.total; mm.aObra += e.total }
    if (d === 'estructura') {
      c.estructura += e.total
      mm.estructura += e.total
      const r = RAMAS_ESTRUCTURA[e.area ?? '']
      ramas.set(r, (ramas.get(r) ?? 0) + e.total)
    }
    if (d === 'sinDestino') { c.sinDestino += e.total; c.nSinDestino++ }
    meses.set(e.mes, mm)
  }
  c.ramas = [...ramas.entries()].map(([rotulo, total]) => ({ rotulo, total })).sort((a, b) => b.total - a.total)
  c.estructuraPorPesoDeObra = c.aObra > 0 ? c.estructura / c.aObra : null
  c.meses = [...meses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ mes: m, ...v }))
  return c
}

// ─── Nómina ─────────────────────────────────────────────────────────────────────────────────────

/** La base contra la que se mide la suba: marzo, el último mes con paritaria cerrada antes de la serie. */
export const MES_BASE = '2026-03'

export interface MesNomina { mes: string; costo: number | null; estimacion: boolean; contraBase: number | null }

/**
 * LOS MESES DE NÓMINA. Un mes marcado estimación NO se grafica como dato: `nomina_por_mes` publica en
 * los meses proyectados un factor (2,04, 2,08…) en la columna de pesos, y dibujarlo en la misma línea
 * sería una caída de $ 30 M a $ 2 que no existió. Se lista como estimación y la línea termina antes.
 */
export function nomina(filas: unknown[], rango: { desde: string | null; hasta: string | null }): { base: number | null; meses: MesNomina[] } {
  const todos = filas.flatMap((f) => {
    const r = f as Record<string, unknown>
    const m = mes(r.mes)
    return m ? [{ mes: m, costo: n(r.costo_nomina), estimacion: r.es_estimacion === true }] : []
  })
  const base = todos.find((x) => x.mes === MES_BASE && !x.estimacion)?.costo ?? null
  const desde = rango.desde?.slice(0, 7) ?? null
  const hasta = rango.hasta?.slice(0, 7) ?? null
  const meses = todos
    .filter((x) => (desde == null || x.mes >= desde) && (hasta == null || x.mes <= hasta))
    .map((x) => ({
      ...x,
      costo: x.estimacion ? null : x.costo,
      contraBase: !x.estimacion && base && x.costo != null ? x.costo / base - 1 : null,
    }))
  return { base, meses }
}

export interface Legajos { plantel: number; conCategoria: number; sinCategoria: number }

/** El plantel por PERTENENCIA (`en_la_empresa`), no por fecha de egreso: la fecha falta en muchos legajos. */
export function legajos(filas: unknown[]): Legajos {
  const dentro = filas.filter((f) => (f as Record<string, unknown>).en_la_empresa === true)
  const sin = dentro.filter((f) => {
    const c = (f as Record<string, unknown>).categoria
    return c == null || c === ''
  }).length
  return { plantel: dentro.length, conCategoria: dentro.length - sin, sinCategoria: sin }
}

// ─── Cobranza ───────────────────────────────────────────────────────────────────────────────────

export type EstadoCobro = 'vencido' | 'alDia'
export interface FilaCobranza {
  clienteId: string
  nombre: string
  saldo: number
  vencido: number
  /** Días desde la emisión del documento pendiente más viejo. `null` = sin certificado: no se ubica. */
  dias: number | null
  estado: EstadoCobro
  verbo: string | null
}

const diasEntre = (desde: string, hasta: string): number =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)) / 86_400_000)

export function zonaDe(dias: number): 0 | 1 | 2 | 3 {
  return dias <= 30 ? 0 : dias <= 60 ? 1 : dias <= 90 ? 2 : 3
}

export function cobranza(cuenta: unknown[], certificados: CertificadoCliente[], hoy: string): FilaCobranza[] {
  return cuenta.flatMap((f): FilaCobranza[] => {
    const r = f as Record<string, unknown>
    const saldo = n(r.saldo) ?? 0
    if (saldo <= 0 || typeof r.cliente_id !== 'string') return []
    const docs = certificados.filter((d) => d.cliente_id === r.cliente_id && d.estado !== 'cobrado')
    const emisiones = docs.map((d) => d.emitido_at).filter((x): x is string => x != null).sort()
    const vencido = n(r.vencido) ?? 0
    return [{
      clienteId: r.cliente_id, nombre: String(r.nombre_comercial ?? ''), saldo, vencido,
      dias: emisiones.length ? Math.max(0, diasEntre(emisiones[0], hoy)) : null,
      estado: vencido > 0 ? 'vencido' : 'alDia',
      verbo: planDeCobranza(docs, hoy)[0]?.rotulo ?? null,
    }]
  }).sort((a, b) => b.saldo - a.saldo)
}

export function cifrasCobranza(filas: FilaCobranza[]): { porCobrar: number; masDe60: number; alDia: number } {
  return {
    porCobrar: filas.reduce((a, f) => a + f.saldo, 0),
    masDe60: filas.filter((f) => (f.dias ?? 0) > 60).reduce((a, f) => a + f.saldo, 0),
    alDia: filas.filter((f) => f.estado === 'alDia').reduce((a, f) => a + f.saldo, 0),
  }
}

// CAJA, NÓMINA Y COBRANZA: LO QUE NO ES DE UNA OBRA SINO DE LA EMPRESA.
//
// Tres lecturas puras sobre filas ya leídas (`egreso_por_area`, `nomina_por_mes`, `personas`,
// `cuenta_corriente_de_clientes`). Ninguna inventa un dato para completar el
// gráfico: una estimación se marca como tal, y un cliente sin certificado no se ubica en la línea
// de antigüedad —no hay fecha de la que medirla—.
import type { CuentaCorriente } from '../../clientes/types/cobranzas.ts'
import { documentosDeCobranzas } from '../../clientes/services/documentoDeCobranza.ts'
import { bandasAntiguedad, planDeCobranza, type ClaveBanda } from '../../clientes/services/reglasCobranza.ts'

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

export type EstadoMes = 'real' | 'incompleto' | 'estimacion'
export interface MesNomina { mes: string; costo: number | null; estado: EstadoMes; contraBase: number | null }

/**
 * QUÉ MES ES UN DATO. Tres estados, y sólo `real` entra a una suma o a una variación:
 *
 *   · `estimacion` — `nomina_por_mes` lo marca proyectado, y en esos meses publica un factor (2,04…) en
 *     la columna de pesos: dibujarlo sería una caída de $ 30 M a $ 2 que no existió.
 *   · `incompleto` — las cargas sociales todavía en 0, o una quincena de `jornales_quincena` EN CURSO.
 *     Julio 2026 salía «real» con $ 15,01 M y «−31 %» contra marzo: le faltaban el F931 y media
 *     quincena (auditoría 17/09/2026, D1). Un mes a medio liquidar no bajó el costo: no terminó.
 *   · `real` — todo lo demás.
 */
export function nomina(
  filas: unknown[], rango: { desde: string | null; hasta: string | null }, quincenas: unknown[] = [],
): { base: number | null; meses: MesNomina[] } {
  const enCurso = new Set(quincenas.flatMap((q) => {
    const r = q as Record<string, unknown>
    const m = mes(r.desde)
    return m && r.estado === 'en_curso' ? [m] : []
  }))
  const todos = filas.flatMap((f): MesNomina[] => {
    const r = f as Record<string, unknown>
    const m = mes(r.mes)
    if (!m) return []
    const cargas = n(r.cargas_sociales)
    const estado: EstadoMes = r.es_estimacion === true ? 'estimacion'
      : (cargas == null || cargas <= 0 || enCurso.has(m)) ? 'incompleto' : 'real'
    return [{ mes: m, costo: estado === 'estimacion' ? null : n(r.costo_nomina), estado, contraBase: null }]
  })
  const base = todos.find((x) => x.mes === MES_BASE && x.estado === 'real')?.costo ?? null
  const desde = rango.desde?.slice(0, 7) ?? null
  const hasta = rango.hasta?.slice(0, 7) ?? null
  const meses = todos
    .filter((x) => (desde == null || x.mes >= desde) && (hasta == null || x.mes <= hasta))
    .map((x) => ({ ...x, contraBase: x.estado === 'real' && base && x.costo != null ? x.costo / base - 1 : null }))
  return { base, meses }
}

/**
 * Los últimos seis meses REALES: ni incompletos ni estimados.
 *
 * Devuelve TAMBIÉN cuáles son (`desde`/`hasta`). Sin eso la pantalla decía «seis meses $ 144,13 M» sin
 * decir qué seis, y con jul/ago/sep todavía sin liquidar no son los seis últimos del calendario.
 */
export function seisMesesReales(meses: MesNomina[]): { total: number; meses: number; desde: string; hasta: string } | null {
  // ORDENADOS POR MES antes de tomar los últimos seis: «el último» del arreglo es el último que devolvió
  // la base, y la consulta no garantizaba orden. Ahora que la pantalla NOMBRA los meses, un orden
  // prestado haría que el rótulo diga un rango que no es el que se sumó.
  const reales = meses.filter((m) => m.estado === 'real' && m.costo != null).sort((a, b) => a.mes.localeCompare(b.mes)).slice(-6)
  if (!reales.length) return null
  return {
    total: reales.reduce((a, m) => a + (m.costo ?? 0), 0), meses: reales.length,
    desde: reales[0].mes, hasta: reales[reales.length - 1].mes,
  }
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
//
// UNA SOLA FUENTE POR CLIENTE: la fila de `cuenta_corriente_de_clientes` (la misma que publica
// `cliente_cuenta_corriente`). El saldo y la antigüedad salen de los MISMOS documentos de Cobranzas,
// por sus tramos `aging_*`. Antes el saldo salía de ahí y la antigüedad de `certificado_cliente`, que es
// un subconjunto: un cliente podía tener saldo sin antigüedad o una antigüedad de documentos que no
// estaban en el saldo (auditoría 17/09/2026, D4). Los tramos los arma `bandasAntiguedad`, la función
// que ya usa la ficha del cliente.

export type EstadoCobro = 'vencido' | 'alDia'
export interface FilaCobranza {
  clienteId: string
  nombre: string
  saldo: number
  vencido: number
  porVencer: number
  masDe60: number
  /** El tramo más viejo con plata. `null` = saldo sin fecha de cobro: no entra en ningún tramo. */
  tramo: ClaveBanda | null
  rotuloTramo: string | null
  estado: EstadoCobro
  /** La acción del día según `planDeCobranza`; `null` = nada pendiente hoy (si `evaluado`). */
  verbo: string | null
  /** `false` = el cliente no tiene documentos legibles en Cobranzas: la acción NO se evaluó. */
  evaluado: boolean
}

/**
 * LAS ZONAS DE LA LÍNEA DE ANTIGÜEDAD. «Por vencer» tiene la SUYA, antes del cero: dibujada dentro de
 * «0–30 días» se leía como vencida hace pocos días (auditoría 17/09/2026, D9). Cinco zonas del mismo
 * ancho, en el orden de los tramos de `bandasAntiguedad`.
 *
 * EL PRIMER TRAMO SE LLAMA «al día», no «Por vencer» (17/09/2026): es la palabra del diseño aprobado y
 * la misma que ya usa la cifra de arriba. Con dos palabras para lo mismo, la banda y la tabla parecían
 * hablar de dos cosas distintas. La ficha del cliente conserva su rótulo (`BANDAS`): es otra pantalla.
 * Los tramos vencidos llevan «días» completo — «31–60» solo no dice de qué son sesenta.
 */
export const ZONAS_COBRANZA: { clave: ClaveBanda; rotulo: string }[] = [
  { clave: 'por_vencer', rotulo: 'al día' },
  { clave: 'd1_30', rotulo: '1–30 días' },
  { clave: 'd31_60', rotulo: '31–60 días' },
  { clave: 'd61_90', rotulo: '61–90 días' },
  { clave: 'd90', rotulo: '+90 días' },
]

/** El rótulo de un tramo con las palabras de Analíticas, no con las de la ficha del cliente. */
export const rotuloDeZona = (t: ClaveBanda): string => ZONAS_COBRANZA.find((z) => z.clave === t)?.rotulo ?? ''

/** Dónde empieza y termina (0–1) la zona de un tramo. */
export function zonaDeTramo(t: ClaveBanda): { desde: number; hasta: number } {
  const i = ZONAS_COBRANZA.findIndex((z) => z.clave === t)
  return { desde: i / ZONAS_COBRANZA.length, hasta: (i + 1) / ZONAS_COBRANZA.length }
}

export interface Circulo { clienteId: string; nombre: string; x: number; y: number }

/**
 * DÓNDE VA CADA CÍRCULO. X: el centro de la zona de su tramo. Y: un carril por cliente dentro del
 * tramo, para que dos clientes del mismo tramo no se encimen (hoy los cinco están «por vencer»).
 * Los carriles se reparten entre 0,15 y 0,85 del alto; con un solo cliente va al medio.
 */
export function ubicarCirculos(filas: FilaCobranza[]): Circulo[] {
  const porTramo = new Map<ClaveBanda, FilaCobranza[]>()
  for (const f of filas) if (f.tramo) porTramo.set(f.tramo, [...(porTramo.get(f.tramo) ?? []), f])
  return [...porTramo.entries()].flatMap(([t, lista]) => {
    const z = zonaDeTramo(t)
    return lista.map((f, i) => ({
      clienteId: f.clienteId, nombre: f.nombre, x: (z.desde + z.hasta) / 2,
      y: lista.length === 1 ? 0.5 : 0.15 + (0.7 * i) / (lista.length - 1),
    }))
  })
}

/**
 * LA COBRANZA POR CLIENTE. Saldo y antigüedad: la fila de cuenta corriente. La acción del día: el
 * MISMO `planDeCobranza` de la ficha, sobre los documentos de `public.cobranzas` de ESE cliente —la
 * fuente del saldo—, adaptados por `documentosDeCobranzas` (auditoría 17/09/2026, D10).
 *
 * Primero se escribió acá una regla propia (segunda definición). Después se leyó `certificado_cliente`,
 * que es un subconjunto: San Francisco, con 7 documentos en Cobranzas y 0 certificados y $ 26,6 M que
 * vencían al día siguiente, decía «nada pendiente hoy». Sin documentos legibles la acción no se evaluó,
 * y eso se dice (`evaluado: false`), no se dibuja como «nada pendiente».
 */
export function cobranza(cuenta: unknown[], filasCobranzas: unknown[] | null = null, hoy = ''): FilaCobranza[] {
  const docs = documentosDeCobranzas(filasCobranzas ?? [], hoy)
  return cuenta.flatMap((f): FilaCobranza[] => {
    const r = f as Record<string, unknown>
    const saldo = n(r.saldo) ?? 0
    if (saldo <= 0 || typeof r.cliente_id !== 'string') return []
    const fila = {
      aging_por_vencer: n(r.aging_por_vencer) ?? 0, aging_1_30: n(r.aging_1_30) ?? 0, aging_31_60: n(r.aging_31_60) ?? 0,
      aging_61_90: n(r.aging_61_90) ?? 0, aging_mas_90: n(r.aging_mas_90) ?? 0,
    } as CuentaCorriente
    const conPlata = bandasAntiguedad(fila).filter((b) => b.monto > 0)
    const viejo = conPlata.at(-1) ?? null
    const vencido = n(r.vencido) ?? 0
    const propios = docs.filter((d) => d.cliente_id === r.cliente_id)
    return [{
      clienteId: r.cliente_id, nombre: String(r.nombre_comercial ?? ''), saldo, vencido,
      porVencer: fila.aging_por_vencer, masDe60: fila.aging_61_90 + fila.aging_mas_90,
      tramo: viejo?.clave ?? null, rotuloTramo: viejo ? rotuloDeZona(viejo.clave) : null,
      estado: vencido > 0 ? 'vencido' : 'alDia',
      verbo: propios.length ? (planDeCobranza(propios, hoy)[0]?.rotulo ?? null) : null,
      evaluado: propios.length > 0,
    }]
  }).sort((a, b) => b.saldo - a.saldo)
}

export function cifrasCobranza(filas: FilaCobranza[]): { porCobrar: number; masDe60: number; alDia: number } {
  return {
    porCobrar: filas.reduce((a, f) => a + f.saldo, 0),
    masDe60: filas.reduce((a, f) => a + f.masDe60, 0),
    alDia: filas.reduce((a, f) => a + f.porVencer, 0),
  }
}

/**
 * LA BANDA DE ANTIGÜEDAD DE LA EMPRESA: Σ por tramo de las MISMAS filas de cuenta corriente que dan el
 * saldo, con los tramos de `bandasAntiguedad`. Suma lo que suma `cobranza` —clientes con saldo—, así la
 * banda y la cifra «por cobrar» nunca difieren.
 */
export function bandasDeCobranza(cuenta: unknown[]): { clave: ClaveBanda; rotulo: string; monto: number }[] {
  const tot = new Map<ClaveBanda, number>()
  for (const f of cuenta) {
    const r = f as Record<string, unknown>
    if ((n(r.saldo) ?? 0) <= 0 || typeof r.cliente_id !== 'string') continue
    const fila = {
      aging_por_vencer: n(r.aging_por_vencer) ?? 0, aging_1_30: n(r.aging_1_30) ?? 0, aging_31_60: n(r.aging_31_60) ?? 0,
      aging_61_90: n(r.aging_61_90) ?? 0, aging_mas_90: n(r.aging_mas_90) ?? 0,
    } as CuentaCorriente
    for (const b of bandasAntiguedad(fila)) tot.set(b.clave, (tot.get(b.clave) ?? 0) + b.monto)
  }
  return ZONAS_COBRANZA.map((z) => ({ clave: z.clave, rotulo: z.rotulo, monto: tot.get(z.clave) ?? 0 }))
}

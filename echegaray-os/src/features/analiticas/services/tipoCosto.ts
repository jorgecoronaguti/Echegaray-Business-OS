// EL COSTO DE CADA OBRA POR TIPO DE COSTO — Directo contra Indirecto (dueño, 18/09/2026).
//
// ═══ QUÉ ES ═══
//
// La columna «Tipo de Costo» de la pestaña Compras del Sheet Flujo de Fondos, ya sincronizada en
// `compra_sheet.tipo_costo`. El modelo del dueño, textual: «lo indirecto es lo que estás considerando
// estructura»:
//
//   Directo    la compra impacta en una obra concreta. La mano de obra propia es directa por definición.
//   Indirecto  compra de la empresa que no es de una obra: Administración y Taller.
//   Estructura NO es una compra (nómina, impuestos, ARCA, sindicatos, banco); el dueño pidió sacarlo de
//              Compras y está en mudanza. Una fila «Estructura» con obra se dice aparte y NO entra al costo.
//
// UNA SOLA DEFINICIÓN EN LA BASE: `costo_de_obras_por_tipo_costo` (migración 20260918T1530, que NO se
// aplica a producción desde la rama). Mientras no esté aplicada, la RPC no existe y este módulo devuelve
// `null`: la pantalla dice «pendiente», nunca calcula por su cuenta desde `compra_sheet`.
//
// LO QUE ESTE MÓDULO NO ESCONDE: hoy los cuatro rubros del costo (`costo_de_obras_por_rubro`) incluyen
// las filas «Estructura» con obra ($ 33,4 M en dos obras cerradas, Le Comedor y San Francisco). El
// total por tipo «en costo» es menor que el total por rubro en esas obras, y `estructuraEnMudanza` es
// exactamente esa diferencia. Sacarlas del costo de la obra es la mudanza que otro agente está armando.

export type TipoCosto = 'Directo' | 'Indirecto' | 'Estructura' | 'sin tipo'

export interface TipoCostoDeObra {
  /** Compras directas + mano de obra propia. `null` = nada imputado. */
  directo: number | null
  /** Sólo la parte de mano de obra dentro de `directo`, para decir de dónde sale. */
  manoObra: number | null
  indirecto: number | null
  /** Compras sin la columna completada: se dicen, no se asumen directas. */
  sinTipo: number | null
  /** Filas «Estructura» con obra: no son compra, están en mudanza, no entran al costo. */
  estructuraEnMudanza: number | null
  /** directo + indirecto + sin tipo: el costo de la obra según Compras + quincenas. */
  enCosto: number | null
  /** directo ÷ enCosto. `null` sin las dos patas. */
  pctDirecto: number | null
  nComprobantes: number
}

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const suma = (...xs: (number | null)[]): number | null => (xs.every((x) => x == null) ? null : xs.reduce<number>((a, x) => a + (x ?? 0), 0))

/** Las filas de la RPC → por obra. `null` = no se pudo leer (la migración no está aplicada, o el rol no ve). */
export function leerTipoCosto(crudas: unknown): Map<string, TipoCostoDeObra> | null {
  if (!Array.isArray(crudas)) return null
  const m = new Map<string, TipoCostoDeObra>()
  for (const c of crudas) {
    const r = (c ?? {}) as Record<string, unknown>
    if (typeof r.obra_id !== 'string' || !r.obra_id) continue
    const t = m.get(r.obra_id) ?? { directo: null, manoObra: null, indirecto: null, sinTipo: null, estructuraEnMudanza: null, enCosto: null, pctDirecto: null, nComprobantes: 0 }
    const monto = num(r.monto)
    const esMo = typeof r.origen === 'string' && /mano de obra/.test(r.origen)
    switch (r.tipo_costo) {
      case 'Directo': t.directo = suma(t.directo, monto); if (esMo) t.manoObra = suma(t.manoObra, monto); break
      case 'Indirecto': t.indirecto = suma(t.indirecto, monto); break
      case 'Estructura': t.estructuraEnMudanza = suma(t.estructuraEnMudanza, monto); break
      default: t.sinTipo = suma(t.sinTipo, monto)
    }
    if (!esMo) t.nComprobantes += num(r.n) ?? 0
    m.set(r.obra_id, t)
  }
  for (const t of m.values()) {
    t.enCosto = suma(t.directo, t.indirecto, t.sinTipo)
    t.pctDirecto = t.enCosto && t.directo != null ? t.directo / t.enCosto : null
  }
  return m
}

/** La misma cuenta para un conjunto de obras (Resumen): se suman las obras que tienen fila. */
export function tipoCostoDe(obras: readonly { id: string }[], porObra: ReadonlyMap<string, TipoCostoDeObra> | null): TipoCostoDeObra | null {
  if (!porObra) return null
  const t: TipoCostoDeObra = { directo: null, manoObra: null, indirecto: null, sinTipo: null, estructuraEnMudanza: null, enCosto: null, pctDirecto: null, nComprobantes: 0 }
  for (const o of obras) {
    const x = porObra.get(o.id)
    if (!x) continue
    t.directo = suma(t.directo, x.directo); t.manoObra = suma(t.manoObra, x.manoObra); t.indirecto = suma(t.indirecto, x.indirecto)
    t.sinTipo = suma(t.sinTipo, x.sinTipo); t.estructuraEnMudanza = suma(t.estructuraEnMudanza, x.estructuraEnMudanza); t.nComprobantes += x.nComprobantes
  }
  t.enCosto = suma(t.directo, t.indirecto, t.sinTipo)
  t.pctDirecto = t.enCosto && t.directo != null ? t.directo / t.enCosto : null
  return t
}

export const DEFINICION_TIPO_COSTO: Record<'Directo' | 'Indirecto' | 'Estructura', string> = {
  Directo: 'Compras que impactan en una obra concreta (columna Tipo de Costo de Compras) más la mano de obra propia de la obra, que es directa por definición.',
  Indirecto: 'Compras de la empresa que no son de una obra: Administración y Taller.',
  Estructura: 'No es una compra (nómina, impuestos, ARCA, sindicatos, banco): se está mudando de Compras a sus pestañas. Si figura con obra, se dice aparte y no entra al costo.',
}

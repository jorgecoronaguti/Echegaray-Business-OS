// USO DE LOS PROVEEDORES — lo que permite acotar una cartera de cien filas de un clic.
//
// Pedido del dueño (30/09/2026): «no me sirve una tabla gigante que no pueda ir filtrando
// rápidamente, por ejemplo los proveedores más usados». Todo lo de acá es PURO: recibe lo ya leído
// y devuelve la lista recortada u ordenada, para poder probar cada chip sin base ni React.
//
// ═══ POR QUÉ LAS VENTANAS SALEN DE `costos_obra` Y NO DE `proveedor_nombre_resuelto` ═══
//
// La vista publica el agregado HISTÓRICO ya sumado (count/sum/max sin ventana): de ahí no se puede
// sacar «12 meses», «90 días» ni «este mes». Las filas sí traen `fecha`, así que se leen las de los
// últimos 12 meses (≈1000 en total, medido el 30/09) y se agrupan acá con el MISMO normalizador que
// usa la base para resolver nombres. No se toca la vista: una migración para esto sería una segunda
// definición de «comprobantes de un proveedor» en la base.
//
// La última compra que se ordena y se muestra sigue siendo la HISTÓRICA de la vista (`ultima`): una
// fecha no tiene ventana que declarar, y «sin movimiento hace más de 6 meses» necesita ver más atrás
// de los 12 meses que se leen.

import { normalizarNombreProveedor } from '../../../../orquestador/lib/proveedor-identidad.mjs'
import type { NombreResuelto, Proveedor } from '../types/index.ts'
import type { CompradoProveedor, DeudaProveedor } from './proveedoresService.ts'

/** La cantidad de «más usados»: un ranking de toda la cartera no es un recorte. */
export const TOP_USADOS = 15
export const TAMANO_PAGINA = 50

export interface CompraLeve { proveedor: string | null; fecha: string | null; total: number | null }

export interface UsoProveedor {
  comprobantes12: number
  total12: number
  comprobantes90: number
  comprobantesMes: number
}

export type ChipUso = 'usados' | 'mes' | '90d' | 'inactivo'
export const CHIPS_USO: ChipUso[] = ['usados', 'mes', '90d', 'inactivo']
export type Columna = 'nombre' | 'comprobantes' | 'total' | 'ultima' | 'saldo'
export const COLUMNAS: Columna[] = ['nombre', 'comprobantes', 'total', 'ultima', 'saldo']
export type Sentido = 'asc' | 'desc'

export interface DatosUso {
  /** `null` = no se pudieron leer las compras recientes: ningún chip de uso afirma nada. */
  uso: Map<string, UsoProveedor> | null
  /** `null` = no se pudo leer la vista de la cartera. */
  comprado: Map<string, CompradoProveedor> | null
  deudas: Map<string, DeudaProveedor> | null
  hoy: string
}

// ── Fechas ISO (`YYYY-MM-DD` ordena igual como texto que como fecha) ─────────────────────────────

export function restarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10)
}

/** Resta meses de calendario; un 31 que cae en un mes corto se queda en su último día. */
export function restarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const destino = new Date(Date.UTC(a, m - 1 - meses, 1))
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate()
  destino.setUTCDate(Math.min(d, ultimo))
  return destino.toISOString().slice(0, 10)
}

export function ventanas(hoy: string) {
  return {
    hace12m: restarMeses(hoy, 12), hace90d: restarDias(hoy, 90),
    inicioMes: `${hoy.slice(0, 7)}-01`, hace6m: restarMeses(hoy, 6),
  }
}

/** `nombre_norm → proveedor_id` de lo VINCULADO: lo descartado como «no es proveedor» no suma. */
export function nombreAProveedor(filas: NombreResuelto[]): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const f of filas) if (f.proveedor_id && f.estado === 'vinculado') mapa.set(f.nombre_norm, f.proveedor_id)
  return mapa
}

/**
 * Agrupa las compras por proveedor en las tres ventanas. Un comprobante SIN FECHA no entra en
 * ninguna: ubicarlo en «12 meses» sería inventarle una fecha. El total suma `coalesce(total, 0)`
 * como la vista, para que los dos caminos no discrepen por un comprobante sin importe.
 */
export function agruparUso(
  compras: CompraLeve[], nombres: Map<string, string>, hoy: string,
): Map<string, UsoProveedor> {
  const v = ventanas(hoy)
  const mapa = new Map<string, UsoProveedor>()
  for (const c of compras) {
    const f = c.fecha?.slice(0, 10)
    if (!f || f < v.hace12m || f > hoy) continue
    const norm = normalizarNombreProveedor(c.proveedor ?? '') as string | null
    const id = norm ? nombres.get(norm) : undefined
    if (!id) continue
    const u = mapa.get(id) ?? { comprobantes12: 0, total12: 0, comprobantes90: 0, comprobantesMes: 0 }
    u.comprobantes12 += 1
    u.total12 += Number(c.total ?? 0)
    if (f >= v.hace90d) u.comprobantes90 += 1
    if (f >= v.inicioMes) u.comprobantesMes += 1
    mapa.set(id, u)
  }
  return mapa
}

// ── Chips ────────────────────────────────────────────────────────────────────────────────────────

/** El ranking por comprobantes de 12 m (desempate: total). Sólo entra quien tuvo al menos uno. */
export function idsMasUsados(proveedores: Proveedor[], uso: Map<string, UsoProveedor>, n = TOP_USADOS): Set<string> {
  return new Set(
    proveedores
      .map((p) => ({ id: p.id, u: uso.get(p.id) }))
      .filter((x): x is { id: string; u: UsoProveedor } => !!x.u && x.u.comprobantes12 > 0)
      .sort((a, b) => b.u.comprobantes12 - a.u.comprobantes12 || b.u.total12 - a.u.total12)
      .slice(0, n)
      .map((x) => x.id),
  )
}

/**
 * ¿Entra en este chip? SIN MOVIMIENTO incluye a quien NUNCA tuvo una compra fechada: es el primero
 * que conviene revisar para archivar. Y un dato que no se pudo leer no decide: `null` → no recorta.
 */
export function coincideChipUso(p: Proveedor, chip: ChipUso, d: DatosUso, usados?: Set<string>): boolean {
  const v = ventanas(d.hoy)
  if (chip === 'inactivo') {
    if (!d.comprado) return true
    const ultima = d.comprado.get(p.id)?.ultima
    return !ultima || ultima < v.hace6m
  }
  if (!d.uso) return true
  if (chip === 'usados') return (usados ?? idsMasUsados([p], d.uso)).has(p.id)
  const u = d.uso.get(p.id)
  return (chip === 'mes' ? u?.comprobantesMes : u?.comprobantes90) ? true : false
}

/** Intersección de los chips activos. El ranking de «usados» se calcula sobre la lista que llega. */
export function aplicarChipsUso(proveedores: Proveedor[], chips: ChipUso[], d: DatosUso): Proveedor[] {
  if (chips.length === 0) return proveedores
  const usados = chips.includes('usados') && d.uso ? idsMasUsados(proveedores, d.uso) : undefined
  return proveedores.filter((p) => chips.every((c) => coincideChipUso(p, c, d, usados)))
}

/** El número del chip = lo que se ve al activarlo SOLO sobre esta lista. */
export function contarChipUso(proveedores: Proveedor[], chip: ChipUso, d: DatosUso): number {
  return aplicarChipsUso(proveedores, [chip], d).length
}

export function leerChips(f: string | undefined): ChipUso[] {
  const pedidos = new Set((f ?? '').split(','))
  return CHIPS_USO.filter((c) => pedidos.has(c))
}

/** El valor de `?f=` después de un clic en ese chip: lo enciende si estaba apagado y al revés. `undefined` = ninguno. */
export function alternarChip(activos: ChipUso[], chip: ChipUso): string | undefined {
  const nuevos = CHIPS_USO.filter((c) => (c === chip ? !activos.includes(c) : activos.includes(c)))
  return nuevos.length ? nuevos.join(',') : undefined
}

// ── Orden ────────────────────────────────────────────────────────────────────────────────────────

export function leerColumna(o: string | undefined): Columna {
  return COLUMNAS.find((c) => c === o) ?? 'comprobantes'
}

/** El primer clic en una columna va al sentido natural: A-Z para el nombre, lo más grande arriba para el resto. */
export function sentidoPorDefecto(c: Columna): Sentido { return c === 'nombre' ? 'asc' : 'desc' }

export function leerSentido(c: Columna, s: string | undefined): Sentido {
  return s === 'asc' || s === 'desc' ? s : sentidoPorDefecto(c)
}

/**
 * Ordena sin mutar. Lo que NO tiene dato (sin fecha) va SIEMPRE al final, en cualquier sentido: un
 * «más antigua primero» que abriera con las filas vacías escondería lo que se quiere ver.
 * Desempate fijo (total 12 m, luego nombre) para que el orden no cambie entre cargas.
 */
export function ordenarProveedores(
  ps: Proveedor[], columna: Columna, sentido: Sentido, d: DatosUso,
): Proveedor[] {
  const k = sentido === 'asc' ? 1 : -1
  const num = (p: Proveedor): number => {
    if (columna === 'comprobantes') return d.uso?.get(p.id)?.comprobantes12 ?? 0
    if (columna === 'total') return d.uso?.get(p.id)?.total12 ?? 0
    return d.deudas?.get(p.id)?.deuda ?? 0
  }
  const nombre = (a: Proveedor, b: Proveedor) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  return [...ps].sort((a, b) => {
    if (columna === 'nombre') return k * nombre(a, b)
    if (columna === 'ultima') {
      const fa = d.comprado?.get(a.id)?.ultima ?? null
      const fb = d.comprado?.get(b.id)?.ultima ?? null
      if (fa !== fb) {
        if (fa === null) return 1
        if (fb === null) return -1
        return k * fa.localeCompare(fb)
      }
    } else if (num(a) !== num(b)) {
      return k * (num(a) - num(b))
    }
    const ta = d.uso?.get(a.id)?.total12 ?? 0
    const tb = d.uso?.get(b.id)?.total12 ?? 0
    return tb - ta || nombre(a, b)
  })
}

// ── Paginación («mostrar más») ───────────────────────────────────────────────────────────────────

export function leerPagina(p: string | undefined): number {
  const n = Number.parseInt(p ?? '', 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 1
}

/** Las primeras `pagina × 50` filas de la lista YA filtrada y ordenada: el buscador corta sobre el total. */
export function paginar<T>(lista: T[], pagina: number, tam = TAMANO_PAGINA): { visibles: T[]; restan: number } {
  const visibles = lista.slice(0, pagina * tam)
  return { visibles, restan: lista.length - visibles.length }
}

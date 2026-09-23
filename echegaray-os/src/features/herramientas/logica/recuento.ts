// EL RECUENTO FÍSICO DE UN LUGAR (migración 20260923T1700) — puro: sin Supabase, sin React.
//
// M05/D04 «Control físico». Un recuento es UN acto sobre UN lugar: lo esperado se congela al abrir,
// lo contado entra por activo, y el cierre corrige el inventario («Ajustar el inventario a lo
// contado») o queda como evidencia («Guardar sin ajustar»). Acá viven las diferencias, el resumen
// «N contados · M con diferencia» y la validación de lo que se tipea; la base decide el resto.
//
// Una línea contada en 0 nunca se ajusta: dejar un lugar en 0 es una baja o un movimiento (regla de
// `ajustar_existencia`, 22/09). Queda en el recuento como evidencia y la pantalla lo dice antes de cerrar.

import { activosEn, cantidadEn, type Parque } from './parque.ts'

/** La migración que crea `activo_recuento`; la pantalla la nombra cuando falta. */
export const MIGRACION_RECUENTO = '20260923T1700'

export interface Recuento {
  id: string
  ubicacion_id: string
  iniciado_en: string
  cerrado_en: string | null
  /** null = abierto; al cerrar, si corrigió el inventario o quedó como evidencia. */
  aplicado: boolean | null
  hecho_por: string | null
  cerrado_por: string | null
  observaciones: string | null
}
export const COLUMNAS_RECUENTO = 'id, ubicacion_id, iniciado_en, cerrado_en, aplicado, hecho_por, cerrado_por, observaciones'

export interface RecuentoLinea {
  recuento_id: string
  activo_id: string
  esperado: number
  /** null = no se contó. Vacío no es cero. */
  contado: number | null
  /** contado - esperado; null hasta contar. */
  diferencia: number | null
  nota: string | null
}
export const COLUMNAS_RECUENTO_LINEA = 'recuento_id, activo_id, esperado, contado, diferencia, nota'

/** Lo que la pantalla tiene por activo mientras cuenta: lo esperado y lo tipeado. */
export interface LineaEnCurso {
  activoId: string
  esperado: number
  /** Lo que se escribió en el campo, tal cual. Vacío = todavía no se contó. */
  texto: string
  nota?: string
}

/** Tope de lo que se puede contar de un activo: más que eso es un error de tipeo, no un lote. */
export const MAX_CONTADO = 100_000

export type Cantidad = { ok: true; valor: number | null } | { ok: false; error: string }

/** «7» → 7 · «» → null (sin contar) · «7,5», «-1», «abc» → error. */
export function validarCantidad(texto: string): Cantidad {
  const t = texto.trim()
  if (t === '') return { ok: true, valor: null }
  if (!/^\d+$/.test(t)) return { ok: false, error: 'Escribí sólo el número entero, sin coma ni signo' }
  const n = Number(t)
  if (n > MAX_CONTADO) return { ok: false, error: `Más de ${MAX_CONTADO.toLocaleString('es-AR')} no es un recuento: revisá el número` }
  return { ok: true, valor: n }
}

/** contado - esperado, o null si todavía no se contó. */
export function diferenciaDe(esperado: number, contado: number | null): number | null {
  return contado == null ? null : contado - esperado
}

export interface ResumenRecuento {
  total: number
  contados: number
  conDiferencia: number
  /** Unidades que faltan (suma de diferencias negativas, en positivo). */
  faltan: number
  /** Unidades de más. */
  sobran: number
  /** Los activos contados en 0: el cierre no los ajusta. */
  enCero: string[]
  /** Campos con algo que no es un número entero: no se puede cerrar. */
  invalidos: string[]
}

export function resumenRecuento(lineas: readonly LineaEnCurso[]): ResumenRecuento {
  const r: ResumenRecuento = { total: lineas.length, contados: 0, conDiferencia: 0, faltan: 0, sobran: 0, enCero: [], invalidos: [] }
  for (const l of lineas) {
    const c = validarCantidad(l.texto)
    if (!c.ok) { r.invalidos.push(l.activoId); continue }
    if (c.valor == null) continue
    r.contados++
    const d = c.valor - l.esperado
    if (d !== 0) r.conDiferencia++
    if (d < 0) r.faltan += -d
    if (d > 0) r.sobran += d
    if (c.valor === 0) r.enCero.push(l.activoId)
  }
  return r
}

/** «3 contados · 1 con diferencia» · «Nada contado todavía». */
export function textoResumen(r: Pick<ResumenRecuento, 'contados' | 'conDiferencia'>): string {
  if (r.contados === 0) return 'Nada contado todavía'
  const c = `${r.contados} ${r.contados === 1 ? 'contado' : 'contados'}`
  if (r.conDiferencia === 0) return `${c} · sin diferencias`
  return `${c} · ${r.conDiferencia} con diferencia`
}

/** Se puede cerrar cuando hay al menos uno contado y ningún campo inválido. */
export function sePuedeCerrar(r: Pick<ResumenRecuento, 'contados' | 'invalidos'>): boolean {
  return r.contados > 0 && r.invalidos.length === 0
}

/** «Todo bien»: cada campo vacío o distinto queda igual a lo esperado. */
export function todoBien(lineas: readonly LineaEnCurso[]): LineaEnCurso[] {
  return lineas.map((l) => ({ ...l, texto: String(l.esperado) }))
}

/** Lo que va a la base: sólo lo contado, como número. Los vacíos no viajan (vacío no es cero). */
export function lineasParaEnviar(lineas: readonly LineaEnCurso[]): { activo: string; contado: number; nota?: string }[] {
  const out: { activo: string; contado: number; nota?: string }[] = []
  for (const l of lineas) {
    const c = validarCantidad(l.texto)
    if (!c.ok || c.valor == null) continue
    const nota = l.nota?.trim()
    out.push(nota ? { activo: l.activoId, contado: c.valor, nota } : { activo: l.activoId, contado: c.valor })
  }
  return out
}

/** Lo que devuelve `cerrar_recuento`. */
export interface CierreRecuento {
  contados: number
  con_diferencia: number
  ajustadas: number
  sin_ajustar: string[]
}

/** El aviso después de cerrar: qué quedó hecho, y qué no se ajustó y por qué. */
export function textoCierre(c: CierreRecuento, aplicado: boolean): string {
  const base = textoResumen({ contados: c.contados, conDiferencia: c.con_diferencia })
  if (!aplicado) return `Recuento guardado sin ajustar · ${base}.`
  const partes = [`Recuento cerrado · ${base}`]
  partes.push(c.ajustadas === 0 ? 'el inventario no cambió' : `${c.ajustadas} ${c.ajustadas === 1 ? 'existencia ajustada' : 'existencias ajustadas'}`)
  if (c.sin_ajustar.length) {
    partes.push(`${c.sin_ajustar.join(', ')} ${c.sin_ajustar.length === 1 ? 'quedó' : 'quedaron'} en 0 y no se ajusta: es una baja o un movimiento`)
  }
  return `${partes.join(' · ')}.`
}

/** Los recuentos cerrados de un lugar, del más nuevo al más viejo. `null` = sin la migración. */
export function recuentosDelLugar(recuentos: readonly Recuento[] | null | undefined, ubicacionId: string): Recuento[] {
  return (recuentos ?? [])
    .filter((r) => r.ubicacion_id === ubicacionId && r.cerrado_en)
    .sort((a, b) => (a.cerrado_en! < b.cerrado_en! ? 1 : a.cerrado_en! > b.cerrado_en! ? -1 : 0))
}

/** El recuento abierto de un lugar, si alguien lo dejó a medias. */
export function recuentoAbierto(recuentos: readonly Recuento[] | null | undefined, ubicacionId: string): Recuento | null {
  return (recuentos ?? []).find((r) => r.ubicacion_id === ubicacionId && !r.cerrado_en) ?? null
}

/** Las líneas de un recuento. */
export function lineasDe(lineas: readonly RecuentoLinea[] | null | undefined, recuentoId: string): RecuentoLinea[] {
  return (lineas ?? []).filter((l) => l.recuento_id === recuentoId)
}

/** Resumen de un recuento ya cerrado, desde sus líneas de la base. */
export function resumenCerrado(lineas: readonly RecuentoLinea[]): Pick<ResumenRecuento, 'total' | 'contados' | 'conDiferencia'> {
  return {
    total: lineas.length,
    contados: lineas.filter((l) => l.contado != null).length,
    conDiferencia: lineas.filter((l) => l.diferencia != null && l.diferencia !== 0).length,
  }
}

export interface ItemRecuento {
  id: string
  codigo: string
  nombre: string
  clase: string
  patente: string | null
  esperado: number
}

/** Lo que hay que contar en un lugar: cada activo vivo con unidades ahí y cuántas se esperan. Rodados primero. */
export function itemsDeRecuento(p: Parque, ubicacionId: string): ItemRecuento[] {
  return activosEn(p, ubicacionId)
    .sort((a, b) => Number(b.clase === 'rodado') - Number(a.clase === 'rodado') || a.nombre.localeCompare(b.nombre, 'es'))
    .map((a) => ({ id: a.id, codigo: a.codigo, nombre: a.nombre, clase: a.clase, patente: a.patente, esperado: cantidadEn(p, a.id, ubicacionId) }))
}

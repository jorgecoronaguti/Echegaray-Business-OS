// LA HOJA DE ETIQUETAS — A4, 24 etiquetas de 50 × 25 mm, 3 columnas por 8 filas.
//
// Film autoadhesivo en impresora común: no hace falta una impresora de etiquetas. Las medidas van en
// milímetros porque se imprimen con `@page { size: A4; margin: 0 }` y posiciones absolutas en mm: un
// layout en píxeles sale corrido según el zoom del navegador y la etiqueta queda cortada por el QR.

import type { Activo } from '../types.ts'
import type { Unidad } from './unidades.ts'

export const HOJA = { ancho: 210, alto: 297 } as const
export const ETIQUETA = { ancho: 50, alto: 25 } as const
export const COLUMNAS = 3
export const FILAS = 8
export const POR_HOJA = COLUMNAS * FILAS
/** Separación entre etiquetas: da lugar a la tijera y deja la grilla centrada en la hoja. */
export const HUECO = { x: 12, y: 8 } as const

export interface Casillero {
  x: number
  y: number
  fila: number
  columna: number
}

/** Los 24 casilleros de una hoja, en mm desde la esquina superior izquierda, por filas. */
export function casilleros(): Casillero[] {
  const anchoGrilla = COLUMNAS * ETIQUETA.ancho + (COLUMNAS - 1) * HUECO.x
  const altoGrilla = FILAS * ETIQUETA.alto + (FILAS - 1) * HUECO.y
  const x0 = (HOJA.ancho - anchoGrilla) / 2
  const y0 = (HOJA.alto - altoGrilla) / 2
  const out: Casillero[] = []
  for (let fila = 0; fila < FILAS; fila++) {
    for (let columna = 0; columna < COLUMNAS; columna++) {
      out.push({ x: x0 + columna * (ETIQUETA.ancho + HUECO.x), y: y0 + fila * (ETIQUETA.alto + HUECO.y), fila, columna })
    }
  }
  return out
}

/** Parte la cola en hojas de 24. La última puede quedar incompleta: los casilleros vacíos no se imprimen. */
export function hojas<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += POR_HOJA) out.push(items.slice(i, i + POR_HOJA))
  return out
}

export type MotivoCola = 'nunca_impresa' | 'alta_desde_obra' | 'pedida'

export interface ItemEtiqueta {
  activo: Activo
  motivo: MotivoCola
  /** Lo que va impreso: el código del activo o, si se pidió una unidad (BAL-001/3), el de la unidad. */
  codigo: string
}

/**
 * La cola: lo pedido explícitamente (desde el inventario o una ficha) primero y en el orden pedido;
 * después lo vivo que nunca se imprimió, con las altas desde obra adelante. Sin repetidos; la baja no.
 * Un código de unidad pedido (BAL-001/3, migración 20260923T1500) imprime la etiqueta de ESA unidad con el
 * nombre del lote: sólo entra por pedido, nunca por «nunca impresa» (el lote es el que lleva esa marca).
 */
export function colaDeEtiquetas(activos: Activo[], pedidos: string[] = [], unidades: readonly Unidad[] = []): ItemEtiqueta[] {
  const porCodigo = new Map(activos.map((a) => [a.codigo, a]))
  const unidadPorCodigo = new Map(unidades.map((u) => [u.codigo, u]))
  const vistos = new Set<string>()
  const out: ItemEtiqueta[] = []
  for (const c of pedidos) {
    const u = unidadPorCodigo.get(c)
    if (u) {
      const lote = activos.find((a) => a.id === u.activo_id)
      if (!lote || lote.estado === 'baja' || u.estado === 'baja' || vistos.has(u.codigo)) continue
      vistos.add(u.codigo)
      out.push({ activo: lote, motivo: 'pedida', codigo: u.codigo })
      continue
    }
    const a = porCodigo.get(c)
    if (!a || a.estado === 'baja' || vistos.has(a.id)) continue
    vistos.add(a.id)
    out.push({ activo: a, motivo: 'pedida', codigo: a.codigo })
  }
  const pendientes = activos
    // El EPP y la ropa se entregan a una persona, no se rastrean por QR: a la cola sólo entran si se piden.
    .filter((a) => a.estado !== 'baja' && !a.etiqueta_impresa_en && !vistos.has(a.id) && a.clase !== 'epp' && a.clase !== 'ropa')
    .sort((x, y) => Number(y.alta_desde_obra) - Number(x.alta_desde_obra) || x.codigo.localeCompare(y.codigo))
  for (const a of pendientes) out.push({ activo: a, motivo: a.alta_desde_obra ? 'alta_desde_obra' : 'nunca_impresa', codigo: a.codigo })
  return out
}

/** Nombre partido en dos renglones de ~22 caracteres para la etiqueta de 50 mm, con «…» si no entra. */
export function renglonesDeNombre(nombre: string, porRenglon = 22): string[] {
  const palabras = nombre.trim().split(/\s+/)
  const r: string[] = ['']
  for (const p of palabras) {
    const actual = r[r.length - 1]
    if (!actual) r[r.length - 1] = p
    else if (actual.length + 1 + p.length <= porRenglon) r[r.length - 1] = `${actual} ${p}`
    else r.push(p)
  }
  if (r.length <= 2) return r.map((x) => (x.length > porRenglon ? `${x.slice(0, porRenglon - 1)}…` : x))
  const segundo = r.slice(1).join(' ')
  return [r[0].slice(0, porRenglon), `${segundo.slice(0, porRenglon - 1)}…`]
}

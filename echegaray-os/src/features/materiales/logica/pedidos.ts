// MATERIAL — la lógica pura del módulo: qué es un pedido, cómo se agrupa, cómo se filtra.
//
// Módulo NEUTRAL —sin `'use client'`, sin React, sin Supabase— porque lo necesitan las dos orillas:
// las páginas (servidor) para resolver obra y filtro, y los componentes (cliente) para dibujar. Es
// también lo único del módulo que se prueba sin levantar nada (`pedidos.test.ts`).
//
// ═══ UNA FILA POR ÍTEM, UN GRUPO POR PEDIDO ═══
//
// `pedidos_materiales` guarda una fila por material, igual que el Sheet del AppSheet. Un «Pedir
// material» con tres ítems son tres filas con el mismo `pedido_grupo`. El escritorio lista FILAS
// (es una tabla: se filtra y se cambia el estado ítem por ítem); el teléfono lista GRUPOS (una
// tarjeta por pedido, con sus ítems adentro). Las dos leen la misma tabla.

import { obraDeTexto } from '../../../../orquestador/lib/obra-operacion.mjs'
import { lecturaPedido, sinEntregar, type LecturaPedido } from '../../../shared/lib/estadoPedidoMaterial.ts'

export const URGENCIAS = [
  { id: 'hoy', label: 'Hoy', bajada: 'Frena el trabajo si no llega' },
  { id: 'semana', label: 'Esta semana', bajada: 'Lo normal' },
  { id: 'cuando_se_pueda', label: 'Cuando se pueda', bajada: 'No apura' },
] as const
export type Urgencia = (typeof URGENCIAS)[number]['id']
export const esUrgencia = (v: unknown): v is Urgencia => URGENCIAS.some((u) => u.id === v)
export const rotuloUrgencia = (u: string | null | undefined) => URGENCIAS.find((x) => x.id === u)?.label ?? null

/** Las unidades que se ofrecen. Texto libre igual: «bolsa», «m3», «kg» no agotan la obra. */
export const UNIDADES = ['un', 'bolsa', 'kg', 'm', 'm2', 'm3', 'lt', 'caja', 'rollo', 'tira', 'hoja', 'balde'] as const

/** La fila tal como vive en `pedidos_materiales`, con las columnas de la app. */
export interface FilaPedido {
  id_pedido: string
  obra_texto: string | null
  obra_canonica_id: string | null
  fecha: string | null
  material: string | null
  cantidad: number | null
  unidad: string | null
  estado: string | null
  origen: string | null
  urgencia: string | null
  nota: string | null
  pedido_grupo: string | null
  created_at: string
}

/** La fila con la obra RESUELTA: por id si lo trae, por el diccionario de alias si viene del Sheet. */
export interface Pedido extends FilaPedido {
  obra: string | null
  obra_rotulo: string | null
  lectura: LecturaPedido
}

export type IndiceObras = Map<string, string | symbol>

/**
 * DE QUÉ OBRA ES CADA FILA. La app escribe `obra_canonica_id` y esa es la verdad; el Sheet sólo trae el
 * texto y se resuelve por `obra_alias` como en Operación. Un texto que no resuelve queda «sin obra»:
 * no se cuelga de la primera de la lista.
 */
export function resolverObras(filas: FilaPedido[], indice: IndiceObras, rotulos: Map<string, string>): Pedido[] {
  return filas.map((f) => {
    const obra = f.obra_canonica_id ?? obraDeTexto(indice, f.obra_texto)
    return { ...f, obra, obra_rotulo: obra ? (rotulos.get(obra) ?? f.obra_texto ?? null) : (f.obra_texto ?? null), lectura: lecturaPedido(f.estado) }
  })
}

export interface Grupo {
  clave: string
  obra: string | null
  obra_rotulo: string | null
  fecha: string | null
  urgencia: string | null
  nota: string | null
  origen: string | null
  items: Pedido[]
  /** El estado del pedido entero: el del ítem MENOS avanzado. Entregado sólo si todos lo están. */
  lectura: LecturaPedido
}

const AVANCE: Record<string, number> = { sin_estado: 0, pedido: 1, pendiente: 1, visto: 2, en_camino: 3, comprado: 3, entregado: 4, cancelado: 5 }
const avance = (l: LecturaPedido) => AVANCE[l.clave] ?? 1

/** Una tarjeta por pedido. Una fila del Sheet, sin grupo, es un pedido de un solo ítem. */
export function agruparPedidos(filas: Pedido[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const f of filas) {
    const clave = f.pedido_grupo ?? f.id_pedido
    const g = grupos.get(clave)
    if (g) {
      g.items.push(f)
      if (avance(f.lectura) < avance(g.lectura)) g.lectura = f.lectura
    } else {
      grupos.set(clave, {
        clave, obra: f.obra, obra_rotulo: f.obra_rotulo, fecha: f.fecha, urgencia: f.urgencia, nota: f.nota,
        origen: f.origen, items: [f], lectura: f.lectura,
      })
    }
  }
  return [...grupos.values()]
}

/** Los chips de estado del escritorio. `sin_entregar` es el que abre por defecto: lo que hay que hacer. */
export const FILTROS_ESTADO = [
  { id: 'sin_entregar', label: 'Sin entregar' },
  { id: 'pedido', label: 'Pedido' },
  { id: 'visto', label: 'Visto' },
  { id: 'comprado', label: 'Comprado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'todos', label: 'Todos' },
] as const
export type FiltroEstado = (typeof FILTROS_ESTADO)[number]['id']
export const filtroEstadoDeUrl = (v: string | null | undefined): FiltroEstado =>
  FILTROS_ESTADO.some((f) => f.id === v) ? (v as FiltroEstado) : 'sin_entregar'

export interface Filtro {
  obra: string | null
  estado: FiltroEstado
}

export function filtrarPedidos<T extends { obra: string | null; estado: string | null }>(filas: T[], filtro: Filtro): T[] {
  return filas.filter((f) => {
    if (filtro.obra && f.obra !== filtro.obra) return false
    if (filtro.estado === 'todos') return true
    if (filtro.estado === 'sin_entregar') return sinEntregar(f.estado)
    return lecturaPedido(f.estado).clave === filtro.estado
  })
}

/** Cuántos pedidos de estas obras no llegaron: la señal de `/campo`. */
export const contarSinEntregar = (filas: Pedido[], obras: string[]) =>
  filas.filter((f) => f.obra !== null && obras.includes(f.obra) && sinEntregar(f.estado)).length

// ─── LOS ÍTEMS DEL FORMULARIO ───────────────────────────────────────────────────────────────────

export interface ItemPedido {
  material: string
  cantidad: number
  unidad: string | null
}

export type ItemsNormalizados = { ok: true; items: ItemPedido[] } | { ok: false; error: string }

/**
 * Lo que llega del formulario son tres listas paralelas (`material[]`, `cantidad[]`, `unidad[]`). Una
 * fila vacía ENTERA se ignora (la que se agregó y no se usó); una fila a medias es un error que se
 * dice. Es el mismo control que hace `pedir_material` en la base: la pantalla no es el guarda.
 */
export function normalizarItems(materiales: string[], cantidades: string[], unidades: string[]): ItemsNormalizados {
  const items: ItemPedido[] = []
  const n = Math.max(materiales.length, cantidades.length, unidades.length)
  for (let i = 0; i < n; i++) {
    const material = (materiales[i] ?? '').trim()
    const cantidadTxt = (cantidades[i] ?? '').trim().replace(',', '.')
    const unidad = (unidades[i] ?? '').trim() || null
    if (!material && !cantidadTxt) continue
    if (!material) return { ok: false, error: `La fila ${i + 1} tiene cantidad pero no dice qué material.` }
    const cantidad = Number(cantidadTxt)
    if (!cantidadTxt || !Number.isFinite(cantidad) || cantidad <= 0) {
      return { ok: false, error: `«${material}»: la cantidad tiene que ser un número mayor que cero.` }
    }
    items.push({ material: material.slice(0, 160), cantidad, unidad: unidad ? unidad.slice(0, 24) : null })
  }
  if (items.length === 0) return { ok: false, error: 'Un pedido lleva al menos un material.' }
  return { ok: true, items }
}

/** «10 bolsa · Cemento». La cantidad va en mono en la pantalla; acá sólo el texto. */
export function textoCantidad(cantidad: number | null, unidad: string | null): string {
  if (cantidad == null) return '—'
  const n = cantidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })
  return unidad ? `${n} ${unidad}` : n
}

/** De dónde vino la fila, para leerlo en una palabra. */
/** Sin uso en pantalla desde el 23/09/2026 (dueño: «quitar columna Origen»). Queda para el detalle. */
export function rotuloOrigen(origen: string | null): string {
  if (origen === 'app') return 'App'
  if (origen === 'os') return 'OS'
  if (origen === 'appsheet_sheet') return 'AppSheet'
  return origen ?? '—'
}

// ─── RUTAS ──────────────────────────────────────────────────────────────────────────────────────

/** El módulo en la computadora: solapa «Material» de Herramientas. */
export const HREF_MATERIAL_ESCRITORIO = '/herramientas/material'
/** El módulo en el teléfono, dentro de Campo. */
export const HREF_MATERIAL_TELEFONO = '/campo/material'

export function hrefMaterialEscritorio(filtro: Partial<Filtro>): string {
  const q = new URLSearchParams()
  if (filtro.obra) q.set('obra', filtro.obra)
  if (filtro.estado && filtro.estado !== 'sin_entregar') q.set('estado', filtro.estado)
  const s = q.toString()
  return s ? `${HREF_MATERIAL_ESCRITORIO}?${s}` : HREF_MATERIAL_ESCRITORIO
}

export const hrefPedirTelefono = (obra?: string | null) =>
  obra ? `${HREF_MATERIAL_TELEFONO}/pedir?obra=${encodeURIComponent(obra)}` : `${HREF_MATERIAL_TELEFONO}/pedir`

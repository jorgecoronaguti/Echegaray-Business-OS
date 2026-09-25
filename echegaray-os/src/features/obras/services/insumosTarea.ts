// LOS INSUMOS DE UNA TAREA (serie B · B05/B06/MB2) — qué se dibuja de cada uno. Módulo puro.
//
// Un insumo es un ACTIVO de Herramientas (su ubicación real sale del módulo: `activo.ubicacion_id`
// → `ubicacion`) o un MATERIAL (con su pedido, o «Pedir»). Vive en `obra_actividad_insumo_plan`
// (tipo 'activo' | 'material'); las filas de mano de obra y cargas sociales que siembra el
// presupuesto son costo, no insumos a juntar, y no se listan acá.

export interface LugarActivo { tipo: string | null; nombre: string | null; obra_id: string | null }

export interface InsumoTarea {
  id: string
  actividad_id: string
  tipo: 'activo' | 'material'
  nombre: string
  cantidad: number | null
  unidad: string | null
  activo_id: string | null
  pedido_id: string | null
  /** Sólo activos: dónde está hoy. null = el activo no tiene lugar cargado. */
  lugar: LugarActivo | null
}

export type EstadoInsumo =
  | { clase: 'en_obra'; texto: 'en la obra' }
  | { clase: 'fuera'; texto: string; accion: 'traer' }
  | { clase: 'sin_lugar'; texto: 'sin ubicación cargada' }
  | { clase: 'material_pedido'; texto: 'material · pedido' }
  | { clase: 'material'; texto: 'material'; accion: 'Pedir' }

const NOMBRE_TIPO_LUGAR: Record<string, string> = { taller: 'Taller', rodado: 'un rodado', servicio_tecnico: 'service', obra: 'otra obra' }

/** «en la obra» (verde) · «en Taller · traer» (warn) · material «Pedir». */
export function estadoDeInsumo(i: Pick<InsumoTarea, 'tipo' | 'lugar' | 'pedido_id'>, obraId: string): EstadoInsumo {
  if (i.tipo === 'material') return i.pedido_id ? { clase: 'material_pedido', texto: 'material · pedido' } : { clase: 'material', texto: 'material', accion: 'Pedir' }
  if (!i.lugar) return { clase: 'sin_lugar', texto: 'sin ubicación cargada' }
  if (i.lugar.obra_id === obraId) return { clase: 'en_obra', texto: 'en la obra' }
  const donde = i.lugar.nombre ?? (i.lugar.tipo ? NOMBRE_TIPO_LUGAR[i.lugar.tipo] ?? i.lugar.tipo : 'otro lugar')
  return { clase: 'fuera', texto: `en ${donde}`, accion: 'traer' }
}

/** «4 · 1 activo de Herramientas» (B05) · «3 insumos» (chip del árbol). */
export function contadorInsumos(lista: readonly Pick<InsumoTarea, 'tipo'>[]): string {
  const activos = lista.filter((i) => i.tipo === 'activo').length
  if (lista.length === 0) return '0'
  return activos === 0 ? String(lista.length) : `${lista.length} · ${activos} ${activos === 1 ? 'activo' : 'activos'} de Herramientas`
}

/** «1 fuera de la obra» (B06, warn) · null si todo está. */
export function alertaFueraDeObra(lista: readonly Pick<InsumoTarea, 'tipo' | 'lugar' | 'pedido_id'>[], obraId: string): string | null {
  const n = lista.filter((i) => estadoDeInsumo(i, obraId).clase === 'fuera').length
  return n === 0 ? null : `${n} fuera de la obra`
}

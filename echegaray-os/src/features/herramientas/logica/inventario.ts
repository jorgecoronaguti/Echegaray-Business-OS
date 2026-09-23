// EL INVENTARIO — filtros de la lista (D02). Puro: la pantalla le pasa lo que dice la URL.

import type { Activo, Clase, EstadoActivo } from '../types.ts'
import { nombresRepetidos } from './resumen.ts'
import { lugaresDe, rotuloLugares, rotuloUbicacion, vivo, type Parque } from './parque.ts'
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import { FORMATO_CODIGO, normalizarCodigo } from './codigo.ts'

export type FiltroClase = Clase | 'todo'
export type FiltroEstado = 'todos' | EstadoActivo
export type FiltroEspecial = 'asumido' | 'alta_desde_obra' | 'repetidos' | 'sin_etiqueta' | null

export interface Filtros {
  clase: FiltroClase
  estado: FiltroEstado
  /** id de ubicación, 'sin' = sin ubicación cargada, 'obras' = cualquier obra, null = todas. */
  ubicacion: string | null
  categoria: string | null
  q: string
  especial: FiltroEspecial
}

const CLASES: FiltroClase[] = ['herramienta', 'equipo', 'rodado', 'todo']
const ESTADOS: FiltroEstado[] = ['todos', 'operativo', 'requiere_mantenimiento', 'fuera_servicio', 'reparacion_externa', 'baja']
const ESPECIALES = ['asumido', 'alta_desde_obra', 'repetidos', 'sin_etiqueta'] as const

/** Lee los filtros de la URL. Lo que no se reconoce cae al valor por defecto, nunca rompe. */
export function filtrosDeURL(sp: Record<string, string | string[] | undefined>): Filtros {
  const uno = (k: string) => {
    const v = sp[k]
    return (Array.isArray(v) ? v[0] : v)?.trim() || null
  }
  const clase = uno('clase') as FiltroClase | null
  const estado = uno('estado') as FiltroEstado | null
  const especial = uno('filtro')
  return {
    clase: clase && CLASES.includes(clase) ? clase : 'herramienta',
    estado: estado && ESTADOS.includes(estado) ? estado : 'todos',
    ubicacion: uno('ubicacion'),
    categoria: uno('categoria'),
    q: uno('q') ?? '',
    especial: (ESPECIALES as readonly string[]).includes(especial ?? '') ? (especial as FiltroEspecial) : null,
  }
}

/** Si un LUGAR entra en el filtro de ubicación (`sin` no es un lugar: lo mira `pasaUbicacion`). */
function lugarPasa(p: Parque, ubicacionId: string, u: string): boolean {
  if (u === 'obras') return p.ubicacionPorId.get(ubicacionId)?.tipo === 'obra'
  // `tipo:<tipo>`: cualquier lugar de ese tipo (lo usan los totales clicables: «Servicio técnico 1»).
  if (u.startsWith('tipo:')) return p.ubicacionPorId.get(ubicacionId)?.tipo === u.slice(5)
  return ubicacionId === u
}

/** Los lugares de un activo: donde tiene unidades; una baja, el último donde estuvo. */
function lugaresDeActivo(p: Parque, a: Activo): { ubicacion_id: string; cantidad: number }[] {
  const l = lugaresDe(p, a.id)
  if (l.length) return l
  return a.ubicacion_id ? [{ ubicacion_id: a.ubicacion_id, cantidad: a.cantidad ?? 1 }] : []
}

// Un lote repartido pasa el filtro si tiene unidades en ALGUNO de los lugares pedidos.
function pasaUbicacion(p: Parque, a: Activo, u: string | null): boolean {
  if (!u) return true
  const l = lugaresDeActivo(p, a)
  if (u === 'sin') return l.length === 0
  return l.some((e) => lugarPasa(p, e.ubicacion_id, u))
}

/**
 * Las unidades que se ven con el filtro de ubicación puesto: con Entrepiso filtrado, BAL-001 (5 en el
 * Taller y 3 ahí) cuenta 3. Sin filtro, el total del lote.
 */
export function cantidadVisible(p: Parque, a: Activo, u: string | null): number {
  if (!u || u === 'sin') return a.cantidad ?? 1
  return lugaresDeActivo(p, a).filter((e) => lugarPasa(p, e.ubicacion_id, u)).reduce((s, e) => s + e.cantidad, 0)
}

/** Lo que cumple todo MENOS el filtro de estado: sirve para contar cada solapa de estado. */
export function candidatos(p: Parque, f: Filtros): Activo[] {
  // «amo 7» encuentra AMO-007: el camino manual vale lo mismo que el QR.
  const codigo = f.q ? normalizarCodigo(f.q) : null
  const repetidos = f.especial === 'repetidos' ? new Set(nombresRepetidos(p.activos).flatMap((g) => g.activos.map((a) => a.id))) : null
  return p.activos.filter((a) => {
    if (f.clase !== 'todo' && a.clase !== f.clase) return false
    if (!pasaUbicacion(p, a, f.ubicacion)) return false
    if (f.categoria && (f.categoria === 'sin' ? a.categoria : a.categoria !== f.categoria)) return false
    if (f.especial === 'asumido' && !(a.estado_asumido && vivo(a))) return false
    if (f.especial === 'alta_desde_obra' && !(a.alta_desde_obra && vivo(a))) return false
    if (f.especial === 'sin_etiqueta' && !(!a.etiqueta_impresa_en && vivo(a))) return false
    if (repetidos && !repetidos.has(a.id)) return false
    if (f.q && a.codigo !== codigo && !contieneEnAlguno([a.nombre, a.codigo, a.categoria, a.patente, a.numero_serie, rotuloLugares(p, a)], f.q)) return false
    return true
  })
}

/** La lista final: con el estado aplicado, las bajas al final (se muestran atenuadas). */
export function filtrar(p: Parque, f: Filtros): Activo[] {
  return candidatos(p, f)
    // «Todos» es el inventario vivo: una baja sólo aparece en su solapa. Mezclarla atenuada al final
    // hizo creer al dueño (22/09) que la baja «no funcionó» porque la seguía viendo en la lista.
    .filter((a) => (f.estado === 'todos' ? a.estado !== 'baja' : a.estado === f.estado))
    .sort((x, y) => Number(x.estado === 'baja') - Number(y.estado === 'baja') || x.nombre.localeCompare(y.nombre, 'es') || x.codigo.localeCompare(y.codigo))
}

export function cuentaPorEstado(lista: Activo[]): Record<FiltroEstado, number> {
  const c: Record<FiltroEstado, number> = {
    todos: lista.filter((a) => a.estado !== 'baja').length, operativo: 0, requiere_mantenimiento: 0, fuera_servicio: 0, reparacion_externa: 0, baja: 0,
  }
  for (const a of lista) c[a.estado]++
  return c
}

/** Las categorías que existen, ordenadas. «sin categoría» se ofrece aparte si hay alguno sin cargar. */
export function categorias(activos: Activo[]): { valores: string[]; haySin: boolean } {
  const s = new Set<string>()
  let haySin = false
  for (const a of activos) {
    if (a.categoria?.trim()) s.add(a.categoria.trim())
    else haySin = true
  }
  return { valores: [...s].sort((a, b) => a.localeCompare(b, 'es')), haySin }
}

/** El query string de un filtro, sin los valores por defecto. */
export function queryDe(f: Partial<Filtros> & { activo?: string | null }): string {
  const q = new URLSearchParams()
  if (f.clase && f.clase !== 'herramienta') q.set('clase', f.clase)
  if (f.estado && f.estado !== 'todos') q.set('estado', f.estado)
  if (f.ubicacion) q.set('ubicacion', f.ubicacion)
  if (f.categoria) q.set('categoria', f.categoria)
  if (f.q) q.set('q', f.q)
  if (f.especial) q.set('filtro', f.especial)
  if (f.activo) q.set('activo', f.activo)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/**
 * A DÓNDE LLEVA EL BUSCADOR DE LA BARRA. Lo que en el teléfono hace «Escanear» (leer la etiqueta y
 * abrir la ficha) en la computadora se hace tipeando el código impreso: si lo tipeado ES un código del
 * sistema, se abre su ficha además de filtrar la lista; si no, sólo se filtra. Vacío vuelve al Inventario.
 */
export function destinoDeBusqueda(q: string): string {
  const t = q.trim()
  if (!t) return '/herramientas/inventario'
  const codigo = normalizarCodigo(t)
  const esCodigo = !!codigo && FORMATO_CODIGO.test(codigo)
  return `/herramientas/inventario${queryDe({ clase: 'todo', q: esCodigo ? codigo : t, activo: esCodigo ? codigo : null })}`
}

/**
 * Lo que el buscador del inventario va mostrando mientras se tipea (dueño, 22/09: «tiene q ir
 * mostrando las opciones a medida q vas tipeando»). Sólo lo vivo. Primero el código exacto, después
 * los nombres que EMPIEZAN con lo tipeado, después el resto que lo contiene; a lo sumo `max`.
 */
export function sugerencias(p: Parque, q: string, max = 8): Activo[] {
  const t = q.trim()
  if (!t) return []
  const codigo = normalizarCodigo(t)
  const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const nt = norm(t)
  const rango = (a: Activo) => (a.codigo === codigo ? 0 : norm(a.nombre).startsWith(nt) ? 1 : 2)
  return p.activos
    .filter((a) => a.estado !== 'baja' && (a.codigo === codigo || contieneEnAlguno([a.nombre, a.codigo, a.categoria, a.patente, rotuloLugares(p, a)], t)))
    .sort((x, y) => rango(x) - rango(y) || x.nombre.localeCompare(y.nombre, 'es'))
    .slice(0, max)
}

export interface Totales {
  activos: number
  /** Los lotes cuentan su `cantidad`: «Balde de albañil · lote» con cantidad 8 son 8. */
  unidades: number
  porTipo: { tipo: 'taller' | 'obra' | 'rodado' | 'servicio_tecnico' | 'tercero' | 'sin'; activos: number }[]
  /**
   * Cada obra por separado (dueño, 22/09: «me sirve el filtro por obra»): `u` es el valor del filtro
   * de ubicación, el mismo que el desplegable.
   */
  porObra: { u: string; rotulo: string; activos: number }[]
}

/**
 * Los totales de lo que se está viendo (dueño, 22/09: «necesito q inventario me vaya mostrando totales»).
 * Cuentan por lugar: un lote repartido suma sus unidades en cada lugar donde está y aparece en cada obra
 * donde tiene algo. Con un filtro de ubicación, sólo cuenta lo que hay en los lugares filtrados.
 */
export function totales(p: Parque, lista: Activo[], ubicacion: string | null = null): Totales {
  let unidades = 0
  const c = new Map<Totales['porTipo'][number]['tipo'], number>()
  const obras = new Map<string, number>()
  for (const a of lista) {
    const lugares = lugaresDeActivo(p, a).filter((e) => !ubicacion || ubicacion === 'sin' || lugarPasa(p, e.ubicacion_id, ubicacion))
    if (!lugares.length) {
      unidades += a.cantidad ?? 1
      c.set('sin', (c.get('sin') ?? 0) + 1)
      continue
    }
    const tipos = new Set<Totales['porTipo'][number]['tipo']>()
    for (const e of lugares) {
      unidades += e.cantidad
      const t = p.ubicacionPorId.get(e.ubicacion_id)?.tipo ?? 'sin'
      tipos.add(t)
      if (t === 'obra') obras.set(e.ubicacion_id, (obras.get(e.ubicacion_id) ?? 0) + 1)
    }
    for (const t of tipos) c.set(t, (c.get(t) ?? 0) + 1)
  }
  const orden: Totales['porTipo'][number]['tipo'][] = ['taller', 'obra', 'rodado', 'servicio_tecnico', 'tercero', 'sin']
  const porObra = [...obras].map(([u, n]) => ({ u, rotulo: rotuloUbicacion(p, u), activos: n })).sort((a, b) => b.activos - a.activos || a.rotulo.localeCompare(b.rotulo, 'es'))
  return { activos: lista.length, unidades, porTipo: orden.filter((t) => c.has(t)).map((t) => ({ tipo: t, activos: c.get(t)! })), porObra }
}

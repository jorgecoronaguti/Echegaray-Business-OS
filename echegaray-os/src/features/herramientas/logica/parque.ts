// EL PARQUE — las filas crudas de la base convertidas en lo que las pantallas preguntan: dónde está,
// quién la movió, cuándo se la vio, cómo se llama ese lugar. Puro: sin Supabase, sin React.
//
// ═══ VACÍO NO ES CERO ═══
// Un activo sin `ubicacion_id` está «sin ubicación cargada», no en ningún lado; uno sin movimientos ni
// reportes se vio «nunca». Ninguna función de acá devuelve 0 o un lugar por defecto para tapar un hueco.

import { rotuloDeObra } from '../../../shared/utils/obra.ts'
import type { Papel } from './papeles.ts'
import type { Recuento, RecuentoLinea } from './recuento.ts'
import type { Revision, RevisionVigente } from './revision.ts'
import type { Unidad } from './unidades.ts'
import type { Activo, Ajuste, EstadoActivo, Existencia, Incidencia, LecturaUso, Movimiento, ObraIndice, ProveedorLugar, TipoUbicacion, Ubicacion } from '../types.ts'

export interface DatosParque {
  activos: Activo[]
  ubicaciones: Ubicacion[]
  obras: ObraIndice[]
  movimientos: Movimiento[]
  incidencias: Incidencia[]
  /** usuario_id → nombre del perfil. */
  nombres: Record<string, string>
  /** Los proveedores (20260923T2400): un servicio técnico es uno de ellos y el lugar toma su nombre. */
  proveedores?: ProveedorLugar[]
  /** Las categorías posibles, en su orden (`activo_categoria`). La lista es cerrada: no se tipea otra. */
  categorias?: string[]
  /**
   * Verificaciones de uso (migración 20260922T1200). `null`/ausente = la tabla todavía no existe: la
   * pantalla dice «sin la migración», nunca «nunca».
   */
  lecturas?: LecturaUso[] | null
  /** persona_id → nombre, para «opera D. Luna». Sólo las que la sesión puede ver. */
  personas?: Record<string, string>
  /**
   * Cuántas unidades hay en cada lugar (20260922T1300). Ausente = se deriva de `activo.ubicacion_id` y
   * `activo.cantidad` (todo en un solo lugar), que es lo que valía antes de repartir lotes.
   */
  existencias?: Existencia[]
  /** Recuentos y bajas parciales (20260922T1300). */
  ajustes?: Ajuste[]
  /**
   * Los papeles vigentes de cada activo (`activo_papel_vigente`, migración 20260922T2400).
   * `null`/ausente = la tabla todavía no existe: la pantalla dice «sin cargar», nunca «al día».
   */
  papeles?: Papel[] | null
  /**
   * Las unidades con código propio de cada lote (`activo_unidad`, migración 20260923T1500).
   * `null`/ausente = la tabla todavía no existe: la ficha dice «sin la migración», nunca «ninguna».
   */
  unidades?: Unidad[] | null
  /** El historial de revisiones (`activo_revision`, 20260923T1510). `null`/ausente = sin la migración. */
  revisiones?: Revision[] | null
  /** La vigente por tipo con sus días (`activo_revision_vigente`). `null`/ausente = sin la migración. */
  revisionesVigentes?: RevisionVigente[] | null
  /** Los recuentos físicos por lugar (`activo_recuento`, 20260923T1700). `null`/ausente = sin la migración. */
  recuentos?: Recuento[] | null
  /** Las líneas de cada recuento (`activo_recuento_linea`). `null`/ausente = sin la migración. */
  recuentoLineas?: RecuentoLinea[] | null
}

export interface Parque extends DatosParque {
  /** Verificaciones de cada activo, de la más nueva a la más vieja. */
  lecDe: Map<string, LecturaUso[]>
  activoPorId: Map<string, Activo>
  ubicacionPorId: Map<string, Ubicacion>
  obraPorId: Map<string, ObraIndice>
  proveedorPorId: Map<string, ProveedorLugar>
  /** Movimientos de cada activo, del más nuevo al más viejo. */
  movsDe: Map<string, Movimiento[]>
  /** Incidencias de cada activo, de la más nueva a la más vieja. */
  incDe: Map<string, Incidencia[]>
  /** Dónde están las unidades de cada activo vivo, de donde hay más a donde hay menos. */
  existDe: Map<string, Existencia[]>
  /** Qué hay en cada lugar. */
  existEn: Map<string, Existencia[]>
  /** Recuentos y bajas parciales de cada activo. */
  ajustesDe: Map<string, Ajuste[]>
}

function agrupar<T>(l: T[], k: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of l) m.set(k(x), [...(m.get(k(x)) ?? []), x])
  return m
}

const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0)

export function armarParque(d: DatosParque): Parque {
  const movsDe = new Map<string, Movimiento[]>()
  for (const m of [...d.movimientos].sort((a, b) => desc(a.fecha_hora, b.fecha_hora))) {
    const l = movsDe.get(m.activo_id)
    if (l) l.push(m)
    else movsDe.set(m.activo_id, [m])
  }
  const incDe = new Map<string, Incidencia[]>()
  for (const i of [...d.incidencias].sort((a, b) => desc(a.creado_en, b.creado_en))) {
    const l = incDe.get(i.activo_id)
    if (l) l.push(i)
    else incDe.set(i.activo_id, [i])
  }
  const lecDe = new Map<string, LecturaUso[]>()
  for (const l of [...(d.lecturas ?? [])].sort((a, b) => desc(a.fecha_hora, b.fecha_hora))) {
    const x = lecDe.get(l.activo_id)
    if (x) x.push(l)
    else lecDe.set(l.activo_id, [l])
  }
  const vivos = new Set(d.activos.filter((a) => a.estado !== 'baja').map((a) => a.id))
  const existencias = (d.existencias ?? d.activos
    .filter((a) => a.ubicacion_id)
    .map((a) => ({ activo_id: a.id, ubicacion_id: a.ubicacion_id!, cantidad: a.cantidad ?? 1 })))
    .filter((e) => vivos.has(e.activo_id))
  const existDe = new Map<string, Existencia[]>()
  const existEn = new Map<string, Existencia[]>()
  for (const e of existencias) {
    existDe.set(e.activo_id, [...(existDe.get(e.activo_id) ?? []), e])
    existEn.set(e.ubicacion_id, [...(existEn.get(e.ubicacion_id) ?? []), e])
  }
  for (const l of existDe.values()) l.sort((a, b) => b.cantidad - a.cantidad)
  return {
    ...d,
    existencias,
    existDe,
    existEn,
    ajustesDe: agrupar(d.ajustes ?? [], (x) => x.activo_id),
    lecDe,
    activoPorId: new Map(d.activos.map((a) => [a.id, a])),
    ubicacionPorId: new Map(d.ubicaciones.map((u) => [u.id, u])),
    proveedorPorId: new Map((d.proveedores ?? []).map((x) => [x.id, x])),
    obraPorId: new Map(d.obras.map((o) => [o.id, o])),
    movsDe,
    incDe,
  }
}

export const SIN_UBICACION = 'sin ubicación cargada'

/** El nombre de un rodado como lugar: «Toyota Hilux NMN898». Sin patente, el código. */
export function rotuloRodado(a: Pick<Activo, 'nombre' | 'patente' | 'codigo'>): string {
  return `${a.nombre} ${a.patente ?? a.codigo}`
}

/**
 * Cómo se llama un lugar. Obra y rodado no tienen nombre propio en `ubicacion` (así lo quiere la base,
 * para que no existan dos versiones del mismo nombre): la obra se rotula como en todo el OS
 * (`rotuloDeObra`, «OB-0012 · PISOS ARCOR») y el rodado por su nombre y patente.
 */
export function rotuloUbicacion(p: Parque, id: string | null | undefined): string {
  if (!id) return SIN_UBICACION
  const u = p.ubicacionPorId.get(id)
  if (!u) return 'ubicación desconocida'
  if (u.tipo === 'obra') {
    const o = u.obra_id ? p.obraPorId.get(u.obra_id) : undefined
    return o ? rotuloDeObra(o) : `obra ${u.obra_id ?? ''}`.trim()
  }
  if (u.tipo === 'rodado') {
    const r = u.activo_id ? p.activoPorId.get(u.activo_id) : undefined
    return r ? rotuloRodado(r) : 'rodado'
  }
  if (u.proveedor_id) {
    const pr = p.proveedorPorId.get(u.proveedor_id)
    if (pr) return pr.nombre
  }
  return u.nombre ?? u.tipo
}

export const ETIQUETA_TIPO: Record<TipoUbicacion, string> = {
  taller: 'Taller',
  obra: 'Obras',
  rodado: 'Rodados',
  servicio_tecnico: 'Servicios técnicos',
  tercero: 'Terceros',
  persona: 'Personas',
}
/** Los lugares del parque. La persona no está: es a quién se le entregó EPP o ropa, no un lugar de trabajo. */
export const ORDEN_TIPO: TipoUbicacion[] = ['taller', 'obra', 'rodado', 'servicio_tecnico', 'tercero']

export function tipoDe(p: Parque, ubicacionId: string | null): TipoUbicacion | null {
  return ubicacionId ? (p.ubicacionPorId.get(ubicacionId)?.tipo ?? null) : null
}

export function ultimoMovimiento(p: Parque, activoId: string): Movimiento | null {
  return p.movsDe.get(activoId)?.[0] ?? null
}

/** Quién hizo un movimiento: la persona logueada, o el «responsable» que traía el listado viejo. */
export function autorDe(p: Parque, m: Pick<Movimiento, 'usuario_id' | 'usuario_texto'>): string | null {
  if (m.usuario_id && p.nombres[m.usuario_id]) return p.nombres[m.usuario_id]
  return m.usuario_texto?.trim() || null
}

export function quienLaMovio(p: Parque, activoId: string): string | null {
  const m = ultimoMovimiento(p, activoId)
  return m ? autorDe(p, m) : null
}

/** La última vez que alguien registró algo de este activo (movimiento o reporte). `null` = nunca. */
export function vistoEn(p: Parque, activoId: string): string | null {
  const m = p.movsDe.get(activoId)?.[0]?.fecha_hora ?? null
  const i = p.incDe.get(activoId)?.[0]?.creado_en ?? null
  if (!m) return i
  if (!i) return m
  return m > i ? m : i
}

/** Días enteros entre una fecha y hoy, por fecha calendario de Argentina. */
export function diasDesde(iso: string, hoy: Date = new Date()): number {
  const dia = (d: Date) => {
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/San_Juan' }).format(d)
    return Date.parse(`${t}T00:00:00Z`)
  }
  return Math.round((dia(hoy) - dia(new Date(iso))) / 86_400_000)
}

/** «hoy» · «4 d» · «nunca». */
export function textoVisto(iso: string | null, hoy: Date = new Date()): string {
  if (!iso) return 'nunca'
  const n = diasDesde(iso, hoy)
  return n <= 0 ? 'hoy' : `${n} d`
}

export const ETIQUETA_ESTADO: Record<EstadoActivo, string> = {
  operativo: 'Operativo',
  requiere_mantenimiento: 'Requiere mantenimiento',
  fuera_servicio: 'Fuera de servicio',
  reparacion_externa: 'En reparación externa',
  baja: 'Baja',
}
export const ETIQUETA_ESTADO_CORTA: Record<EstadoActivo, string> = {
  ...ETIQUETA_ESTADO,
  requiere_mantenimiento: 'Requiere mantenim.',
}
export type TonoEstado = 'pos' | 'warn' | 'neutro' | 'apagado'
export const TONO_ESTADO: Record<EstadoActivo, TonoEstado> = {
  operativo: 'pos',
  requiere_mantenimiento: 'warn',
  fuera_servicio: 'neutro',
  reparacion_externa: 'warn',
  baja: 'apagado',
}
export const MOTIVO_BAJA: Record<string, string> = {
  robada: 'robo', perdida: 'pérdida', descartada: 'descarte', vendida: 'venta',
}

export const vivo = (a: Pick<Activo, 'estado'>) => a.estado !== 'baja'
export const conProblema = (a: Pick<Activo, 'estado'>) =>
  a.estado === 'requiere_mantenimiento' || a.estado === 'fuera_servicio' || a.estado === 'reparacion_externa'

/** Los activos vivos que tienen HOY al menos una unidad en una ubicación (un lote repartido está en varias). */
export function activosEn(p: Parque, ubicacionId: string): Activo[] {
  return (p.existEn.get(ubicacionId) ?? []).map((e) => p.activoPorId.get(e.activo_id)!).filter((a) => a && vivo(a))
}

/** Dónde están las unidades de un activo, de donde hay más a donde hay menos. Vacío = baja o sin ubicación. */
export function lugaresDe(p: Parque, activoId: string): Existencia[] {
  return p.existDe.get(activoId) ?? []
}

/** Cuántas unidades de un activo hay en un lugar (0 = ninguna). */
export function cantidadEn(p: Parque, activoId: string, ubicacionId: string | null | undefined): number {
  if (!ubicacionId) return 0
  return lugaresDe(p, activoId).find((e) => e.ubicacion_id === ubicacionId)?.cantidad ?? 0
}

/** Un lote con unidades en más de un lugar. */
export function repartido(p: Parque, activoId: string): boolean {
  return lugaresDe(p, activoId).length > 1
}

/**
 * Dónde está, en palabras. Un lote repartido dice cada lugar con sus unidades: «Taller 5 · OB-0010 · SF
 * ENTREPISO 3». Lo demás, su lugar (una baja, el último).
 */
export function rotuloLugares(p: Parque, a: Activo): string {
  const l = lugaresDe(p, a.id)
  if (l.length <= 1) return rotuloUbicacion(p, l[0]?.ubicacion_id ?? a.ubicacion_id)
  return l.map((e) => `${rotuloUbicacion(p, e.ubicacion_id)} ${e.cantidad}`).join(' · ')
}

/** De dónde sale por defecto: el lugar pedido si tiene unidades ahí; si no, donde hay más. */
export function origenPara(p: Parque, a: Activo, preferido?: string | null): string | null {
  if (preferido && cantidadEn(p, a.id, preferido) > 0) return preferido
  return lugaresDe(p, a.id)[0]?.ubicacion_id ?? a.ubicacion_id
}

/** La ubicación que ES un rodado (la de su carga), si existe. */
export function ubicacionDelRodado(p: Parque, rodadoId: string): Ubicacion | null {
  return p.ubicaciones.find((u) => u.tipo === 'rodado' && u.activo_id === rodadoId) ?? null
}

/** Desde cuándo está un activo en un lugar (por defecto, el principal): el último movimiento que llegó ahí. */
export function llegoEn(p: Parque, a: Activo, ubicacionId: string | null = a.ubicacion_id): string | null {
  const m = p.movsDe.get(a.id)?.find((x) => x.destino_id === ubicacionId)
  return m?.fecha_hora ?? null
}

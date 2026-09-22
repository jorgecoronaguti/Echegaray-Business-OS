// EL PARQUE — las filas crudas de la base convertidas en lo que las pantallas preguntan: dónde está,
// quién la movió, cuándo se la vio, cómo se llama ese lugar. Puro: sin Supabase, sin React.
//
// ═══ VACÍO NO ES CERO ═══
// Un activo sin `ubicacion_id` está «sin ubicación cargada», no en ningún lado; uno sin movimientos ni
// reportes se vio «nunca». Ninguna función de acá devuelve 0 o un lugar por defecto para tapar un hueco.

import { rotuloDeObra } from '../../../shared/utils/obra.ts'
import type { Activo, EstadoActivo, Incidencia, LecturaUso, Movimiento, ObraIndice, TipoUbicacion, Ubicacion } from '../types.ts'

export interface DatosParque {
  activos: Activo[]
  ubicaciones: Ubicacion[]
  obras: ObraIndice[]
  movimientos: Movimiento[]
  incidencias: Incidencia[]
  /** usuario_id → nombre del perfil. */
  nombres: Record<string, string>
  /** Las categorías posibles, en su orden (`activo_categoria`). La lista es cerrada: no se tipea otra. */
  categorias?: string[]
  /**
   * Verificaciones de uso (migración 20260922T1200). `null`/ausente = la tabla todavía no existe: la
   * pantalla dice «sin la migración», nunca «nunca».
   */
  lecturas?: LecturaUso[] | null
  /** persona_id → nombre, para «opera D. Luna». Sólo las que la sesión puede ver. */
  personas?: Record<string, string>
}

export interface Parque extends DatosParque {
  /** Verificaciones de cada activo, de la más nueva a la más vieja. */
  lecDe: Map<string, LecturaUso[]>
  activoPorId: Map<string, Activo>
  ubicacionPorId: Map<string, Ubicacion>
  obraPorId: Map<string, ObraIndice>
  /** Movimientos de cada activo, del más nuevo al más viejo. */
  movsDe: Map<string, Movimiento[]>
  /** Incidencias de cada activo, de la más nueva a la más vieja. */
  incDe: Map<string, Incidencia[]>
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
  return {
    ...d,
    lecDe,
    activoPorId: new Map(d.activos.map((a) => [a.id, a])),
    ubicacionPorId: new Map(d.ubicaciones.map((u) => [u.id, u])),
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
  return u.nombre ?? u.tipo
}

export const ETIQUETA_TIPO: Record<TipoUbicacion, string> = {
  taller: 'Taller',
  obra: 'Obras',
  rodado: 'Rodados',
  servicio_tecnico: 'Servicios técnicos',
  tercero: 'Terceros',
}
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

/** Los activos vivos que están HOY en una ubicación. */
export function activosEn(p: Parque, ubicacionId: string): Activo[] {
  return p.activos.filter((a) => vivo(a) && a.ubicacion_id === ubicacionId)
}

/** La ubicación que ES un rodado (la de su carga), si existe. */
export function ubicacionDelRodado(p: Parque, rodadoId: string): Ubicacion | null {
  return p.ubicaciones.find((u) => u.tipo === 'rodado' && u.activo_id === rodadoId) ?? null
}

/** Desde cuándo está un activo en su lugar actual: el último movimiento que llegó ahí. */
export function llegoEn(p: Parque, a: Activo): string | null {
  const m = p.movsDe.get(a.id)?.find((x) => x.destino_id === a.ubicacion_id)
  return m?.fecha_hora ?? null
}

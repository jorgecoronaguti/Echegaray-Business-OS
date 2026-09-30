// LIBRO DE VIDA DEL RODADO (migración 20260930T2300) — lógica pura, sin base.
//
// Un evento es una reparación, un service, neumáticos, batería, chapa u otro trabajo, con su situación:
// pendiente («hay que llevarlo»), en el taller («en el mecánico») o hecho. La disponibilidad del rodado sale
// de los eventos ABIERTOS y del estado del activo; nunca se infiere de la falta de un papel.

import type { Activo } from '../types.ts'

export const MIGRACION_EVENTO = '20260930T2300'

export const COLUMNAS_EVENTO =
  'id, activo_id, tipo, situacion, fecha, km, descripcion, proveedor_id, taller_texto, costo, compra_ref, proximo_km, proximo_fecha, ubicacion_origen, ubicacion_taller, enviado_en, cerrado_en, cerrado_por, creado_en, creado_por'

export type TipoEvento = 'reparacion' | 'service' | 'neumaticos' | 'bateria' | 'chapa' | 'otro'
export type SituacionEvento = 'pendiente' | 'en_taller' | 'hecho'

export const TIPOS_EVENTO: TipoEvento[] = ['reparacion', 'service', 'neumaticos', 'bateria', 'chapa', 'otro']
export const NOMBRE_TIPO_EVENTO: Record<TipoEvento, string> = {
  reparacion: 'Reparación', service: 'Service', neumaticos: 'Neumáticos', bateria: 'Batería', chapa: 'Chapa y pintura', otro: 'Otro',
}
export const NOMBRE_SITUACION: Record<SituacionEvento, string> = {
  pendiente: 'Hay que llevarlo', en_taller: 'En el mecánico', hecho: 'Hecho',
}

export type Evento = {
  id: string
  activo_id: string
  tipo: TipoEvento
  situacion: SituacionEvento
  fecha: string
  km: number | null
  descripcion: string
  proveedor_id: string | null
  taller_texto: string | null
  costo: number | null
  compra_ref: string | null
  proximo_km: number | null
  proximo_fecha: string | null
  ubicacion_origen: string | null
  ubicacion_taller: string | null
  enviado_en: string | null
  cerrado_en: string | null
  cerrado_por: string | null
  creado_en: string
  creado_por: string | null
}

const num = (v: unknown): number | null => (v == null ? null : Number(v))

/** `numeric` llega como string desde PostgREST: se normaliza al leer. */
export function numerosDeEvento(e: Evento): Evento {
  return { ...e, km: num(e.km), costo: num(e.costo), proximo_km: num(e.proximo_km) }
}

export type Disponibilidad = 'disponible' | 'hay_que_llevarlo' | 'en_el_mecanico' | 'fuera_de_servicio'

export const NOMBRE_DISPONIBILIDAD: Record<Disponibilidad, string> = {
  disponible: 'Disponible', hay_que_llevarlo: 'Hay que llevarlo', en_el_mecanico: 'En el mecánico', fuera_de_servicio: 'Fuera de servicio',
}
/** Rojo sólo para lo que frena el uso; ámbar para lo que hay que atender; verde para lo normal. */
export const TONO_DISPONIBILIDAD: Record<Disponibilidad, 'pos' | 'warn' | 'neg'> = {
  disponible: 'pos', hay_que_llevarlo: 'warn', en_el_mecanico: 'warn', fuera_de_servicio: 'neg',
}

export const abiertos = (eventos: Evento[] | null | undefined, activoId: string): Evento[] =>
  (eventos ?? []).filter((e) => e.activo_id === activoId && e.situacion !== 'hecho')

/** Lo más grave que hay abierto manda: en el mecánico antes que «hay que llevarlo». */
export function disponibilidadDe(a: Pick<Activo, 'id' | 'estado'>, eventos: Evento[] | null | undefined): Disponibilidad {
  if (a.estado === 'fuera_servicio') return 'fuera_de_servicio'
  const ab = abiertos(eventos, a.id)
  if (ab.some((e) => e.situacion === 'en_taller') || a.estado === 'reparacion_externa') return 'en_el_mecanico'
  if (ab.length > 0 || a.estado === 'requiere_mantenimiento') return 'hay_que_llevarlo'
  return 'disponible'
}

export const historialEventos = (eventos: Evento[] | null | undefined, activoId: string): Evento[] =>
  (eventos ?? []).filter((e) => e.activo_id === activoId)
    .sort((x, y) => (y.fecha.localeCompare(x.fecha)) || y.creado_en.localeCompare(x.creado_en))

/** Costo acumulado de lo CARGADO: suma sólo los eventos con costo; `cargados` dice cuántos eventos lo tienen. */
export function costoAcumulado(eventos: Evento[]): { total: number; cargados: number; sinCosto: number } {
  const con = eventos.filter((e) => e.costo != null)
  return { total: con.reduce((s, e) => s + (e.costo ?? 0), 0), cargados: con.length, sinCosto: eventos.length - con.length }
}

/**
 * Próximo service por km: el último evento con `proximo_km` contra el último km conocido. `null` si no hay
 * base (sin evento con km próximo o sin lectura): no se inventa un vencimiento.
 */
export function serviceEnKm(eventos: Evento[], ultimoKm: number | null, avisoKm = 1000): { proximo: number; faltan: number; tono: 'neg' | 'warn' | 'pos' } | null {
  const e = eventos.find((x) => x.situacion === 'hecho' && x.proximo_km != null)
  if (!e || e.proximo_km == null || ultimoKm == null) return null
  const faltan = e.proximo_km - ultimoKm
  return { proximo: e.proximo_km, faltan, tono: faltan <= 0 ? 'neg' : faltan <= avisoKm ? 'warn' : 'pos' }
}

/** El taller del evento, como se lee: el nombre del padrón si hay proveedor, si no el texto libre. */
export function tallerDe(e: Evento, nombreProveedor: (id: string) => string | null): string | null {
  return (e.proveedor_id ? nombreProveedor(e.proveedor_id) : null) ?? e.taller_texto
}

// «DÓNDE ESTOY PARADO» EN EL TELÉFONO — el lugar desde el que se abre la app de campo.
//
// Viaja en la URL como `?en=u:<ubicación>` o `?en=obra:<obra_id>`: una obra activa que todavía no tiene
// ubicación (nadie movió nada ahí) se puede elegir igual, y la ubicación la crea `ubicacion_de_obra()`
// cuando algo llega. Sin `en`, la pantalla pregunta; no se adivina la obra de nadie.

import type { ObraIndice } from '../types.ts'
import { rotuloDeObra } from '../../../shared/utils/obra.ts'
import { activosEn, rotuloUbicacion, type Parque } from './parque.ts'

export interface Lugar {
  clave: string
  rotulo: string
  /** null = obra activa sin ubicación creada todavía: no puede tener nada adentro. */
  ubicacionId: string | null
  esObra: boolean
}

export function resolverLugar(p: Parque, obras: ObraIndice[], en: string | null | undefined): Lugar | null {
  if (!en) return null
  if (en.startsWith('u:')) {
    const u = p.ubicacionPorId.get(en.slice(2))
    return u ? { clave: en, rotulo: rotuloUbicacion(p, u.id), ubicacionId: u.id, esObra: u.tipo === 'obra' } : null
  }
  if (en.startsWith('obra:')) {
    const id = en.slice(5)
    const u = p.ubicaciones.find((x) => x.tipo === 'obra' && x.obra_id === id)
    if (u) return { clave: `u:${u.id}`, rotulo: rotuloUbicacion(p, u.id), ubicacionId: u.id, esObra: true }
    const o = obras.find((x) => x.id === id)
    return o ? { clave: en, rotulo: rotuloDeObra(o), ubicacionId: null, esObra: true } : null
  }
  return null
}

/**
 * Los lugares para elegir «dónde estás»: el Taller primero, después las obras activas del índice AGRUPADAS
 * POR CLIENTE (25/09/2026: el cliente es el predio; la obra, la imputación). `cliente` es el encabezado del
 * grupo; el Taller no tiene.
 */
export function lugaresParaElegir(p: Parque, obras: ObraIndice[]): { clave: string; rotulo: string; cuenta: number; cliente: string | null }[] {
  const taller = p.ubicaciones.filter((u) => u.tipo === 'taller' && !u.archivada)
    .map((u) => ({ clave: `u:${u.id}`, rotulo: rotuloUbicacion(p, u.id), cuenta: activosEn(p, u.id).length, cliente: null }))
  const deObras = obras.filter((o) => o.estado === 'activa').map((o) => {
    const u = p.ubicaciones.find((x) => x.tipo === 'obra' && x.obra_id === o.id)
    return { clave: u ? `u:${u.id}` : `obra:${o.id}`, rotulo: rotuloDeObra(o), cuenta: u ? activosEn(p, u.id).length : 0, cliente: o.cliente ?? 'Sin cliente cargado' }
  }).sort((a, b) => Number(a.cliente === 'Sin cliente cargado') - Number(b.cliente === 'Sin cliente cargado') || a.cliente.localeCompare(b.cliente, 'es') || a.rotulo.localeCompare(b.rotulo, 'es'))
  return [...taller, ...deObras]
}

/** `?en=` para pegar a un enlace, o nada. */
export function conLugar(href: string, en: string | null | undefined): string {
  if (!en) return href
  return `${href}${href.includes('?') ? '&' : '?'}en=${encodeURIComponent(en)}`
}

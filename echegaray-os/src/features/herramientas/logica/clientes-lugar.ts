// EL CLIENTE ES EL LUGAR; LA OBRA ES LA IMPUTACIÓN — Ubicaciones por cliente › obras (dueño, 25/09/2026).
//
// Textual: «quiero que se muestre como está en CRM admin o ERP Obras: por cliente › obras; si quiero ver
// todo lo que hay en un cliente que me salga eso, y después ver por obra; pero en realidad la ubicación
// es la misma, en un cliente».
//
// La base no cambia: cada obra sigue teniendo su ubicación (`ubicacion.obra_id`) y cada movimiento su
// obra. Lo que cambia es la LECTURA: las ubicaciones de obra se agrupan por el cliente de su obra
// (`obra_canonica.cliente_id`, la misma fuente que el CRM), el cliente suma lo de todas sus obras, y un
// movimiento entre dos obras del mismo cliente se lee como lo que es: una reimputación dentro del mismo
// predio, no un traslado. Puro: sin Supabase, sin React.

import type { Activo } from '../types.ts'
import { activosEn, cantidadEn, rotuloUbicacion, type Parque } from './parque.ts'

/** La clave de «sin cliente cargado» en la URL y en los grupos. */
export const SIN_CLIENTE = 'sin'

export interface ObraDelCliente {
  ubicacionId: string
  obraId: string
  rotulo: string
  /** Activos distintos con al menos una unidad en esta obra. */
  n: number
}

export interface ClienteLugar {
  /** `cliente_id`, o `SIN_CLIENTE`. */
  clave: string
  /** Como en el CRM. null = la obra no tiene cliente cargado (o la sesión no puede leer su nombre). */
  nombre: string | null
  obras: ObraDelCliente[]
  /** Activos distintos en todo el cliente: un lote repartido en dos obras del mismo cliente cuenta uno. */
  n: number
  unidades: number
}

/** El cliente de una ubicación de obra; null si la ubicación no es de obra. */
export function clienteDeUbicacion(p: Parque, ubicacionId: string | null | undefined): string | null {
  if (!ubicacionId) return null
  const u = p.ubicacionPorId.get(ubicacionId)
  if (!u || u.tipo !== 'obra' || !u.obra_id) return null
  return p.obraPorId.get(u.obra_id)?.cliente_id ?? SIN_CLIENTE
}

/**
 * Las ubicaciones de obra con algo, agrupadas por cliente. Del cliente con más activos al que menos; sin
 * cliente cargado, al final. Las obras de cada cliente, de la que más tiene a la que menos.
 */
export function clientesConObras(p: Parque): ClienteLugar[] {
  const grupos = new Map<string, { nombre: string | null; obras: ObraDelCliente[]; activos: Set<string>; unidades: number }>()
  for (const u of p.ubicaciones) {
    if (u.tipo !== 'obra' || u.archivada || !u.obra_id) continue
    const aca = activosEn(p, u.id)
    if (!aca.length) continue
    const obra = p.obraPorId.get(u.obra_id)
    const clave = obra?.cliente_id ?? SIN_CLIENTE
    const g = grupos.get(clave) ?? { nombre: obra?.cliente ?? null, obras: [], activos: new Set<string>(), unidades: 0 }
    g.obras.push({ ubicacionId: u.id, obraId: u.obra_id, rotulo: rotuloUbicacion(p, u.id), n: aca.length })
    for (const a of aca) { g.activos.add(a.id); g.unidades += cantidadEn(p, a.id, u.id) }
    if (!g.nombre && obra?.cliente) g.nombre = obra.cliente
    grupos.set(clave, g)
  }
  return [...grupos].map(([clave, g]) => ({
    clave, nombre: g.nombre, n: g.activos.size, unidades: g.unidades,
    obras: g.obras.sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'es')),
  })).sort((a, b) => Number(a.clave === SIN_CLIENTE) - Number(b.clave === SIN_CLIENTE) || b.n - a.n || (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))
}

export interface ActivoDelCliente {
  activo: Activo
  /** Dónde está dentro del cliente: cada obra con sus unidades. */
  porObra: { ubicacionId: string; rotulo: string; cantidad: number }[]
  total: number
}

/** Todo lo que hay en un cliente, sumando sus obras. Con `obra`, sólo lo de esa ubicación de obra. */
export function activosDelCliente(p: Parque, c: ClienteLugar, obra: string | null = null): ActivoDelCliente[] {
  const m = new Map<string, ActivoDelCliente>()
  for (const o of c.obras) {
    if (obra && o.ubicacionId !== obra) continue
    for (const a of activosEn(p, o.ubicacionId)) {
      const x = m.get(a.id) ?? { activo: a, porObra: [], total: 0 }
      const n = cantidadEn(p, a.id, o.ubicacionId)
      x.porObra.push({ ubicacionId: o.ubicacionId, rotulo: o.rotulo, cantidad: n })
      x.total += n
      m.set(a.id, x)
    }
  }
  return [...m.values()].sort((a, b) => Number(b.activo.clase === 'rodado') - Number(a.activo.clase === 'rodado') || a.activo.nombre.localeCompare(b.activo.nombre, 'es'))
}

/**
 * ¿Es una reimputación? Origen y destino son obras del MISMO cliente con cliente cargado: la cosa no se
 * movió de predio, cambió la obra a la que se imputa.
 */
export function esReimputacion(p: Parque, origen: string | null | undefined, destino: string | null | undefined): boolean {
  const a = clienteDeUbicacion(p, origen)
  const b = clienteDeUbicacion(p, destino)
  return !!a && a !== SIN_CLIENTE && a === b && origen !== destino
}

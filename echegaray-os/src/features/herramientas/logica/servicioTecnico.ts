// UN SERVICIO TÉCNICO ES UN PROVEEDOR (dueño, 23/09/2026: «puede formar parte de una categoría de
// proveedores»). Migración 20260923T2400: el lugar `servicio_tecnico` apunta a `proveedores` y toma su
// nombre; el rubro «Servicio técnico» es el listado.
//
// Y LA PLANILLA ES DE UN LUGAR PROPIO. «Planilla» imprime el control físico de lo que hay en un lugar
// para tildarlo en obra. En un servicio técnico o en un tercero no hay nada que tildar: lo que está
// afuera se controla por cuánto hace que salió (Mantenimiento). Por eso el botón no aparece ahí.

import type { ProveedorLugar, TipoUbicacion } from '../types.ts'
import type { Parque } from './parque.ts'

export const RUBRO_SERVICIO_TECNICO = 'Servicio técnico'

/** Dónde tiene sentido imprimir el control físico: lugares propios (obra, taller, rodado). */
export function esLugarImprimible(tipo: TipoUbicacion): boolean {
  return tipo === 'obra' || tipo === 'taller' || tipo === 'rodado'
}

/** El rubro efectivo del proveedor: lo declarado gana; si no, lo deducido. */
export function rubroEfectivo(p: Pick<ProveedorLugar, 'rubro' | 'rubro_deducido'>): string | null {
  return p.rubro ?? p.rubro_deducido ?? null
}

export interface CandidatoServicioTecnico {
  proveedor: ProveedorLugar
  /** Ya es un lugar de Herramientas (no se vuelve a crear: se elige). */
  ubicacionId: string | null
  esDelRubro: boolean
}

/**
 * Los proveedores que se pueden elegir como servicio técnico, los del rubro primero y en orden
 * alfabético adentro de cada grupo. `buscar` filtra por nombre o CUIT.
 */
export function candidatosServicioTecnico(p: Parque, buscar = ''): CandidatoServicioTecnico[] {
  const q = buscar.trim().toLocaleLowerCase('es')
  const lugarDe = new Map<string, string>()
  for (const u of p.ubicaciones) if (u.proveedor_id && !u.archivada) lugarDe.set(u.proveedor_id, u.id)
  return [...p.proveedorPorId.values()]
    .filter((x) => !q || x.nombre.toLocaleLowerCase('es').includes(q) || (x.cuit ?? '').includes(q))
    .map((proveedor) => ({ proveedor, ubicacionId: lugarDe.get(proveedor.id) ?? null, esDelRubro: rubroEfectivo(proveedor) === RUBRO_SERVICIO_TECNICO }))
    .sort((a, b) => Number(b.esDelRubro) - Number(a.esDelRubro) || a.proveedor.nombre.localeCompare(b.proveedor.nombre, 'es'))
}

/** Lo que va arriba del nombre del lugar cuando es un proveedor: rubro y CUIT, si están. */
export function encimaDelProveedor(pr: ProveedorLugar): string[] {
  return [rubroEfectivo(pr), pr.cuit ? `CUIT ${pr.cuit}` : null].filter((x): x is string => !!x)
}

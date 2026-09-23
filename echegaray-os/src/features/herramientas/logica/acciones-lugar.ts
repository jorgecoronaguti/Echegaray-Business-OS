// LAS ACCIONES DE UN LUGAR — las mismas en el teléfono (M01, «¿Dónde estás?») y en Ubicaciones de
// escritorio (D04, al elegir un lugar). Paridad funcional (dueño, 23/09/2026): «en app mobile encontré
// módulos que en compu no están». Lo que se puede hacer parado en la obra se puede hacer desde la
// oficina, con los mismos nombres. Los rótulos y las listas salen de acá para que no diverjan.

import type { Activo } from '../types.ts'
import { activosEn, type Parque } from './parque.ts'
import { seVerifica } from './verificacion.ts'

/** Cuántos «Verificar …» se ofrecen de una en el menú del lugar; el resto se elige de la lista. */
export const MAX_VERIFICABLES_EN_MENU = 3

/** Los rodados y máquinas que están HOY en el lugar, hasta `max`: cada uno es un botón «Verificar …». */
export function verificablesDelLugar(p: Parque, ubicacionId: string | null | undefined, max = MAX_VERIFICABLES_EN_MENU): Activo[] {
  if (!ubicacionId) return []
  return activosEn(p, ubicacionId).filter(seVerifica).slice(0, max)
}

/** Todo lo verificable del parque, para elegir cuando en el lugar no hay ninguno (M10/M13 sin `en`). */
export function verificablesDelParque(p: Parque): Activo[] {
  return p.activos.filter(seVerifica).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** «Verificar el rodado AB123CD» · «Verificar Hormigonera». */
export function rotuloVerificar(a: Pick<Activo, 'clase' | 'nombre' | 'patente'>): string {
  return a.clase === 'rodado' ? `Verificar el rodado ${a.patente ?? a.nombre}` : `Verificar ${a.nombre}`
}

/** «Qué hay en esta obra» · «Qué hay acá». */
export function rotuloQueHay(esObra: boolean): string {
  return esObra ? 'Qué hay en esta obra' : 'Qué hay acá'
}

/** El botón «Mover» del lugar: «Mover 1» · «Mover las 4»; sin marcas, en escritorio, se mueve todo. */
export function textoMoverDelLugar(marcadas: number, total: number): string {
  if (marcadas > 0) return marcadas === 1 ? 'Mover 1' : `Mover las ${marcadas}`
  if (total === 0) return 'Mover'
  return `Mover todo · ${total}`
}

/** Nombres canónicos de las acciones (los del teléfono), para que escritorio diga lo mismo. */
export const ACCION = {
  buscar: 'Buscar una herramienta',
  mover: 'Mover herramientas',
  reportar: 'Reportar un problema',
  verificarElegir: 'Verificar un rodado o máquina',
  alta: 'Dar de alta una herramienta',
  recuento: 'Recuento del lugar',
  escanear: 'Escanear',
  movimientos: 'Movimientos',
} as const

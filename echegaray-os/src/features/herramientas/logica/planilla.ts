// LA PLANILLA DE UNA OBRA — Herramienta · Ingreso · Salida · Observación.
//
// Dueño, 22/09, con la foto de la planilla de papel que se usa hoy en obra: «el resultado de esto puede
// ser q la obra tenga algo asi». No se carga aparte: sale de los movimientos. Cada vez que un activo
// ENTRA a la ubicación es un renglón; la salida es el movimiento siguiente que lo saca de ahí (vacía si
// sigue). La observación junta la nota con que llegó, la nota con que salió y, si todavía está ahí con
// un problema, su estado.

import { ETIQUETA_ESTADO, type Parque } from './parque.ts'
import type { Activo } from '../types.ts'

export interface RenglonPlanilla {
  activo: Activo
  ingreso: string
  salida: string | null
  observacion: string
}

export function planilla(p: Parque, ubicacionId: string): RenglonPlanilla[] {
  const porActivo = new Map<string, typeof p.movimientos>()
  for (const m of p.movimientos) {
    const l = porActivo.get(m.activo_id)
    if (l) l.push(m)
    else porActivo.set(m.activo_id, [m])
  }
  const out: RenglonPlanilla[] = []
  for (const [activoId, movs] of porActivo) {
    const a = p.activoPorId.get(activoId)
    if (!a) continue
    const orden = [...movs].sort((x, y) => x.fecha_hora.localeCompare(y.fecha_hora) || x.id.localeCompare(y.id))
    for (let i = 0; i < orden.length; i++) {
      const entra = orden[i]
      if (entra.destino_id !== ubicacionId) continue
      const sale = orden.slice(i + 1).find((m) => m.origen_id === ubicacionId || m.destino_id !== ubicacionId) ?? null
      const notas = [limpia(entra.nota), sale ? limpia(sale.nota) : null].filter(Boolean) as string[]
      const sigue = !sale && a.ubicacion_id === ubicacionId
      if (sigue && a.estado !== 'operativo') notas.push(ETIQUETA_ESTADO[a.estado].toLowerCase())
      out.push({ activo: a, ingreso: entra.fecha_hora, salida: sale ? sale.fecha_hora : null, observacion: notas.join(' · ') })
    }
  }
  return out.sort((x, y) => x.ingreso.localeCompare(y.ingreso) || x.activo.nombre.localeCompare(y.activo.nombre, 'es'))
}

/** Las notas automáticas de la importación no son observaciones de obra. */
function limpia(n: string | null): string | null {
  if (!n) return null
  const t = n.trim()
  if (!t || /^importado/i.test(t) || t === 'alta') return null
  return t
}

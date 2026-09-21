// EL HISTORIAL DE UN ACTIVO — movimientos, reportes, alta y baja en una sola línea de tiempo.
//
// Cada renglón dice qué pasó y quién. Un reporte dice «la ubicación no cambió» porque es la regla que
// más se confunde: reportar un problema no mueve nada.

import { autorDe, rotuloUbicacion, MOTIVO_BAJA, type Parque } from './parque.ts'

export interface Renglon {
  fecha: string
  texto: string
  nota: string | null
  tipo: 'movimiento' | 'reporte' | 'alta' | 'baja' | 'cierre'
}

const TIPO_REPORTE: Record<string, string> = {
  fallando: 'Problema reportado: anda pero falla',
  no_anda: 'Problema reportado: no anda',
  no_encontrada: 'Reportada como no encontrada',
}

export function historial(p: Parque, activoId: string): Renglon[] {
  const a = p.activoPorId.get(activoId)
  if (!a) return []
  const out: Renglon[] = []
  for (const m of p.movsDe.get(activoId) ?? []) {
    const quien = autorDe(p, m)
    const hacia = rotuloUbicacion(p, m.destino_id)
    const que = m.origen_id
      ? `${rotuloUbicacion(p, m.origen_id)} → ${hacia}`
      : m.importado ? `origen desconocido → ${hacia}` : `Alta${a.alta_desde_obra ? ' desde obra' : ''} en ${hacia}`
    out.push({
      fecha: m.fecha_hora,
      texto: `${que}${quien ? ` · ${quien}` : ''}`,
      nota: m.nota && m.nota !== 'alta' ? m.nota : null,
      tipo: 'movimiento',
    })
  }
  for (const i of p.incDe.get(activoId) ?? []) {
    const quien = i.usuario_id ? p.nombres[i.usuario_id] : null
    out.push({ fecha: i.creado_en, texto: `${TIPO_REPORTE[i.tipo] ?? 'Problema reportado'}${quien ? ` · ${quien}` : ''}`, nota: i.texto, tipo: 'reporte' })
    if (i.cerrada_en) out.push({ fecha: i.cerrada_en, texto: 'Reporte cerrado', nota: null, tipo: 'cierre' })
  }
  if (a.baja_en) out.push({ fecha: a.baja_en, texto: `Baja por ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? 'motivo sin cargar'}`, nota: a.baja_detalle, tipo: 'baja' })
  const importado = !!a.legado_id
  const altaConLugar = (p.movsDe.get(activoId) ?? []).some((m) => !m.origen_id && !m.importado)
  if (!altaConLugar) out.push({ fecha: a.creado_en, texto: importado ? 'Alta · importada del listado' : a.alta_desde_obra ? 'Alta desde obra' : 'Alta', nota: null, tipo: 'alta' })
  return out.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
}

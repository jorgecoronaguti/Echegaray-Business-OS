// EL HISTORIAL DE UN ACTIVO — movimientos, reportes, alta y baja en una sola línea de tiempo.
//
// Cada renglón dice qué pasó y quién. Un reporte dice «la ubicación no cambió» porque es la regla que
// más se confunde: reportar un problema no mueve nada.

import { esReimputacion } from './clientes-lugar.ts'
import type { LecturaUso } from '../types.ts'
import { autorDe, rotuloUbicacion, MOTIVO_BAJA, type Parque } from './parque.ts'
import { ITEMS, numeroAr } from './verificacion.ts'
import { lineasDe } from './recuento.ts'

export interface Renglon {
  fecha: string
  texto: string
  nota: string | null
  tipo: 'movimiento' | 'reporte' | 'alta' | 'baja' | 'cierre' | 'verificacion' | 'recuento'
}

/** Quién manejó u operó: la persona elegida en M13 o, si no se eligió, el usuario que la cargó. */
export function operadorDe(p: Parque, l: Pick<LecturaUso, 'operador_persona_id' | 'usuario_id'>): string | null {
  if (l.operador_persona_id) return p.personas?.[l.operador_persona_id] ?? null
  return p.nombres[l.usuario_id] ?? null
}

/** «Verificación de uso · sin observaciones · 148.220 km · R. Sosa» (D03). */
export function textoLecturaHistorial(p: Parque, clase: string, l: LecturaUso): string {
  const clave = clase === 'equipo' ? 'equipo' : 'rodado'
  const mal = ITEMS[clave].filter((i) => l.checklist?.[i.clave] === 'mal').map((i) => i.rotulo.toLowerCase())
  const que = mal.length ? `mal en ${mal.join(', ')}` : l.observacion ? null : 'sin observaciones'
  const quien = operadorDe(p, l)
  return [
    'Verificación de uso',
    que,
    l.observacion ? `«${l.observacion}»` : null,
    l.lectura != null ? `${numeroAr(l.lectura)} ${l.unidad}` : null,
    quien,
  ].filter(Boolean).join(' · ')
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
      ? esReimputacion(p, m.origen_id, m.destino_id)
        ? `Reimputado ${rotuloUbicacion(p, m.origen_id)} → ${hacia} (mismo cliente, no se movió)`
        : `${rotuloUbicacion(p, m.origen_id)} → ${hacia}`
      : m.importado ? `origen desconocido → ${hacia}` : m.comprobante_id ? `Compra → ${hacia}` : m.respaldo_drive_file_id ? `Entrega histórica (constancia) → ${hacia}` : `Alta${a.alta_desde_obra ? ' desde obra' : ''} en ${hacia}`
    // Un lote dice cuántas unidades viajaron («3 u. · Taller → Entrepiso»); lo de a una, nada.
    const cuantas = (a.cantidad > 1 || (m.cantidad ?? 1) > 1) && m.cantidad ? `${m.cantidad} u. · ` : ''
    out.push({
      fecha: m.fecha_hora,
      texto: `${cuantas}${que}${quien ? ` · ${quien}` : ''}`,
      nota: m.nota && m.nota !== 'alta' ? m.nota : null,
      tipo: 'movimiento',
    })
  }
  for (const j of p.ajustesDe.get(activoId) ?? []) {
    const quien = j.usuario_id ? p.nombres[j.usuario_id] : null
    const donde = rotuloUbicacion(p, j.ubicacion_id)
    const texto = j.motivo === 'recuento'
      ? `Recuento en ${donde}: ${j.antes} → ${j.despues}`
      : j.motivo === 'egreso'
      ? `Egresó · no devuelto: ${j.antes - j.despues} u. que tenía ${donde}`
      : `Baja de ${j.antes - j.despues} u. en ${donde} por ${MOTIVO_BAJA[j.motivo] ?? j.motivo}`
    out.push({ fecha: j.creado_en, texto: `${texto}${quien ? ` · ${quien}` : ''}`, nota: j.detalle, tipo: j.motivo === 'recuento' ? 'movimiento' : 'baja' })
  }
  // Un recuento del lugar (20260923T1700) que se guardó SIN ajustar dejó la diferencia como evidencia y
  // ninguna fila en `activo_ajuste`: se muestra desde sus líneas. El que sí ajustó ya está arriba, por el ajuste.
  for (const r of p.recuentos ?? []) {
    if (!r.cerrado_en || r.aplicado) continue
    const l = lineasDe(p.recuentoLineas, r.id).find((x) => x.activo_id === activoId)
    if (!l || l.contado == null || l.diferencia === 0) continue
    const quien = r.cerrado_por ? p.nombres[r.cerrado_por] : null
    out.push({
      fecha: r.cerrado_en,
      texto: `Recuento en ${rotuloUbicacion(p, r.ubicacion_id)}: se esperaban ${l.esperado}, se contaron ${l.contado} · sin ajustar${quien ? ` · ${quien}` : ''}`,
      nota: l.nota,
      tipo: 'recuento',
    })
  }
  for (const i of p.incDe.get(activoId) ?? []) {
    const quien = i.usuario_id ? p.nombres[i.usuario_id] : null
    out.push({ fecha: i.creado_en, texto: `${TIPO_REPORTE[i.tipo] ?? 'Problema reportado'}${quien ? ` · ${quien}` : ''}`, nota: i.texto, tipo: 'reporte' })
    if (i.cerrada_en) out.push({ fecha: i.cerrada_en, texto: 'Reporte cerrado', nota: null, tipo: 'cierre' })
  }
  for (const l of p.lecDe.get(activoId) ?? []) {
    out.push({ fecha: l.fecha_hora, texto: textoLecturaHistorial(p, a.clase, l), nota: null, tipo: 'verificacion' })
  }
  if (a.baja_en) out.push({ fecha: a.baja_en, texto: `Baja por ${MOTIVO_BAJA[a.baja_motivo ?? ''] ?? 'motivo sin cargar'}`, nota: a.baja_detalle, tipo: 'baja' })
  const importado = !!a.legado_id
  const altaConLugar = (p.movsDe.get(activoId) ?? []).some((m) => !m.origen_id && !m.importado)
  if (!altaConLugar) out.push({ fecha: a.creado_en, texto: importado ? 'Alta · importada del listado' : a.alta_desde_obra ? 'Alta desde obra' : 'Alta', nota: null, tipo: 'alta' })
  return out.sort((x, y) => (x.fecha < y.fecha ? 1 : x.fecha > y.fecha ? -1 : 0))
}

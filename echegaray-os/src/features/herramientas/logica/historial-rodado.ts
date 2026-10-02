// EL HISTORIAL CORTO DE UN RODADO O MÁQUINA — fallas, arreglos y revisiones en una sola línea de tiempo.
//
// Antes cada cosa vivía en su lista (revisiones en la ficha de revisión, arreglos en el libro de vida, fallas
// en el historial general) y nadie veía «qué le pasó a la Hilux» de corrido. Acá se juntan, sin inventar:
// cada renglón sale de una fila real y dice de qué tabla.

import type { Incidencia } from '../types.ts'
import { NOMBRE_TIPO_EVENTO, type Evento } from './evento.ts'
import { NOMBRE_RESULTADO, NOMBRE_REVISION, textoLecturaRevision, type Revision } from './revision.ts'

export type ClaseRenglon = 'falla' | 'arreglo' | 'revision'

export interface RenglonRodado {
  clave: string
  /** yyyy-mm-dd */
  fecha: string
  clase: ClaseRenglon
  titulo: string
  detalle: string | null
}

const TEXTO_FALLA: Record<Incidencia['tipo'], string> = {
  fallando: 'Falla reportada · sigue en uso',
  no_anda: 'Falla reportada · fuera de servicio',
  no_encontrada: 'Avisada como no encontrada',
}

export function historialDeRodado(
  activoId: string,
  fuentes: { revisiones: readonly Revision[] | null | undefined; eventos: readonly Evento[] | null | undefined; incidencias: readonly Incidencia[] | null | undefined },
  unidad: 'km' | 'h',
): RenglonRodado[] {
  const out: (RenglonRodado & { orden: string })[] = []
  for (const r of fuentes.revisiones ?? []) {
    if (r.activo_id !== activoId) continue
    const partes = [
      r.resultado ? NOMBRE_RESULTADO[r.resultado] : null,
      r.lectura != null ? textoLecturaRevision(r.lectura, unidad) : null,
      r.numero ? `N° ${r.numero}` : null,
      r.lugar,
      r.vencimiento ? `vence ${r.vencimiento.slice(8, 10)}/${r.vencimiento.slice(5, 7)}/${r.vencimiento.slice(0, 4)}` : null,
    ].filter(Boolean)
    out.push({ clave: `r${r.id}`, fecha: r.fecha, clase: 'revision', titulo: NOMBRE_REVISION[r.tipo], detalle: partes.join(' · ') || null, orden: `${r.fecha}${r.creado_en}` })
  }
  for (const e of fuentes.eventos ?? []) {
    if (e.activo_id !== activoId) continue
    const estado = e.situacion === 'hecho' ? null : e.situacion === 'en_taller' ? 'en el mecánico' : 'hay que llevarlo'
    out.push({
      clave: `e${e.id}`, fecha: e.fecha, clase: 'arreglo', titulo: NOMBRE_TIPO_EVENTO[e.tipo],
      detalle: [e.trabajo_hecho || e.descripcion, estado].filter(Boolean).join(' · ') || null, orden: `${e.fecha}${e.creado_en}`,
    })
  }
  for (const i of fuentes.incidencias ?? []) {
    if (i.activo_id !== activoId) continue
    out.push({
      clave: `i${i.id}`, fecha: i.creado_en.slice(0, 10), clase: 'falla', titulo: TEXTO_FALLA[i.tipo],
      detalle: [i.texto ? `«${i.texto}»` : null, i.cerrada_en ? 'cerrada' : null].filter(Boolean).join(' · ') || null, orden: i.creado_en,
    })
  }
  return out.sort((a, b) => (a.orden < b.orden ? 1 : -1)).map((x) => ({ clave: x.clave, fecha: x.fecha, clase: x.clase, titulo: x.titulo, detalle: x.detalle }))
}

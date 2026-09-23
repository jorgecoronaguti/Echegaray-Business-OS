// LA MANO DE OBRA PROPIA EN LA SOLAPA ECONOMÍA DE LA OBRA.
//
// La página Obras decía «Sin una hora adentro» para Quattropani porque leía
// `obra_costo_real.costo_mano_de_obra` —compras con área «personas»—, que no es la mano de obra de la
// obra. La línea nueva lee la definición única (`costo_de_obras_a_la_fecha`, 20260915T0800), la misma
// que la ficha del CRM. Pura: convierte la fila de la RPC.

import type { ManoObraPropia } from '../types/economia.ts'

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * La fila de `obra_id` en la respuesta de `costo_de_obras_a_la_fecha`. Sin fila la obra no tiene compras
 * ni horas: importe `null`, que la pantalla dibuja «—». Una respuesta que no es lista es «no pude leer».
 */
export function manoObraPropiaDe(data: unknown, obraId: string): ManoObraPropia | null {
  if (!Array.isArray(data)) return null
  const r = data.find((x) => (x as Record<string, unknown> | null)?.obra_id === obraId) as Record<string, unknown> | undefined
  if (!r) return { importe: null, estimado: null, horasSinDato: 0, puedeVer: true }
  return {
    importe: num(r.mano_obra),
    estimado: num(r.mano_obra_estimada),
    horasSinDato: num(r.horas_sin_tarifa) ?? 0,
    horasValorizadas: num(r.horas_valorizadas),
    puedeVer: r.puede_ver_tarifas !== false,
  }
}

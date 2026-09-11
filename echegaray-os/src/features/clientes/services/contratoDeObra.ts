// EL CONTRATO DE UN TRABAJO, LEÍDO PARA LA PANTALLA — las reglas puras de `CeldasDeContrato`.
//
// Viven acá y no en el componente para que `node --test` las pruebe sin JSX. Ver el encabezado de
// `components/CeldasDeContrato.tsx` para el porqué de cada una.

import type { ObraEnCurso } from '@/features/administracion/services/homeCartera'

const FUENTE: Record<string, string> = {
  contrato: 'el contrato firmado', oc: 'la orden de compra', presupuesto: 'el presupuesto',
  cotizacion: 'la cotización',
}

/** El papel que respalda el desglose, en una frase para el `title`. */
export function fraseDeFuente(o: Pick<ObraEnCurso, 'contratoFuente' | 'contratoFuenteNombre' | 'contratoCita'>): string {
  if (!o.contratoFuente) return 'Ningún papel cargado separa mano de obra y materiales para este trabajo.'
  const papel = FUENTE[o.contratoFuente] ?? o.contratoFuente
  return `Según ${papel}${o.contratoFuenteNombre ? ` («${o.contratoFuenteNombre}»)` : ''}`
    + (o.contratoCita ? `: ${o.contratoCita}` : '.')
}

/** LA BASE CONTRA LA QUE SE MIDE EL COBRO: el total del contrato cuando hay desglose; si no, el
 *  precio único que publica OBRAS. Nunca la mano de obra sola cuando el cliente también paga
 *  materiales — ése fue el 94 % de Quattropani (11/09/2026). */
export function baseDelContrato(o: Pick<ObraEnCurso, 'contratoTotal' | 'contratado'>): number | null {
  return o.contratoTotal ?? o.contratado
}

/**
 * LO COBRADO NETO DE UN TRABAJO, PARA LA BARRA. `null` = no se sabe (la base no reparte, o
 * Cobranzas anota contra el cliente, o no hay NINGUNA fila del trabajo). Pero un trabajo con filas
 * pendientes y ninguna cobrada SÍ cobró cero: la deuda está registrada y no entró nada.
 */
export function cobradoParaLaBarra(o: Pick<ObraEnCurso, 'cobroDisponible' | 'imputacion' | 'cobradoNeto' | 'porCobrar'>): number | null {
  if (!o.cobroDisponible || o.imputacion === 'cliente') return null
  if (o.cobradoNeto !== null) return o.cobradoNeto
  return o.porCobrar !== null ? 0 : null
}

/** La suma del cliente sobre sus trabajos en curso, declarando cuántos no tienen el dato. */
export function sumaDeObras(enCurso: ObraEnCurso[], de: (o: ObraEnCurso) => number | null): { total: number | null; faltan: number } {
  let total: number | null = null
  let faltan = 0
  for (const o of enCurso) {
    const v = de(o)
    if (v === null) { faltan += 1; continue }
    total = (total ?? 0) + v
  }
  return { total, faltan }
}

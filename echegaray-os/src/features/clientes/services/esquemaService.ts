// PANTALLA 32 — el esquema de pago: el admin arma las fechas y las publica al portal.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type { PagoEsquema } from '../types'

const COLUMNAS =
  'id, cliente_id, obra_id, cobranza_fila, concepto, fecha, monto, reparo, estado, medio,'
  + ' visible_portal, aviso_dias, mostrar_reprogramaciones, nota_interna, reprogramaciones,'
  + ' publicado_at, cambio_pendiente, orden'

/**
 * El esquema completo del cliente, en el orden en que el admin lo dejó.
 *
 * `orden` primero y `fecha` como desempate: la pantalla 32 deja reordenar a mano, y ordenar sólo por
 * fecha perdería ese trabajo en cada recarga. Dos pagos del mismo día sin orden explícito caen por
 * fecha, que es el criterio que una persona espera.
 */
export async function getEsquema(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<PagoEsquema[]>> {
  const { data, error } = await supabase
    .from('esquema_pago')
    .select(COLUMNAS)
    .eq('cliente_id', clienteId)
    .order('orden', { ascending: true })
    .order('fecha', { ascending: true, nullsFirst: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as PagoEsquema[], error: null }
}

/**
 * ¿HAY ALGO SIN PUBLICAR? Es lo que enciende el botón «Publicar al cliente» de la pantalla 32.
 *
 * Son dos casos distintos y los dos cuentan: un pago que nunca se publicó (`publicado_at` nulo y
 * marcado visible) y uno publicado que después cambió de fecha o de monto (`cambio_pendiente`).
 * Mirar sólo el segundo dejaría el esquema nuevo sin avisar nunca.
 */
export function hayCambiosSinPublicar(pagos: PagoEsquema[]): boolean {
  return pagos.some((p) => p.visible_portal && (p.publicado_at === null || p.cambio_pendiente))
}

/**
 * El próximo vencimiento que le corresponde ver al cliente. Alimenta el mail de publicación.
 *
 * Sólo mira lo visible y no cobrado: recordarle a alguien un pago que ya hizo es la clase de error
 * que hace que el cliente deje de leer los avisos.
 */
export function proximoVencimiento(pagos: PagoEsquema[], hoy = new Date()): PagoEsquema | null {
  const dia = hoy.toISOString().slice(0, 10)
  const candidatos = pagos
    .filter((p) => p.visible_portal && p.estado !== 'cobrado' && p.fecha && p.fecha >= dia)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  return candidatos[0] ?? null
}

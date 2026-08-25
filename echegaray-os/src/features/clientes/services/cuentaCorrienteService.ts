// PANTALLA 28 — cuenta corriente del cliente: antigüedad, DSO y certificados al cobro.
//
// Cero cálculo acá. El saldo, el vencido, el aging, el DSO y la efectividad salen de la vista
// `public.cliente_cuenta_corriente`, que es la ÚNICA definición de esos conceptos en todo el OS:
// la web, el chat y Claude Code leen la misma. Recalcularlos en TypeScript sería crear una segunda
// versión de la empresa que un día va a discrepar con la del Sheet y nadie va a saber cuál vale.
//
// Qué cuenta como deuda y qué es «vencido» está decidido en la vista y documentado ahí: sólo
// Pendiente y Facturado son cuentas por cobrar (Proyectado es previsión del dueño), y vencido es la
// definición de la columna U de la propia pestaña Cobranzas.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult, ServiceResultOpcional } from '@/features/obras/types'
import type { CambioCobranza, CertificadoCliente, CuentaCorrienteCliente } from '../types'

/**
 * La cuenta corriente de UN cliente.
 *
 * Devuelve `null` sin error cuando el cliente no tiene ni un movimiento en Cobranzas — que no es un
 * fallo: es un cliente nuevo, o uno cuyo texto en el Sheet todavía no resuelve a este `cliente_id`.
 * Un cero fabricado acá diría «no debe nada», que es una afirmación distinta de «no hay dato».
 */
export async function getCuentaCorriente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResultOpcional<CuentaCorrienteCliente>> {
  const { data, error } = await supabase
    .from('cliente_cuenta_corriente')
    .select('*')
    .eq('cliente_id', clienteId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  return { data: normalizarCuenta(data as Record<string, unknown>), error: null }
}

/**
 * `count(*)` de Postgres es `bigint` y PostgREST lo entrega como STRING. Sin esta normalización,
 * `comprobantes_pendientes` llega como `"7"` y cualquier comparación numérica en la pantalla —o un
 * `.toLocaleString()`— se comporta de forma sorprendente. Se arregla en el borde, una sola vez.
 */
function normalizarCuenta(row: Record<string, unknown>): CuentaCorrienteCliente {
  const num = (k: string): number => Number(row[k] ?? 0)
  // Los que pueden ser legítimamente NULL conservan el null: ver el comentario de los tipos.
  const opc = (k: string): number | null => (row[k] == null ? null : Number(row[k]))
  return {
    cliente_id: String(row.cliente_id),
    nombre_comercial: String(row.nombre_comercial ?? ''),
    saldo: num('saldo'),
    vencido: num('vencido'),
    por_vencer: num('por_vencer'),
    comprobantes_pendientes: num('comprobantes_pendientes'),
    aging_por_vencer: num('aging_por_vencer'),
    aging_1_30: num('aging_1_30'),
    aging_31_60: num('aging_31_60'),
    aging_61_90: num('aging_61_90'),
    aging_mas_90: num('aging_mas_90'),
    facturado_90d: num('facturado_90d'),
    cobrado_90d: num('cobrado_90d'),
    dso: opc('dso'),
    efectividad_pct: opc('efectividad_pct'),
    dias_cobro_promedio: opc('dias_cobro_promedio'),
    fondo_reparo: num('fondo_reparo'),
  }
}

/**
 * Los certificados del cliente, del más nuevo al más viejo.
 *
 * Sin `limit`: la pantalla 28 muestra la cartera entera del cliente y paginar acá obligaría a que el
 * total de la pantalla se calcule sobre una página, que es cómo se publican totales que no cierran.
 */
export async function getCertificados(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<CertificadoCliente[]>> {
  const { data, error } = await supabase
    .from('certificado_cliente')
    .select('id, cliente_id, obra_id, numero, factura, periodo_desde, periodo_hasta, avance_periodo,'
      + ' monto, reparo, emitido_at, vence, estado, observacion, cobranza_fila, detalle_rubros')
    .eq('cliente_id', clienteId)
    .order('emitido_at', { ascending: false, nullsFirst: false })
    .order('numero', { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as CertificadoCliente[], error: null }
}

/**
 * EL ESTADO DE LA COLA que vuelve a la pantalla.
 *
 * Sin esto, «Registrar cobro» le diría a la persona que su cobro quedó guardado y no habría forma de
 * saber si el worker lo escribió en el Sheet, lo difirió por el freno de mano o lo RECHAZÓ porque la
 * fila se corrió de lugar. El pedido y su efecto son dos hechos distintos y la pantalla muestra los
 * dos: `estado` dice en qué anda y `leido_de_vuelta` es lo que la celda dice ahora.
 */
export async function getCambiosPendientes(
  supabase: SupabaseClient,
  filas: number[],
): Promise<ServiceResult<CambioCobranza[]>> {
  if (!filas.length) return { data: [], error: null }
  const { data, error } = await supabase
    .from('cobranza_cambio')
    .select('id, esquema_pago_id, cobranza_fila, campo, valor_nuevo, valor_anterior, estado, motivo,'
      + ' pedido_at, aplicado_at, leido_de_vuelta')
    .in('cobranza_fila', filas)
    .order('pedido_at', { ascending: false })

  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as CambioCobranza[], error: null }
}

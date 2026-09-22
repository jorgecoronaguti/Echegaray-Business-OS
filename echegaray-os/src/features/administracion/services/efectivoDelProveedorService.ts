// D08 · LA LECTURA: qué compras de este proveedor se pagaron con efectivo a rendir.
//
// Una sola consulta a `proveedor_efectivo_rendido` (20260922T3100), que ya cruza la fila de Compras
// con la entrega y con quién la tenía en la mano. La cuenta —cuánto, qué porcentaje, qué manos— la
// hace `efectivoDelProveedor.ts`, que es puro y está probado.
//
// ═══ QUIÉN LLAMA A ESTO ═══
//
// La ficha, SÓLO si quien mira ve economía. La vista hereda la policy de `efectivo_rendicion`
// (`ve_economia()` desde la 20260922T2700): al jefe de obra la base le devuelve cero filas sin error,
// y «$ 0 pagado en efectivo» sobre un proveedor al que se le pagaron millones es una mentira más cara
// que un hueco. Por eso la puerta se decide ANTES de consultar, con el rol, y no se dibuja nada.
//
// ═══ ERROR ≠ VACÍO ═══
//
// `null` es «no se pudo leer» y la pantalla no dibuja el bloque; `[]` es «no se le pagó nada en
// efectivo», que también hace que el bloque no se dibuje pero por otro motivo. Ninguno de los dos se
// convierte en un cero.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EfectivoRendidoDelProveedor } from './efectivoDelProveedor.ts'

const COLUMNAS = 'clave,fecha,comprobante,concepto,monto_rendido,entrega,obra,rindio'

export async function getEfectivoRendidoDelProveedor(
  supabase: SupabaseClient, proveedorId: string,
): Promise<EfectivoRendidoDelProveedor[] | null> {
  const { data, error } = await supabase
    .from('proveedor_efectivo_rendido')
    .select(COLUMNAS)
    .eq('proveedor_id', proveedorId)
    .order('fecha', { ascending: false })
  if (error) return null
  return (data ?? []) as EfectivoRendidoDelProveedor[]
}

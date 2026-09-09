import type { SupabaseClient } from '@supabase/supabase-js'

// LAS ÓRDENES DEL CLIENTE, PARA LA PANTALLA — cuántas OC y cuántas OP cuelgan de cada obra.
//
// La tabla la escribe `orquestador/scripts/gmail-ordenes-clientes.mjs` bajando los adjuntos de la
// casilla del dueño. Acá sólo se CUENTAN, y se cuentan con la sesión de quien mira: la RLS de
// `cliente_orden` ya recorta —Dirección y Administración ven la cartera entera, el jefe de obra
// sólo su obra— así que esta función no vuelve a filtrar por rol. Filtrar dos veces esconde el día
// que una de las dos reglas cambie y dejen de coincidir.

export type ConteoOrdenes = { compra: number; pago: number }

/** Clave para lo que no se pudo atribuir a una obra: cuelga del CLIENTE. */
export const SIN_OBRA = 'sin-obra'

export type OrdenesDeLaCartera = {
  /** obra_id → conteo. */
  porObra: Map<string, ConteoOrdenes>
  /** cliente_id → conteo de lo que quedó SIN obra. No es el total del cliente: es el resto. */
  sinObraPorCliente: Map<string, ConteoOrdenes>
  /** `true` = la lectura falló. Sin esto, un error de permisos se dibuja idéntico a «no hay ninguna». */
  fallo: boolean
}

const vacio = (): ConteoOrdenes => ({ compra: 0, pago: 0 })

function sumar(mapa: Map<string, ConteoOrdenes>, clave: string, tipo: string): void {
  const c = mapa.get(clave) ?? vacio()
  if (tipo === 'orden_compra') c.compra += 1
  else if (tipo === 'orden_pago') c.pago += 1
  mapa.set(clave, c)
}

/** Una sola consulta para toda la cartera: la pantalla dibuja decenas de obras y una consulta por
 *  obra sería una cascada. Sólo las vigentes: la baja es lógica y una orden dada de baja no cuenta. */
export async function getOrdenesDeLaCartera(supabase: SupabaseClient): Promise<OrdenesDeLaCartera> {
  const { data, error } = await supabase
    .from('cliente_orden')
    .select('cliente_id, obra_id, tipo')
    .is('eliminado_en', null)

  const porObra = new Map<string, ConteoOrdenes>()
  const sinObraPorCliente = new Map<string, ConteoOrdenes>()
  if (error || !data) return { porObra, sinObraPorCliente, fallo: Boolean(error) }

  for (const fila of data as { cliente_id: string; obra_id: string | null; tipo: string }[]) {
    if (fila.obra_id) sumar(porObra, fila.obra_id, fila.tipo)
    else sumar(sinObraPorCliente, fila.cliente_id, fila.tipo)
  }
  return { porObra, sinObraPorCliente, fallo: false }
}

/** El rótulo del chip: «OC ·3». Devuelve null cuando el conteo es cero — un chip que dice 0 ocupa
 *  el mismo lugar que uno que informa algo y no informa nada. */
export function rotuloChip(prefijo: 'OC' | 'OP', n: number): string | null {
  return n > 0 ? `${prefijo} ·${n}` : null
}

// ── EL DETALLE, PARA EL PANEL ───────────────────────────────────────────────────────────────────
//
// Los conteos de arriba dicen CUÁNTAS hay; esto dice cuáles son. Se lee sólo cuando alguien abre el
// panel de una obra —no para las decenas de filas de la tabla— y otra vez con la sesión de quien
// mira: la RLS de `cliente_orden` es la cerradura, acá no se vuelve a filtrar por rol.

export interface OrdenDetallada {
  id: string
  tipo: string
  numero: string | null
  fecha: string | null
  importe: number | null
  moneda: string | null
  nombre_archivo: string
  emisor: string | null
  /** `remitente` lo prueba el dominio del mail; `texto` lo dedujo el OS. HECHO vs INFERENCIA. */
  atribucion: string
}

/**
 * LAS ÓRDENES DE UNA OBRA, o las que quedaron a nivel CLIENTE sin obra atribuida.
 *
 * `obraId === SIN_OBRA` NO es un obra_id inventado: es la clave con la que la tabla nombra el resto
 * del cliente, y acá se traduce a `obra_id is null`. Sin esa rama, las nueve órdenes de Messina que
 * el OS no pudo atribuir no tendrían panel donde abrirse.
 */
export async function getOrdenesDe(
  supabase: SupabaseClient,
  { clienteId, obraId }: { clienteId: string; obraId: string | null },
): Promise<OrdenDetallada[] | null> {
  let q = supabase
    .from('cliente_orden')
    .select('id, tipo, numero, fecha, importe, moneda, nombre_archivo, emisor, atribucion')
    .eq('cliente_id', clienteId)
    .is('eliminado_en', null)
  q = obraId === null ? q.is('obra_id', null) : q.eq('obra_id', obraId)
  // Las más nuevas primero, y las sin fecha al final: una orden sin fecha no es la más vieja, es
  // una que el PDF no fechó.
  const { data, error } = await q.order('fecha', { ascending: false, nullsFirst: false })
  if (error) return null
  return (data ?? []) as OrdenDetallada[]
}

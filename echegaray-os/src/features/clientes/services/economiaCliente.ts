// LA ECONOMÍA DEL CLIENTE, LEÍDA DE UNA SOLA FUENTE: `public.cliente_economia`.
//
// ═══ POR QUÉ EXISTE ESTE ARCHIVO (PRP-REALIDAD-UNICA, hito H1 · 10/09/2026) ═══
//
// «Lo contratado de un cliente» se calculaba en CINCO lugares y de cuatro maneras: la lista, la
// ficha, el panel lateral, el esquema de pago y el portal. Cada uno se arregló por separado al menos
// una vez y el siguiente volvía a nacer torcido — el panel lateral todavía sumaba
// `obra_panel.monto_contratado` (el campo del formulario que nadie carga) y decía $31,8 M de Messina
// mientras la tabla de al lado decía $156,1 M.
//
// Ahora la suma la hace la base, una vez, en `public.contratado_de_cliente()`, y esta capa sólo la
// lee. El contratado por OBRA sigue en `obra_economia_cartera` (`economiaObras.ts`): son dos
// preguntas distintas con la MISMA fuente debajo, no dos definiciones.
//
// ═══ LAS VENTANAS VAN EN EL NOMBRE ═══
//
// `facturado_90d` y `cobrado_90d` son de VENTANA y provisorias (decisión D2 del PRP, abierta);
// `cobrado_total` y `cobrado_neto_total` son acumulados. Ninguna se llama `facturado` ni `cobrado` a
// secas a propósito: dos caras sumando lo mismo con ventanas distintas es el conflicto #2 del
// inventario, y un nombre sin ventana es cómo se cuela.

import type { SupabaseClient } from '@supabase/supabase-js'
import { aNumero } from './economiaObras.ts'

export interface EconomiaDeCliente {
  cliente_id: string
  /** Σ de lo contratado de TODAS sus obras no fusionadas. `null` = ninguna tiene precio en OBRAS. */
  contratado: number | null
  /** Σ de lo contratado de sus obras `activa`. Es el número que cierra contra las filas de obra
   *  que la lista dibuja debajo del cliente. */
  contratado_en_curso: number | null
  n_obras_en_curso: number
  n_obras_cerradas: number
  n_obras_con_precio: number
  n_obras_sin_precio: number
  /** Σ de `obra_panel.costo_real`. Vivía en `cliente_panel.costo_real`, que se retiró. */
  costo_real: number | null
  /** VENTANA de 90 días. Provisorio hasta D2. */
  facturado_90d: number | null
  /** VENTANA de 90 días. Provisorio hasta D2. */
  cobrado_90d: number | null
  /** Acumulado, BRUTO: lo que entró al banco. */
  cobrado_total: number | null
  /** Acumulado, SIN IVA: el único comparable contra lo contratado, que tampoco lo lleva. */
  cobrado_neto_total: number | null
  saldo: number | null
  vencido: number | null
  por_vencer: number | null
  /** `contratado − cobrado_neto_total`. `null` si falta cualquiera de los dos. */
  pendiente_contractual: number | null
}

const COLUMNAS =
  'cliente_id, contratado, contratado_en_curso, n_obras_en_curso, n_obras_cerradas,'
  + ' n_obras_con_precio, n_obras_sin_precio, costo_real, facturado_90d, cobrado_90d,'
  + ' cobrado_total, cobrado_neto_total, saldo, vencido, por_vencer, pendiente_contractual'

/** PostgREST devuelve los `numeric` como texto y los `int` como número. Los conteos son 0 de
 *  verdad cuando la vista los publica; nunca se inventan. */
/** UNA fila de `cliente_economia` → el tipo de la pantalla. Exportada porque la ficha la recibe
 *  por la RPC `pantalla_cliente()` y no puede tener su propia conversión: lo contratado del cliente
 *  tuvo cinco definiciones en tres semanas. */
export function armarEconomiaDeCliente(f: Record<string, unknown>): EconomiaDeCliente {
  const n = (k: string) => aNumero(f[k])
  const entero = (k: string) => Number(f[k] ?? 0)
  return {
    cliente_id: String(f.cliente_id),
    contratado: n('contratado'),
    contratado_en_curso: n('contratado_en_curso'),
    n_obras_en_curso: entero('n_obras_en_curso'),
    n_obras_cerradas: entero('n_obras_cerradas'),
    n_obras_con_precio: entero('n_obras_con_precio'),
    n_obras_sin_precio: entero('n_obras_sin_precio'),
    costo_real: n('costo_real'),
    facturado_90d: n('facturado_90d'),
    cobrado_90d: n('cobrado_90d'),
    cobrado_total: n('cobrado_total'),
    cobrado_neto_total: n('cobrado_neto_total'),
    saldo: n('saldo'),
    vencido: n('vencido'),
    por_vencer: n('por_vencer'),
    pendiente_contractual: n('pendiente_contractual'),
  }
}

/**
 * TODA LA CARTERA EN UNA CONSULTA. Un fallo devuelve `null` —no un mapa vacío—: «no pude leer» y
 * «este cliente no tiene nada contratado» son dos cosas distintas y la pantalla las dice distinto.
 *
 * LA VISTA LLEVA `WHERE ve_economia()`: al jefe de obra le devuelve CERO FILAS, no un error. Un mapa
 * vacío por eso NO significa «nadie contrató nada», y las pantallas además no le ofrecen la columna.
 */
export async function getEconomiaDeClientes(
  supabase: SupabaseClient,
): Promise<Map<string, EconomiaDeCliente> | null> {
  const { data, error } = await supabase.from('cliente_economia').select(COLUMNAS)
  if (error) return null
  return armarEconomiaDeClientes(data ?? [])
}

/** Las filas de `cliente_economia` ya leídas → el mapa por cliente. Separada de la consulta porque
 *  las mismas filas llegan por dos transportes: PostgREST y la RPC de la pantalla. Lo contratado
 *  del cliente tuvo CINCO definiciones en tres semanas; no va a tener dos conversiones. */
export function armarEconomiaDeClientes(filas: unknown[]): Map<string, EconomiaDeCliente> {
  const m = new Map<string, EconomiaDeCliente>()
  for (const f of filas as Record<string, unknown>[]) {
    const e = armarEconomiaDeCliente(f)
    m.set(e.cliente_id, e)
  }
  return m
}

/** La de UN cliente. `null` = no se pudo leer, o el rol no ve economía, o el cliente no existe. */
export async function getEconomiaDeCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<EconomiaDeCliente | null> {
  const { data, error } = await supabase
    .from('cliente_economia').select(COLUMNAS).eq('cliente_id', clienteId).maybeSingle()
  if (error || !data) return null
  return armarEconomiaDeCliente(data as unknown as Record<string, unknown>)
}

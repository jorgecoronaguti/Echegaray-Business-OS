// La lectura que alimenta los chips de uso: las compras de los últimos 12 meses, UNA vez por página.
//
// Se pagina de a 1000 porque PostgREST corta ahí sin avisar: una lectura que se cortara en silencio
// dibujaría un «más usados» armado con la mitad de los comprobantes. Si no se llegó al final antes
// del tope, se devuelve error y los chips de uso se callan en vez de afirmar.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import type { CompraLeve } from './usoProveedores'

const PAGINA = 1000
const TOPE_PAGINAS = 10

export async function getComprasRecientes(
  supabase: SupabaseClient, desde: string,
): Promise<ServiceResult<CompraLeve[]>> {
  const filas: CompraLeve[] = []
  for (let i = 0; i < TOPE_PAGINAS; i += 1) {
    const { data, error } = await supabase
      .from('costos_obra')
      .select('proveedor, fecha, total')
      .gte('fecha', desde)
      .order('id')
      .range(i * PAGINA, i * PAGINA + PAGINA - 1)
    if (error) return { data: null, error: error.message }
    filas.push(...((data ?? []) as CompraLeve[]))
    if ((data ?? []).length < PAGINA) return { data: filas, error: null }
  }
  return { data: null, error: 'Hay más compras de las que esta pantalla puede leer de una vez.' }
}

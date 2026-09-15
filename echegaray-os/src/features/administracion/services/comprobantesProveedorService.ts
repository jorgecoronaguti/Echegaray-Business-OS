// LAS COMPRAS DE UN PROVEEDOR CON SU PAPEL — la lectura de la solapa «Comprobantes».
//
// ═══ DOS LECTURAS, Y LA SEGUNDA ES LA DE COMPRAS ═══
//
// `proveedor_compra` dice QUÉ compras son de este proveedor (CUIT, o nombre resuelto si la compra no
// trae CUIT). El papel se lee de `compra_adjunto` con las mismas columnas y la misma consulta que
// `getComprasSheet`, y se cuelga con `papelesDeCadaFila`: la regla «qué papel es de qué compra» vive
// en un solo lugar, así que lo que la ficha muestra y lo que muestra Compras no pueden discrepar.
//
// Se trae la tabla de papeles entera y no un `in.(claves)`: son ~250 filas, y Corralón Progreso
// tiene 225 compras en 2026 — 225 claves en la query string rozan el límite de URL del gateway, y
// una lista cortada ahí devolvería compras «sin comprobante» que sí lo tienen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { papelesDeCadaFila } from './comprasSheet.ts'
import { COLUMNAS_ADJUNTO, type Adjunto, type ServiceResult } from './comprasSheetService.ts'
import { nombresDeObra } from '../../clientes/services/nombresDeObra.ts'

/** Techo de compras de una ficha. Si se alcanza, la pantalla lo dice. */
export const TOPE_COMPRAS_PROVEEDOR = 2000

export interface CompraDelProveedor {
  proveedor_id: string
  /** `cuit` = HECHO; `nombre` = la compra no trae CUIT y la resolvió el nombre. */
  via: 'cuit' | 'nombre'
  fila: number
  clave: string | null
  fecha: string | null
  tipo: string | null
  comprobante: string | null
  concepto: string | null
  /** Lo que dice el PAPEL: la columna Cliente/Asignación de la pestaña Compras, texto libre. */
  obra_texto: string | null
  total: number | null
  estado: string | null
  estado_pago: string | null
  saldo_pendiente: number | null
  anulada: boolean
}

export interface CompraConPapel extends CompraDelProveedor {
  adjuntos: Adjunto[]
  tiene_adjunto: boolean
  /** A qué obra llegó de verdad, rotulada «OB-0008 · QP - SALÓN COMERCIAL» desde `obra_canonica`.
   *  `null` = la asignación no resolvió ninguna obra, o no se pudo leer: nunca se rellena con el
   *  texto del papel, que es precisamente lo que no identifica nada. */
  obra_rotulo: string | null
}

export interface ComprasConPapel {
  filas: CompraConPapel[]
  truncado: boolean
  /** `true` si la tabla de papeles no se pudo leer: «sin comprobante» deja de ser afirmable. */
  papelesSinLeer: boolean
}

const COLUMNAS = [
  'proveedor_id', 'via', 'fila', 'clave', 'fecha', 'tipo', 'comprobante', 'concepto', 'obra_texto',
  'total', 'estado', 'estado_pago', 'saldo_pendiente', 'anulada',
].join(', ')

export async function getComprasConPapel(
  supabase: SupabaseClient, proveedorId: string,
): Promise<ServiceResult<ComprasConPapel>> {
  // EL ID VIENE DE LA URL. Un valor que no es uuid volvería de Postgres como error de sintaxis y la
  // solapa diría «no pude leer» donde no hay nada que leer.
  if (!z.string().uuid().safeParse(proveedorId).success) {
    return { data: null, error: 'Ese proveedor no existe.' }
  }
  const [compras, adjuntos] = await Promise.all([
    supabase.from('proveedor_compra').select(COLUMNAS).eq('proveedor_id', proveedorId)
      .order('fecha', { ascending: false, nullsFirst: false })
      .order('fila', { ascending: false })
      .limit(TOPE_COMPRAS_PROVEEDOR + 1),
    supabase.from('compra_adjunto').select(COLUMNAS_ADJUNTO),
  ])
  if (compras.error) return { data: null, error: compras.error.message }
  const leidas = (compras.data ?? []) as unknown as CompraDelProveedor[]
  const truncado = leidas.length > TOPE_COMPRAS_PROVEEDOR
  const papeles = (adjuntos.data ?? []) as unknown as Adjunto[]
  const visibles = truncado ? leidas.slice(0, TOPE_COMPRAS_PROVEEDOR) : leidas
  const conPapel = papelesDeCadaFila(visibles, papeles)
  const rotulos = await rotulosDeObraDeLasFilas(supabase, visibles.map((c) => c.fila))
  return {
    data: {
      filas: conPapel.map((c) => ({ ...c, obra_rotulo: rotulos.get(c.fila) ?? null })),
      truncado,
      papelesSinLeer: Boolean(adjuntos.error),
    },
    error: null,
  }
}

/**
 * `fila` → «OB-0008 · QP - SALÓN COMERCIAL»: A QUÉ OBRA LLEGÓ CADA COMPRA, LEÍDO DE LA BASE.
 *
 * ═══ POR QUÉ NO ALCANZA CON `obra_texto` ═══
 *
 * La columna del Sheet dice «Quattropani», «QUATTROPANI SALON» o «Mamposteria» — texto que escribe
 * una persona y que dos clientes distintos pueden repetir. Quién decide a qué obra llega el gasto es
 * `compra_obra_asignada`, que escribe `sync-compras.mjs` con la regla de
 * `orquestador/lib/compras-obra-asignada.mjs` en la MISMA transacción que `compra_sheet`. Es la
 * misma fuente que ya usa la pantalla de Compras: la ficha del proveedor no puede decir otra cosa
 * sobre la misma fila.
 *
 * SE UNE POR `fila`, que es la PK de `compra_sheet` y se reescribe entera en esa transacción (un
 * `delete` + `insert`), así que no hay fósiles de un sync anterior apuntando a una fila que hoy es
 * otra compra.
 *
 * Un error de lectura devuelve un Map VACÍO y la fila muestra sólo lo que dice el papel: una obra
 * inventada por un fallback sería peor que no decir nada.
 */
async function rotulosDeObraDeLasFilas(
  supabase: SupabaseClient, filas: number[],
): Promise<Map<number, string>> {
  if (!filas.length) return new Map()
  const { data, error } = await supabase
    .from('compra_obra_asignada').select('fila, obra_id').in('fila', filas)
  if (error || !data) return new Map()
  const asignadas = data as unknown as { fila: number; obra_id: string | null }[]
  const conObra = asignadas.filter((a) => a.obra_id)
  const nombres = await nombresDeObra(supabase, conObra.map((a) => a.obra_id))
  return new Map(
    conObra.flatMap((a) => {
      const rotulo = nombres.get(a.obra_id as string)
      return rotulo ? [[a.fila, rotulo] as [number, string]] : []
    }),
  )
}

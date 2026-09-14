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
  return {
    data: {
      filas: papelesDeCadaFila(truncado ? leidas.slice(0, TOPE_COMPRAS_PROVEEDOR) : leidas, papeles),
      truncado,
      papelesSinLeer: Boolean(adjuntos.error),
    },
    error: null,
  }
}

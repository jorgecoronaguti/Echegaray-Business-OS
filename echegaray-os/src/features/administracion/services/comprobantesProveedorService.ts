// LAS COMPRAS DE UN PROVEEDOR CON SU PAPEL Y SU OBRA — la lectura de la cara «Compras» de la ficha.
//
// ═══ TRES LECTURAS, Y LAS TRES SON LAS DE COMPRAS ═══
//
// `proveedor_compra` dice QUÉ compras son de este proveedor (CUIT, o nombre resuelto si la compra no
// trae CUIT). El papel se lee de `compra_adjunto` con las mismas columnas y la misma consulta que
// `getComprasSheet`, y se cuelga con `papelesDeCadaFila`. La obra sale de `obrasDeLasCompras`, la
// MISMA función que rotula la fila en la pantalla de Compras: la celda «Obra» de la fila (lo que una
// persona eligió) manda; si está vacía, la inferencia del sync (`compra_obra_asignada`); y nunca el
// texto libre de la J. La regla «qué papel es de qué compra» y la regla «qué obra es de qué compra»
// viven en un solo lugar cada una, así que la ficha y Compras no pueden discrepar sobre la misma fila.
//
// Se trae la tabla de papeles entera y no un `in.(claves)`: son ~250 filas, y Corralón Progreso
// tiene 225 compras en 2026 — 225 claves en la query string rozan el límite de URL del gateway, y
// una lista cortada ahí devolvería compras «sin comprobante» que sí lo tienen. Lo mismo vale para
// la asignación.
//
// ═══ LA COLUMNA OBRA SE LEE APARTE, Y ES A PROPÓSITO ═══
//
// `destino`, `obra_id`, `obra_celda`, `obra_inconsistencia` y `sheet_id` llegan a `proveedor_compra`
// con la migración 20260915T2300, que se aplica a mano y no viaja con el deploy. Si entraran en el
// `select` principal, un deploy anterior a la migración vaciaría la ficha entera. Leídas aparte, lo
// peor que pasa es `obraEditable: false`: la obra inferida se sigue viendo y no se puede elegir.
// Mismo patrón que `getCeldasObra` en Compras.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { papelesDeCadaFila } from './comprasSheet.ts'
import { COLUMNAS_ADJUNTO, type Adjunto, type ServiceResult } from './comprasSheetService.ts'
import { obrasDeLasCompras, type CeldasObra } from './obraDeCompraService.ts'
import type { AsignacionDeCompra, CeldaObraDeCompra, ObraDeCompra } from './obraDeCompra.ts'

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
  /** La obra tal como la ve Compras: rótulo, origen (columna / inferida / sin obra / ninguna), la
   *  celda para el `esperado` del control y la inconsistencia. Es lo que `<ObraEnLinea>` necesita. */
  obra: ObraDeCompra
  /** `obra.rotulo`, a mano para el reparto por obra y el `title`. `null` = no hay obra que nombrar:
   *  nunca se rellena con el texto del papel, que es precisamente lo que no identifica nada. */
  obra_rotulo: string | null
}

export interface ComprasConPapel {
  filas: CompraConPapel[]
  truncado: boolean
  /** `true` si la tabla de papeles no se pudo leer: «sin comprobante» deja de ser afirmable. */
  papelesSinLeer: boolean
  /** `false` = la columna Obra no se pudo leer (migración sin aplicar): se muestra, no se edita. */
  obraEditable: boolean
}

const COLUMNAS = [
  'proveedor_id', 'via', 'fila', 'clave', 'fecha', 'tipo', 'comprobante', 'concepto', 'obra_texto',
  'total', 'estado', 'estado_pago', 'saldo_pendiente', 'anulada',
].join(', ')

const COLUMNAS_OBRA = 'fila, clave, sheet_id, destino, obra_id, obra_celda, obra_inconsistencia'

export async function getComprasConPapel(
  supabase: SupabaseClient, proveedorId: string,
): Promise<ServiceResult<ComprasConPapel>> {
  // EL ID VIENE DE LA URL. Un valor que no es uuid volvería de Postgres como error de sintaxis y la
  // solapa diría «no pude leer» donde no hay nada que leer.
  if (!z.string().uuid().safeParse(proveedorId).success) {
    return { data: null, error: 'Ese proveedor no existe.' }
  }
  const [compras, adjuntos, celdas, asignaciones] = await Promise.all([
    supabase.from('proveedor_compra').select(COLUMNAS).eq('proveedor_id', proveedorId)
      .order('fecha', { ascending: false, nullsFirst: false })
      .order('fila', { ascending: false })
      .limit(TOPE_COMPRAS_PROVEEDOR + 1),
    supabase.from('compra_adjunto').select(COLUMNAS_ADJUNTO),
    celdasDelProveedor(supabase, proveedorId),
    asignacionesDeCompras(supabase),
  ])
  if (compras.error) return { data: null, error: compras.error.message }
  const leidas = (compras.data ?? []) as unknown as CompraDelProveedor[]
  const truncado = leidas.length > TOPE_COMPRAS_PROVEEDOR
  const papeles = (adjuntos.data ?? []) as unknown as Adjunto[]
  const visibles = truncado ? leidas.slice(0, TOPE_COMPRAS_PROVEEDOR) : leidas
  const conPapel = papelesDeCadaFila(visibles, papeles)
  const obras = await obrasDeLasCompras(
    supabase,
    // Sin la columna Obra no se conoce `sheet_id`: la referencia cae a la fila, y la asignación se
    // indexa igual (ver `asignacionesDeCompras`), así la obra inferida se sigue viendo.
    visibles.map((c) => ({ fila: c.fila, sheet_id: celdas.sheetId.get(c.fila) ?? null })),
    celdas.celdas,
    celdas.celdas.disponible ? asignaciones.porReferencia : asignaciones.porFila,
  )
  return {
    data: {
      filas: conPapel.map((c) => {
        const obra = obras.get(c.fila) ?? { rotulo: null, origen: 'ninguna', celda: null, inconsistencia: null, porque: null }
        return { ...c, obra, obra_rotulo: obra.rotulo }
      }),
      truncado,
      papelesSinLeer: Boolean(adjuntos.error),
      obraEditable: celdas.celdas.disponible,
    },
    error: null,
  }
}

interface CeldasDelProveedor {
  celdas: CeldasObra
  /** `fila` → `sheet_id`, la otra mitad de la referencia con `compra_obra_asignada`. */
  sheetId: Map<number, number | null>
}

/** La columna Obra de las compras de ESTE proveedor. Error ⇒ `disponible: false`, nunca una obra inventada. */
async function celdasDelProveedor(supabase: SupabaseClient, proveedorId: string): Promise<CeldasDelProveedor> {
  const { data, error } = await supabase
    .from('proveedor_compra').select(COLUMNAS_OBRA).eq('proveedor_id', proveedorId)
    .limit(TOPE_COMPRAS_PROVEEDOR + 1)
  if (error || !data) return { celdas: { disponible: false, porFila: new Map() }, sheetId: new Map() }
  const filas = data as unknown as (CeldaObraDeCompra & { sheet_id: number | null })[]
  return {
    celdas: { disponible: true, porFila: new Map(filas.map((c) => [c.fila, c])) },
    sheetId: new Map(filas.map((c) => [c.fila, c.sheet_id])),
  }
}

interface Asignaciones {
  porReferencia: Map<string, AsignacionDeCompra>
  porFila: Map<string, AsignacionDeCompra>
}

/**
 * La inferencia del sync (`compra_obra_asignada`), indexada por referencia —lo que `obrasDeLasCompras`
 * espera— y también por fila, para cuando la columna Obra no se pudo leer y la referencia no se conoce.
 * Error ⇒ mapas vacíos: sin inferencia, nunca una inventada.
 */
async function asignacionesDeCompras(supabase: SupabaseClient): Promise<Asignaciones> {
  const { data, error } = await supabase
    .from('compra_obra_asignada').select('referencia, fila, obra_id, via, cliente, porque')
  if (error || !data) return { porReferencia: new Map(), porFila: new Map() }
  const filas = data as unknown as (AsignacionDeCompra & { fila: number })[]
  return {
    porReferencia: new Map(filas.map((a) => [a.referencia, a])),
    porFila: new Map(filas.map((a) => [String(a.fila), a])),
  }
}

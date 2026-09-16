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
//
// ═══ LA OBRA SE LEE COMO EN COMPRAS, CON LA MISMA FUNCIÓN (15/09/2026) ═══
//
// La ficha rotulaba la obra desde `compra_obra_asignada`, o sea desde lo que el sync INFIRIÓ de las
// columnas J y K, mientras la pantalla de Compras mostraba la celda «Obra» que alguien ELIGIÓ para
// esa misma fila: 40 de las 226 filas de Corralón Progreso decían obras distintas en dos pantallas
// del mismo sistema. Ahora las dos pasan por `obraDeLaCompra`, que ya sabe que la decisión le gana a
// la inferencia y que las distingue al dibujarlas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { papelesDeCadaFila } from './comprasSheet.ts'
import { COLUMNAS_ADJUNTO, type Adjunto, type ServiceResult } from './comprasSheetService.ts'
import { nombresDeObra } from '../../clientes/services/nombresDeObra.ts'
import {
  obraDeLaCompra, type AsignacionDeCompra, type CeldaObraDeCompra, type DestinoObra, type ObraDeCompra,
} from './obraDeCompra.ts'

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
  /** La celda «Obra» de la fila. AUSENTES —no null— cuando la vista todavía no las publica: el
   *  `select` de respaldo no las pide, y fingir un null diría «esta fila no tiene obra elegida». */
  destino?: DestinoObra | null
  obra_id?: string | null
  obra_celda?: string | null
  obra_inconsistencia?: string | null
}

export interface CompraConPapel extends CompraDelProveedor {
  adjuntos: Adjunto[]
  tiene_adjunto: boolean
  /** La MISMA lectura que hace Compras: qué obra, de dónde salió y qué dice la celda. Un `rotulo`
   *  null nunca se rellena con el texto del papel, que es precisamente lo que no identifica nada. */
  obra: ObraDeCompra
}

export interface ComprasConPapel {
  filas: CompraConPapel[]
  truncado: boolean
  /** `true` si la tabla de papeles no se pudo leer: «sin comprobante» deja de ser afirmable. */
  papelesSinLeer: boolean
  /** `false` = la vista todavía no publica la columna «Obra»: se muestra, no se puede elegir. */
  obraEditable: boolean
}

export const COLUMNAS_BASE = [
  'proveedor_id', 'via', 'fila', 'clave', 'fecha', 'tipo', 'comprobante', 'concepto', 'obra_texto',
  'total', 'estado', 'estado_pago', 'saldo_pendiente', 'anulada',
]
/** Las de la migración 20260915T2300. Se piden aparte: un deploy puede llegar antes que ella. */
export const COLUMNAS_OBRA = ['destino', 'obra_id', 'obra_celda', 'obra_inconsistencia']

export async function getComprasConPapel(
  supabase: SupabaseClient, proveedorId: string,
): Promise<ServiceResult<ComprasConPapel>> {
  // EL ID VIENE DE LA URL. Un valor que no es uuid volvería de Postgres como error de sintaxis y la
  // solapa diría «no pude leer» donde no hay nada que leer.
  if (!z.string().uuid().safeParse(proveedorId).success) {
    return { data: null, error: 'Ese proveedor no existe.' }
  }
  const [compras, adjuntos] = await Promise.all([
    leerCompras(supabase, proveedorId),
    supabase.from('compra_adjunto').select(COLUMNAS_ADJUNTO),
  ])
  if (compras.error) return { data: null, error: compras.error }
  const leidas = compras.filas
  const truncado = leidas.length > TOPE_COMPRAS_PROVEEDOR
  const papeles = (adjuntos.data ?? []) as unknown as Adjunto[]
  const visibles = truncado ? leidas.slice(0, TOPE_COMPRAS_PROVEEDOR) : leidas
  const conPapel = papelesDeCadaFila(visibles, papeles)
  const obras = await obrasDeLasFilas(supabase, visibles)
  return {
    data: {
      filas: conPapel.map((c) => ({ ...c, obra: obras.get(c.fila) ?? SIN_OBRA })),
      truncado,
      papelesSinLeer: Boolean(adjuntos.error),
      obraEditable: compras.obraEditable,
    },
    error: null,
  }
}

/** Una fila cuya obra no se pudo leer. NO es «sin obra»: es que no se sabe, y se dibuja distinto. */
const SIN_OBRA: ObraDeCompra = { rotulo: null, origen: 'ninguna', celda: null, inconsistencia: null, porque: null }

/**
 * LAS COMPRAS, CON LA COLUMNA «Obra» SI LA VISTA YA LA PUBLICA.
 *
 * `proveedor_compra` gana `destino/obra_id/obra_celda/obra_inconsistencia` con la migración
 * 20260915T2300, que se aplica a mano y no viaja con el deploy. PostgREST no ignora una columna que
 * no existe: pedirlas en el único `select` haría que un deploy adelantado vaciara la solapa entera.
 * Por eso, si el primer intento falla, se vuelve a pedir lo de siempre y la obra queda en modo
 * lectura — mismo patrón que `getCeldasObra` en la pantalla de Compras.
 */
async function leerCompras(
  supabase: SupabaseClient, proveedorId: string,
): Promise<{ filas: CompraDelProveedor[]; obraEditable: boolean; error: string | null }> {
  const pedir = (columnas: string[]) =>
    supabase.from('proveedor_compra').select(columnas.join(', ')).eq('proveedor_id', proveedorId)
      .order('fecha', { ascending: false, nullsFirst: false })
      .order('fila', { ascending: false })
      .limit(TOPE_COMPRAS_PROVEEDOR + 1)

  const conObra = await pedir([...COLUMNAS_BASE, ...COLUMNAS_OBRA])
  if (!conObra.error) {
    return { filas: (conObra.data ?? []) as unknown as CompraDelProveedor[], obraEditable: true, error: null }
  }
  const base = await pedir(COLUMNAS_BASE)
  if (base.error) return { filas: [], obraEditable: false, error: base.error.message }
  return { filas: (base.data ?? []) as unknown as CompraDelProveedor[], obraEditable: false, error: null }
}

/**
 * `fila` → la obra que la app muestra, POR LA MISMA REGLA QUE COMPRAS.
 *
 * ═══ POR QUÉ NO ALCANZA CON `obra_texto` ═══
 *
 * La columna del Sheet dice «Quattropani», «QUATTROPANI SALON» o «Mamposteria» — texto que escribe
 * una persona y que dos clientes distintos pueden repetir. Quién decide a qué obra llega el gasto
 * son, en este orden, la celda «Obra» de la fila (lo que alguien ELIGIÓ) y `compra_obra_asignada`
 * (lo que el sync INFIRIÓ de J y K). `obraDeLaCompra` es la función que ya sabe ese orden y la usa
 * también la pantalla de Compras: la ficha del proveedor no puede decir otra cosa sobre la misma
 * fila.
 *
 * SE UNE POR `fila`, que es la PK de `compra_sheet` y se reescribe entera en la transacción del sync
 * (un `delete` + `insert`), así que no hay fósiles apuntando a una fila que hoy es otra compra.
 *
 * Un error de lectura devuelve un Map VACÍO y la fila muestra sólo lo que dice el papel: una obra
 * inventada por un fallback sería peor que no decir nada.
 */
async function obrasDeLasFilas(
  supabase: SupabaseClient, filas: CompraDelProveedor[],
): Promise<Map<number, ObraDeCompra>> {
  if (!filas.length) return new Map()
  const { data, error } = await supabase
    .from('compra_obra_asignada').select('fila, referencia, obra_id, via, cliente, porque')
    .in('fila', filas.map((c) => c.fila))
  const asignadas = error || !data ? [] : (data as unknown as (AsignacionDeCompra & { fila: number })[])
  const porFila = new Map(asignadas.map((a) => [a.fila, a]))
  const rotulos = await nombresDeObra(
    supabase, [...filas.map((c) => c.obra_id ?? null), ...asignadas.map((a) => a.obra_id)],
  )
  return new Map(filas.map((c) => {
    const celda: CeldaObraDeCompra = {
      fila: c.fila, clave: c.clave, destino: c.destino ?? null, obra_id: c.obra_id ?? null,
      obra_celda: c.obra_celda ?? null, obra_inconsistencia: c.obra_inconsistencia ?? null,
    }
    return [c.fila, obraDeLaCompra(celda, porFila.get(c.fila), rotulos)]
  }))
}

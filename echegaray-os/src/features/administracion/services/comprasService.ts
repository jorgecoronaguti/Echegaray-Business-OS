// LO QUE LA PANTALLA 24 · COMPRAS LE PREGUNTA A LA BASE.
//
// Una sola fuente: la vista `comprobante_compra` (migración 20260821T5500). No lee
// `comprobantes_arca` directo a propósito — ahí «una compra» es `tipo_libro='R'`, un dato que ya
// estaba escrito como constante en `costosObraService.ts` y que cada pantalla nueva tendría que
// volver a saber. La vista también trae el papel ya traducido y si tiene un parecido: la web no
// tiene tabla de códigos de ARCA ni segunda definición de «duplicado».
//
// LOS CUATRO KPI SON CONTEOS DE LA BASE, no de la página. Contarlos sobre las filas traídas diría
// «400 capturadas» para siempre, y el número de arriba dejaría de ser el de la empresa.

import type { SupabaseClient } from '@supabase/supabase-js'
import { aplicarFiltro, FILTROS, type Filtrable, type FiltroCompras, type Imputacion } from './comprasEstado'

/**
 * UN CONTADOR DE POSTGREST, VISTO POR SU MÍNIMO.
 *
 * `select(..., { head: true })` devuelve un tipo genérico tan profundo que encadenarle el filtro
 * genérico hace explotar al compilador (TS2589). Acá se lo mira sólo por lo que este módulo usa:
 * los dos métodos que aplica el filtro y el resultado que se espera. No es aflojar el tipado —el
 * `Filtrable` sigue siendo el mismo contrato que prueba `comprasEstado.test.ts`—, es dejar de
 * arrastrar cuarenta capas de inferencia que no aportan nada.
 */
type Contador = Filtrable<Contador> & PromiseLike<{ count: number | null; error: { message: string } | null }>

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

const COLUMNAS = [
  'id', 'fecha_emision', 'tipo_comprobante', 'tipo_nombre', 'letra', 'signo',
  'punto_venta', 'numero', 'comprobante', 'cae', 'emisor_cuit', 'emisor_nombre', 'moneda',
  'imp_total', 'neto_gravado', 'neto_no_gravado', 'exento', 'total_iva', 'otros_tributos',
  'periodo', 'origen', 'created_at',
  'obra_texto', 'obra_asignada_por', 'obra_asignada_en',
  'estado_control', 'estado_control_por', 'estado_control_en', 'tiene_posible_duplicado',
  // El estado FINO y la obra canónica a la que llega el gasto (20260822T6220). `obra_texto` sigue
  // porque es lo que dice el papel; `obra_id` es a dónde llega de verdad, y no siempre coinciden.
  'obra_id', 'imputacion',
].join(', ')

/**
 * EL TECHO DE LA LISTA. Hoy el libro entero son 632 comprobantes, así que no recorta nada; existe
 * para el año que viene. Cuando recorte, la pantalla lo DICE: un control que no pudo mirar todo no
 * puede afirmar que no hay nada más — ya pasó, y produjo seis faltantes falsos.
 */
export const TOPE = 400

export interface ComprobanteCompra {
  id: string
  fecha_emision: string | null
  tipo_comprobante: string | null
  tipo_nombre: string | null
  letra: string | null
  signo: number | null
  punto_venta: string | null
  numero: string | null
  comprobante: string | null
  cae: string | null
  emisor_cuit: string | null
  emisor_nombre: string | null
  moneda: string | null
  imp_total: number | null
  neto_gravado: number | null
  neto_no_gravado: number | null
  exento: number | null
  total_iva: number | null
  otros_tributos: number | null
  periodo: string | null
  origen: string | null
  created_at: string | null
  obra_texto: string | null
  obra_asignada_por: string | null
  obra_asignada_en: string | null
  estado_control: string | null
  estado_control_por: string | null
  estado_control_en: string | null
  tiene_posible_duplicado: boolean | null
  /** La obra canónica a la que llega este gasto. `null` también cuando la imputación es Estructura. */
  obra_id: string | null
  imputacion: Imputacion | null
}

export interface Parecido {
  parecido_a_id: string
  parecido_tipo: string | null
  parecido_punto_venta: string | null
  parecido_numero: string | null
  parecido_fecha: string | null
  parecido_imp_total: number | null
  parecido_obra_texto: string | null
  dias_de_distancia: number | null
}

export interface ListadoCompras {
  filas: ComprobanteCompra[]
  /** Cuántas hay de verdad con este filtro y esta búsqueda. Puede ser mayor que `filas.length`. */
  total: number
  truncado: boolean
}

/** Los números de arriba, que además son el filtro. */
export type Conteos = Record<FiltroCompras, number>

export async function getCompras(
  supabase: SupabaseClient,
  { q, filtro }: { q?: string; filtro: FiltroCompras },
): Promise<ServiceResult<ListadoCompras>> {
  let consulta = supabase.from('comprobante_compra').select(COLUMNAS, { count: 'exact' })
  consulta = aplicarFiltro(consulta, filtro)

  const texto = q?.trim()
  if (texto) {
    // Las comas y los paréntesis son la sintaxis del `or` de PostgREST y el `*` es su comodín:
    // dejarlos pasar convierte lo que alguien tipeó en parte de la consulta. El `%` se saca por lo
    // mismo — un `%` a mano convierte el filtro en «traé todo».
    const seguro = texto.replace(/[,()*%]/g, ' ').trim()
    if (seguro) {
      // Se busca por lo que dice el papel que la persona tiene delante: proveedor, CUIT, número y la
      // obra a la que se imputó.
      consulta = consulta.or(
        `emisor_nombre.ilike.%${seguro}%,numero.ilike.%${seguro}%,` +
        `emisor_cuit.ilike.%${seguro}%,obra_texto.ilike.%${seguro}%`,
      )
    }
  }

  const { data, error, count } = await consulta
    // La fecha del papel manda; `created_at` desempata para que dos comprobantes del mismo día no
    // se turnen de posición entre recargas.
    .order('fecha_emision', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(TOPE)

  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as unknown as ComprobanteCompra[]
  const total = count ?? filas.length
  return { data: { filas, total, truncado: total > filas.length }, error: null }
}

/**
 * Los conteos, cada uno con el MISMO predicado que usa la lista (`aplicarFiltro`).
 *
 * `head: true` no trae filas: sólo el número. Seis consultas de conteo cuestan menos que traerse
 * el libro entero para contarlo en memoria, y sobre todo no dependen del tope de la lista.
 *
 * LA LISTA SALE DE `FILTROS` y no de una copia escrita acá: una segunda lista es la forma clásica de
 * agregar un KPI a la pantalla y que su número nunca se calcule.
 */
export async function getConteos(supabase: SupabaseClient): Promise<ServiceResult<Conteos>> {
  const filtros: FiltroCompras[] = FILTROS
  const respuestas = await Promise.all(
    filtros.map((f) =>
      aplicarFiltro(
        supabase.from('comprobante_compra').select('id', { count: 'exact', head: true }) as unknown as Contador,
        f,
      ),
    ),
  )
  const conteos = {} as Conteos
  for (let i = 0; i < filtros.length; i++) {
    const r = respuestas[i]
    // UN CONTEO QUE FALLÓ NO ES CERO. Se devuelve el error: un KPI en cero por un permiso negado se
    // lee como «no hay trabajo pendiente», que es la mentira más cara que puede decir esta pantalla.
    if (r.error) return { data: null, error: r.error.message }
    conteos[filtros[i]] = r.count ?? 0
  }
  return { data: conteos, error: null }
}

/** Los comprobantes a los que se parece éste. Vacío = la vista no le encontró ninguno. */
export async function getParecidos(supabase: SupabaseClient, id: string): Promise<Parecido[]> {
  const { data } = await supabase
    .from('comprobante_posible_duplicado')
    .select(
      'parecido_a_id, parecido_tipo, parecido_punto_venta, parecido_numero, parecido_fecha,' +
      ' parecido_imp_total, parecido_obra_texto, dias_de_distancia',
    )
    .eq('comprobante_id', id)
    .order('dias_de_distancia', { ascending: true })
  return (data ?? []) as unknown as Parecido[]
}

/**
 * A QUÉ OBRAS FUE ANTES ESTE PROVEEDOR — el historial que alimenta los atajos del panel.
 *
 * No es una sugerencia y no lleva umbral: son los rótulos que ya se usaron para el MISMO CUIT, que
 * es la única forma barata de acortar la decisión sin inventarle criterio. Se filtra por
 * `imputacion = 'obra'` —la clasificación que la base calcula con el diccionario de alias—, así que
 * Estructura y los rótulos sin alias no pueden entrar como atajo: ofrecerlos propagaría el error.
 *
 * Sin CUIT no hay historial. Cruzar por `emisor_nombre` traería «Acindar» y «ACINDAR S.A.» como dos
 * proveedores distintos, que es el duplicado por texto libre que el maestro existe para evitar.
 */
export async function getObrasDelEmisor(
  supabase: SupabaseClient,
  cuit: string | null,
): Promise<(string | null)[]> {
  const limpio = cuit?.trim()
  if (!limpio) return []
  const { data } = await supabase
    .from('comprobante_compra')
    .select('obra_texto')
    .eq('emisor_cuit', limpio)
    .eq('imputacion', 'obra')
    .order('fecha_emision', { ascending: false, nullsFirst: false })
    .limit(60)
  return ((data ?? []) as unknown as { obra_texto: string | null }[]).map((f) => f.obra_texto)
}

/** Un comprobante por su id, para el panel. `null` = no existe o la base no lo publica. */
export async function getCompra(supabase: SupabaseClient, id: string): Promise<ComprobanteCompra | null> {
  const { data } = await supabase.from('comprobante_compra').select(COLUMNAS).eq('id', id).maybeSingle()
  return (data as unknown as ComprobanteCompra) ?? null
}

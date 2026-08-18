// PENDIENTES DE IMPUTACIÓN — las cuatro fuentes leídas fila por fila.
//
// ═══ POR QUÉ SE LEEN LAS TABLAS Y NO LA VISTA `imputacion_pendiente` ═══
//
// Esa vista agrupa y cuenta: devuelve clave, filas y monto. Con eso Administración ve QUÉ falta pero
// no puede decidir NADA — no sabe de qué comprobante se trata, de qué fecha, ni de qué archivo salió.
// El encargo pide exactamente lo contrario: *"tipo · fecha · descripción · importe/recurso · origen"*.
// El detalle no está en la vista, así que se arma acá con las mismas cuatro tablas que la alimentan.
//
// La REGLA de qué está pendiente no se reescribe: vive en `orquestador/lib/imputacion-pendiente.mjs`
// junto con `normObra`, que es la réplica declarada de `public.norm_obra()`. Esta capa sólo trae
// filas y se las da. PostgREST no deja filtrar por el resultado de una función aplicada a una
// columna —es la misma razón por la que `operacionService` hace el último cruce del lado del
// cliente—, así que el filtrado por alias ocurre en memoria sobre ~1.100 filas.
//
// ═══ LA LECTURA ES PAGINADA A PROPÓSITO ═══
//
// PostgREST corta en 1.000 filas por respuesta y no avisa: devuelve 200 con menos filas. Compras
// tiene 845 hoy. El día que pase de 1.000, un `select` suelto empezaría a decir que todo está
// imputado porque el resto no llegó, y ese es justo el modo de falla que no se ve.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  agruparPendientes, historialDeRecurso, indexarAlias, resumirPorTipo, sugerirObra,
} from '../../../../orquestador/lib/imputacion-pendiente.mjs'
import type { ServiceResult } from '../types'

export type TipoFuente = 'compra' | 'pedido' | 'herramienta' | 'movimiento'

/** Una fila de cualquiera de las cuatro fuentes, ya traducida al vocabulario de la pantalla. */
export interface FilaImputable {
  tipo: TipoFuente
  id: string
  /** La tabla de Postgres de la que salió. Es la mitad de la trazabilidad del origen. */
  tabla: string
  /** El identificador dentro de esa fuente: el comprobante, el id del pedido, el de la herramienta. */
  referencia: string | null
  /** De qué sincronización entró: `compras_sheet`, `appsheet_sheet`, `os`. La otra mitad del origen. */
  fuente: string | null
  fecha: string | null
  descripcion: string
  /** En pesos. `null` cuando la fila mueve un recurso y no plata (herramientas, movimientos). */
  importe: number | null
  /** El proveedor en compras; la herramienta en las otras dos. Lo que la fila consume. */
  recurso: string | null
  texto: string
}

/** Una fila cruda de `obra_alias`: el diccionario que traduce el texto al eje canónico. */
export interface FilaAlias {
  alias: string
  obra_id: string | null
  clasificacion: string
  ejemplo_raw: string | null
}

export interface Sugerencia {
  obra_id: string
  evidencia: 'texto_identico' | 'recurso_unanime'
  preseleccionar: boolean
  motivo: string
}

export interface GrupoPendiente {
  clave: string
  textos: string[]
  filas: FilaImputable[]
  cantidad: number
  importe: number
  tipos: TipoFuente[]
  origenes: string[]
  sugerencia: Sugerencia | null
}

export interface ResumenFuente {
  tipo: TipoFuente
  total: number
  obra: number
  estructura: number
  pendiente: number
  sin_texto: number
}

export interface Pendientes {
  grupos: GrupoPendiente[]
  resumen: ResumenFuente[]
}

export const ETIQUETA_TIPO: Record<TipoFuente, string> = {
  compra: 'Compras',
  pedido: 'Pedidos',
  herramienta: 'Herramientas',
  movimiento: 'Movimientos',
}

const TABLA_DE: Record<TipoFuente, string> = {
  compra: 'costos_obra',
  pedido: 'pedidos_materiales',
  herramienta: 'herramientas',
  movimiento: 'movimientos_herramienta',
}

const PAGINA = 1000
/** Tope duro: 60.000 filas. Sin él, una respuesta que siempre devuelve página llena cicla para siempre. */
const MAX_PAGINAS = 60

async function traerTodo(
  supabase: SupabaseClient, tabla: string, columnas: string,
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * PAGINA
    const { data, error } = await supabase.from(tabla).select(columnas).range(desde, desde + PAGINA - 1)
    if (error) throw new Error(`${tabla}: ${error.message}`)
    const lote = (data ?? []) as unknown as Record<string, unknown>[]
    filas.push(...lote)
    if (lote.length < PAGINA) break
  }
  return filas
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))
const opcional = (v: unknown): string | null => {
  const s = texto(v).trim()
  return s === '' ? null : s
}

/** El primero de varios campos que tenga algo. Sirve para armar una descripción con lo que haya. */
const primero = (...valores: unknown[]): string => valores.map(opcional).find((v) => v !== null) ?? '—'

function deCompras(fila: Record<string, unknown>): FilaImputable {
  return {
    tipo: 'compra',
    id: texto(fila.id),
    tabla: TABLA_DE.compra,
    referencia: opcional(fila.comprobante) ?? opcional(fila.referencia_externa),
    fuente: opcional(fila.origen),
    fecha: opcional(fila.fecha),
    descripcion: primero(fila.concepto, fila.categoria, fila.tipo),
    importe: fila.total == null ? null : Number(fila.total),
    recurso: opcional(fila.proveedor),
    texto: texto(fila.obra_texto),
  }
}

function dePedidos(fila: Record<string, unknown>): FilaImputable {
  const cantidad = fila.cantidad == null ? '' : ` · ${Number(fila.cantidad)}`
  return {
    tipo: 'pedido',
    id: texto(fila.id),
    tabla: TABLA_DE.pedido,
    referencia: opcional(fila.id_pedido),
    fuente: opcional(fila.origen),
    fecha: opcional(fila.fecha),
    descripcion: `${primero(fila.material)}${cantidad}`,
    // Un pedido no tiene precio: mueve materiales. Poner 0 lo haría parecer gratis en el orden.
    importe: null,
    recurso: opcional(fila.material),
    texto: texto(fila.obra_texto),
  }
}

function deHerramientas(fila: Record<string, unknown>): FilaImputable {
  return {
    tipo: 'herramienta',
    id: texto(fila.id),
    tabla: TABLA_DE.herramienta,
    referencia: opcional(fila.id_herramienta),
    fuente: opcional(fila.origen),
    fecha: opcional(fila.fecha),
    descripcion: primero(fila.nombre),
    importe: null,
    recurso: opcional(fila.id_herramienta),
    texto: texto(fila.ubicacion_actual),
  }
}

function deMovimientos(fila: Record<string, unknown>): FilaImputable {
  return {
    tipo: 'movimiento',
    id: texto(fila.id),
    tabla: TABLA_DE.movimiento,
    referencia: opcional(fila.id_movimiento),
    fuente: opcional(fila.origen),
    fecha: opcional(fila.fecha),
    descripcion: `Herramienta ${primero(fila.id_herramienta)}${opcional(fila.responsable) ? ` · ${texto(fila.responsable)}` : ''}`,
    importe: null,
    recurso: opcional(fila.id_herramienta),
    texto: texto(fila.destino),
  }
}

/**
 * Todo lo pendiente, agrupado por el texto exacto y con su sugerencia — cuando hay evidencia.
 *
 * Se lee con la sesión de quien mira: `costos_obra`, `herramientas`, `movimientos_herramienta` y
 * `pedidos_materiales` filtran por `ve_obra_texto()`, que sólo devuelve todo a Administración. La
 * pantalla comprueba el rol igual, pero la base no depende de eso.
 */
export async function getPendientesDeImputacion(
  supabase: SupabaseClient,
): Promise<ServiceResult<Pendientes>> {
  try {
    const [compras, pedidos, herramientas, movimientos, alias] = await Promise.all([
      traerTodo(supabase, TABLA_DE.compra, 'id, obra_texto, proveedor, concepto, categoria, tipo, comprobante, referencia_externa, total, fecha, origen'),
      traerTodo(supabase, TABLA_DE.pedido, 'id, id_pedido, obra_texto, material, cantidad, fecha, origen'),
      traerTodo(supabase, TABLA_DE.herramienta, 'id, id_herramienta, nombre, ubicacion_actual, fecha, origen'),
      traerTodo(supabase, TABLA_DE.movimiento, 'id, id_movimiento, id_herramienta, destino, responsable, fecha, origen'),
      traerTodo(supabase, 'obra_alias', 'alias, obra_id, clasificacion, ejemplo_raw'),
    ])
    const aliasFilas = alias as unknown as FilaAlias[]

    const filas: FilaImputable[] = [
      ...compras.map(deCompras),
      ...pedidos.map(dePedidos),
      ...herramientas.map(deHerramientas),
      ...movimientos.map(deMovimientos),
    ]

    const indice = indexarAlias(aliasFilas)
    const historial = historialDeRecurso(filas, indice)
    const grupos = (agruparPendientes(filas, indice) as GrupoPendiente[]).map((g) => ({
      ...g,
      sugerencia: (sugerirObra(g, { aliasFilas, historial }) ?? null) as Sugerencia | null,
    }))

    const crudo = resumirPorTipo(filas, indice) as Record<string, Omit<ResumenFuente, 'tipo'>>
    const resumen = (Object.keys(ETIQUETA_TIPO) as TipoFuente[])
      .map((tipo) => ({ tipo, ...(crudo[tipo] ?? { total: 0, obra: 0, estructura: 0, pendiente: 0, sin_texto: 0 }) }))

    return { data: { grupos, resumen }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'No pude leer las fuentes' }
  }
}

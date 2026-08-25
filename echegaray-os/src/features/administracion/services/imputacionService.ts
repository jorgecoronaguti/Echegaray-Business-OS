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
// tiene 875 hoy. El día que pase de 1.000, un `select` suelto empezaría a decir que todo está
// imputado porque el resto no llegó, y ese es justo el modo de falla que no se ve.
//
// ═══ DE CUÁNTO TRAE CADA COLUMNA DEPENDE PARA QUÉ SE LA USA (25/08/2026) ═══
//
// La pantalla tardaba 1.022 ms de servidor (Navigation Timing en producción, `responseEnd −
// responseStart`) y descargaba 2 KB de JavaScript: el segundo entero era esperar a la base. De las
// cuatro fuentes, `costos_obra` traía ONCE columnas de sus 875 filas —262 KB— para que al final se
// dibujaran DOS textos pendientes. Las otras diez columnas sólo hacen falta para las filas que
// alguien va a mirar.
//
// Entonces la lectura se parte según para qué sirve cada dato, y NO según de qué tabla sale:
//
//   OLA 1 · lo que hace falta para CONTAR. `obra_texto` (y `proveedor`, que es lo que sostiene la
//           evidencia B del sugeridor) de las 875 compras: 50 KB en vez de 262. Las otras tres
//           fuentes suman 220 filas entre las tres y se traen enteras — partirlas costaría un viaje
//           más y ahorraría 40 KB.
//   OLA 2 · el DETALLE de las compras cuyo texto quedó pendiente, y de ninguna otra. Es un `in
//           (…)` por tabla, no uno por fila: si hubiera 300 textos pendientes seguirían siendo
//           tres viajes, no 300. Hoy no hay ninguna compra pendiente, así que esta ola tiene CERO
//           consultas y la página se resuelve en una sola.
//
// Lo que NO se hace es contar con `count: 'exact'` por fuente: los cinco números de cada fila del
// resumen (a una obra · estructura · pendientes · sin texto · total) salen de clasificar la MISMA
// lista que arma la cola. Cinco `head` con `count` por tabla serían veinte viajes que además
// podrían contradecir a la cola, y el estado de una fila no se puede pedir por filtro —depende de
// `norm_obra(texto)`, y PostgREST no filtra por el resultado de una función.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  agruparPendientes, estadoDeFila, historialDeRecurso, indexarAlias, resumirPorTipo, sugerirObra,
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

/** Una obra a la que se puede mandar el costo, con lo que hace falta para distinguirla de la de al
 *  lado: de quién es y cómo viene. `avance_pct` puede ser NULL — una obra sin actividades medidas
 *  no avanzó 0 %, no se sabe—, y la pantalla lo dice con todas las letras. */
export interface ObraElegible {
  obra_id: string
  nombre: string
  estado: string
  cliente_nombre: string | null
  avance_pct: number | null
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
/** Cuántos textos entran en un `in (…)`. La URL de PostgREST tiene largo máximo y un texto de obra
 *  puede medir 60 caracteres: partir en tandas mantiene el viaje por TABLA, nunca por fila. */
const TANDA_IN = 80

/** Las columnas que hacen falta para MOSTRAR una fila, por fuente. Se piden sólo de las filas que
 *  alguien va a mirar. */
const DETALLE_DE: Record<TipoFuente, string> = {
  compra: 'id, obra_texto, proveedor, concepto, categoria, tipo, comprobante, referencia_externa, total, fecha, origen',
  pedido: 'id, id_pedido, obra_texto, material, cantidad, fecha, origen',
  herramienta: 'id, id_herramienta, nombre, ubicacion_actual, fecha, origen',
  movimiento: 'id, id_movimiento, id_herramienta, destino, responsable, fecha, origen',
}

/** De qué columna sale el texto de obra en cada fuente. */
const COLUMNA_TEXTO: Record<TipoFuente, string> = {
  compra: 'obra_texto',
  pedido: 'obra_texto',
  herramienta: 'ubicacion_actual',
  movimiento: 'destino',
}

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

/**
 * Las filas de una tabla cuyo texto de obra es uno de los que se piden.
 *
 * Es UNA consulta por tanda de 80 textos, no una por texto: buscar la evidencia texto por texto es
 * exactamente el N+1 que esta pantalla no puede permitirse, porque la cola crece con el desorden.
 */
async function traerPorTexto(
  supabase: SupabaseClient, tabla: string, columna: string, textos: string[], columnas: string,
): Promise<Record<string, unknown>[]> {
  const filas: Record<string, unknown>[] = []
  for (let i = 0; i < textos.length; i += TANDA_IN) {
    const { data, error } = await supabase.from(tabla).select(columnas).in(columna, textos.slice(i, i + TANDA_IN))
    if (error) throw new Error(`${tabla}: ${error.message}`)
    filas.push(...((data ?? []) as unknown as Record<string, unknown>[]))
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
 * UNA COMPRA VISTA SÓLO PARA CONTARLA.
 *
 * Trae lo justo para saber en qué estado está (`texto`) y para alimentar la evidencia B del
 * sugeridor (`recurso` = el proveedor). Todo lo demás queda en `null` A PROPÓSITO y esta fila NUNCA
 * llega a la pantalla: si apareciera, se vería como una compra sin fecha ni importe, que es un dato
 * inventado. Por eso los grupos se arman con `paraDetalle`, no con esto.
 */
function deComprasLiviana(fila: Record<string, unknown>): FilaImputable {
  return {
    tipo: 'compra', id: '', tabla: TABLA_DE.compra, referencia: null, fuente: null,
    fecha: null, descripcion: '', importe: null,
    recurso: opcional(fila.proveedor), texto: texto(fila.obra_texto),
  }
}

/** Los textos DISTINTOS de una fuente que hoy no tienen respuesta en el diccionario. */
function textosPendientes(filas: FilaImputable[], indice: Map<string, FilaAlias>): string[] {
  const vistos = new Set<string>()
  for (const f of filas) {
    if (estadoDeFila(f.texto, indice) !== 'pendiente') continue
    const t = String(f.texto)
    if (t) vistos.add(t)
  }
  return [...vistos]
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
    // ── OLA 1 · lo que hace falta para CONTAR ────────────────────────────────────────────────
    const [comprasLivianas, pedidos, herramientas, movimientos, alias] = await Promise.all([
      traerTodo(supabase, TABLA_DE.compra, 'obra_texto, proveedor'),
      traerTodo(supabase, TABLA_DE.pedido, DETALLE_DE.pedido),
      traerTodo(supabase, TABLA_DE.herramienta, DETALLE_DE.herramienta),
      traerTodo(supabase, TABLA_DE.movimiento, DETALLE_DE.movimiento),
      traerTodo(supabase, 'obra_alias', 'alias, obra_id, clasificacion, ejemplo_raw'),
    ])
    const aliasFilas = alias as unknown as FilaAlias[]
    const indice = indexarAlias(aliasFilas)

    const compras = comprasLivianas.map(deComprasLiviana)
    const otrasFuentes: FilaImputable[] = [
      ...pedidos.map(dePedidos),
      ...herramientas.map(deHerramientas),
      ...movimientos.map(deMovimientos),
    ]

    // ── OLA 2 · el detalle de las compras que SÍ están pendientes, y de ninguna otra ─────────
    const pendientesDeCompras = textosPendientes(compras, indice)
    const comprasVisibles = pendientesDeCompras.length === 0 ? [] : (await traerPorTexto(
      supabase, TABLA_DE.compra, COLUMNA_TEXTO.compra, pendientesDeCompras, DETALLE_DE.compra,
    )).map(deCompras)

    // DOS LISTAS DISTINTAS, Y MEZCLARLAS SERÍA EL DEFECTO. `paraContar` tiene las 875 compras
    // livianas: es lo único con lo que el resumen puede decir 875. `paraAgrupar` tiene sólo filas
    // con detalle: agrupar con las livianas dibujaría compras sin fecha ni importe, que es un dato
    // inventado. Las dos coinciden en el único lugar donde importa —qué está pendiente— porque las
    // compras pendientes están enteras en las dos.
    const paraContar = [...compras, ...otrasFuentes]
    const paraAgrupar = [...otrasFuentes, ...comprasVisibles]
    const historial = historialDeRecurso(compras, indice)
    const grupos = (agruparPendientes(paraAgrupar, indice) as GrupoPendiente[]).map((g) => ({
      ...g,
      sugerencia: (sugerirObra(g, { aliasFilas, historial }) ?? null) as Sugerencia | null,
    }))

    const crudo = resumirPorTipo(paraContar, indice) as Record<string, Omit<ResumenFuente, 'tipo'>>
    const resumen = (Object.keys(ETIQUETA_TIPO) as TipoFuente[])
      .map((tipo) => ({ tipo, ...(crudo[tipo] ?? { total: 0, obra: 0, estructura: 0, pendiente: 0, sin_texto: 0 }) }))

    return { data: { grupos, resumen }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'No pude leer las fuentes' }
  }
}

/**
 * LAS OBRAS A LAS QUE SE PUEDE IMPUTAR, con lo que hace falta para elegir entre ellas.
 *
 * `getPortafolio` hace `select('*')` sobre `obra_panel` —una vista de 40 columnas, 44 ms medidos
 * con RLS puesta— y de eso acá se usan cinco campos. Se pide lo que se usa: 18,5 ms y 2 KB en vez
 * de 19 KB. No se toca `getPortafolio`, que la comparten otras pantallas con otras necesidades.
 */
export async function getObrasParaImputar(
  supabase: SupabaseClient,
): Promise<ServiceResult<ObraElegible[]>> {
  const { data, error } = await supabase
    .from('obra_panel')
    .select('obra_id, nombre, estado, cliente_nombre, avance_pct')
    .order('orden', { ascending: true })
    .order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as ObraElegible[], error: null }
}

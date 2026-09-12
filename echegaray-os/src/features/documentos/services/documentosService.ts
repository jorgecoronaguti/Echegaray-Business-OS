// DOCUMENTOS — la lectura del catálogo de Drive y de sus vínculos.
//
// ═══ POR QUÉ `drive_index` Y NO OTRA ═══
//
// Medido el 21/08/2026 contra la base real: `obra_documento` 0 filas · `documento_presentacion` 0 ·
// `drive_documento_estado` 0 · `drive_index` 3.593 (3.123 archivos) · `documentacion_legajo` 847 ·
// `cliente_documento` 214. La vista transversal sale de la única tabla que tiene el archivo; las
// otras dos que tienen filas no son catálogos sino VÍNCULOS, y entran como columna.
//
// ═══ EL FILTRO SE HACE EN POSTGRES, NO EN EL NAVEGADOR ═══
//
// 3.789 archivos con su ruta son ~300 kB por apertura: el recorte lo hace Postgres y el resultado se
// acota con un tope explícito que la pantalla dice en voz alta.
//
// ═══ Y LA BÚSQUEDA ES LA DEL CHAT, NO UNA PROPIA (12/09/2026) ═══
//
// Acá decía que el motor de tokens de `drive-busqueda` no servía para esta pantalla porque «el
// usuario está filtrando una tabla que ve, donde empieza con lo que tipeo es lo que espera». Medido,
// era falso: con `name ilike '%frase entera%'` esta pantalla acertaba 2 de 30 consultas reales y el
// chat 21 de 30 sobre los mismos archivos («dni de capelli» no es una subcadena de «DNI -
// Capelli.pdf»). Y el caso que esa decisión protegía —tipear un fragmento y ver la tabla filtrarse—
// lo cubre el peldaño `parcial` de la escalera, que además ahora es insensible a acentos.
//
// La búsqueda vive en `orquestador/lib/drive-busqueda/escalera.mjs` y la ejecuta
// `busquedaLexica.ts`: misma definición que el chat, un solo tokenizador, dos sustratos.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/administracion/types'
import type { CarpetaRaiz, Documento } from '../types'
import {
  conVinculos, partirIds, unirPartes, ventanaVencimientos,
  type ArchivoIndexado, type VinculoCliente, type VinculoLegajo, type VinculoObra,
} from './documentos.ts'
import { esCategoria, patronesAnteriores, patronesDe, type ClaveCategoria, type Patron } from './categorias.ts'
// LAS EXTENSIONES `.ts` SON A PROPÓSITO (y `tsconfig` las permite: `allowImportingTsExtensions`).
// `orquestador/scripts/documentos-busqueda-baseline.mjs` importa ESTE servicio con Node para medir
// la búsqueda de la pantalla de verdad en vez de reimplementarla, y Node exige la extensión real.
import {
  analizar, conPeldano, ordenar, peldanos, VENTANA_RANKEO,
  type ConsultaFiltrable, type Peldano,
} from './busquedaLexica.ts'

// `nombre_norm` viaja porque es el campo que CLASIFICA: la etiqueta de categoría de cada fila se
// calcula con el mismo texto contra el que filtró Postgres. Normalizar el nombre otra vez en el
// navegador dejaría al chip y a la fila discutiendo sobre el mismo archivo.
//
// `ausente_en_drive`, `trashed` y `web_view_link` llegaron con la migración
// 20260910T1930_drive_index_ausente_md5.sql: ESTA PANTALLA NO CARGA SIN ELLA. Es a propósito —
// PostgREST contesta 42703 y se ve el error— en vez de omitirlas y mostrar 4.232 archivos como si
// todos siguieran en su lugar. Se aplica la migración ANTES de desplegar.
//
// LAS DOS CONSTANTES SE UNEN CON UN TEMPLATE LITERAL Y `as const` A PROPÓSITO: supabase-js DEDUCE
// el tipo de la fila parseando esta cadena, y una concatenación con `+` la degrada a `string` —
// ahí el tipo de `data` pasa a ser `GenericStringError` y el cast del panel deja de compilar.
const COLUMNAS_INDICE = 'drive_file_id, name, path, tipo, mime_type, size_bytes, modified_time, nombre_norm' as const
const COLUMNAS = `${COLUMNAS_INDICE}, ausente_en_drive, trashed, web_view_link` as const

/**
 * Filas por página. La pantalla pide una más con «Cargar más» y la consulta trae `TOPE × páginas`.
 *
 * 100 y no 200: el tope existe para que 3.599 archivos no se dibujen de una, y 200 filas ya son dos
 * pantallas y media de barrido. Con «Cargar más» el tope dejó de ser un techo —era eso, un techo sin
 * puerta: lo que caía en la fila 201 no se alcanzaba desde ningún lado— y pasó a ser el tamaño del
 * primer bocado.
 */
export const TOPE = 100

/** Tope duro de páginas. 30 páginas son 3.000 filas: más que eso no es una lista, es un volcado —y
 *  sin él, `?n=99999` es una consulta de 3.599 filas con sus vínculos que cualquiera puede pedir. */
export const PAGINAS_MAX = 30

/** Las clases de vínculo por las que se puede filtrar. NO incluye proveedor: no existe la tabla. */
export const ENTIDADES = ['obra', 'persona', 'cliente'] as const
export type Entidad = (typeof ENTIDADES)[number]
export const esEntidad = (v: string | undefined): v is Entidad =>
  !!v && (ENTIDADES as readonly string[]).includes(v)

export interface FiltroDocumentos {
  q?: string
  /** Prefijo de ruta: una carpeta del catálogo, no una categoría inventada. */
  carpeta?: string
  tipo?: string
  /** Una clave de `categorias.ts`. Se traduce a patrones SQL, no a una columna que no existe. */
  categoria?: string
  /** `vencido` o `mes`: el recorte de la banda de alertas, aplicado a la tabla. */
  vence?: string
  /** De quién cuelga el archivo: `obra`, `persona` o `cliente`. Se resuelve en Postgres contra la
   *  tabla de vínculo, nunca descartando filas ya traídas en el navegador. */
  entidad?: string
  /** El día contra el que se mide `vence`, en ISO. Lo fija la pantalla una sola vez. */
  hoy?: string
  /** Cuántas páginas de `TOPE` filas pedir. 1 por defecto; lo sube «Cargar más». */
  paginas?: number
}

export interface Catalogo {
  documentos: Documento[]
  /** Cuántos hay en total con este filtro. Es lo que deja decir «se listan 200 de 1.147». */
  total: number
  /**
   * CON QUÉ COINCIDIÓ, cuando hubo búsqueda por texto.
   *
   * Viaja a la pantalla para que la fila pueda resaltar el fragmento que matcheó: un resultado que
   * no dice por qué entró obliga a leer las cuatro columnas buscando la palabra a ojo, y cuando la
   * coincidencia está en una carpeta intermedia no se ve en ningún lado. Son los tokens del ÚNICO
   * tokenizador: la pantalla resalta exactamente lo que la base comparó, no su propia idea de lo
   * que el usuario escribió.
   */
  busqueda: { peldano: string; tokens: string[] } | null
}

/**
 * Un patrón dentro de `or=(…)` de PostgREST. LAS COMILLAS NO SON DECORATIVAS: sin ellas el punto de
 * `%.dwg` separa columna de operador y la consulta entera falla. Ningún patrón contiene `"`.
 */
const comoOr = (p: Patron) => `${p.campo}.ilike."${p.patron}"`

/**
 * EL FILTRO DE CATEGORÍA, TRADUCIDO A POSTGRES.
 *
 * Dos mitades, y la segunda es la que hace que el chip y la etiqueta de la fila digan lo mismo:
 * los patrones PROPIOS de la categoría, y la negación de los de TODA categoría anterior. Sin la
 * negación, «Certificado Afiliacion - ART.pdf» entraría por el chip `certificados` aunque su fila
 * diga `Seguros`, y quien filtre no podría confiar en lo que ve. `otros` es sólo negación.
 */
function conCategoria<T extends { or: (f: string) => T; not: (c: string, o: string, v: string) => T }>(
  consulta: T,
  clave: ClaveCategoria,
): T {
  const propios = patronesDe(clave)
  let c = propios.length > 0 ? consulta.or(propios.map(comoOr).join(',')) : consulta
  for (const p of patronesAnteriores(clave)) c = c.not(p.campo, 'ilike', p.patron)
  return c
}

/**
 * Un constructor de consulta sobre `drive_index`, visto por lo único que esta función necesita.
 *
 * NO se usa el tipo real de PostgREST a propósito: encadenar dos ayudantes genéricos sobre él
 * (`conCategoria` y los filtros de acá) hace que TypeScript instancie el tipo hasta el fondo y
 * falle con «type instantiation is excessively deep». Comprobado — no es una precaución teórica.
 */
interface Consulta {
  or: (f: string) => Consulta
  not: (c: string, o: string, v: string) => Consulta
  like: (c: string, p: string) => Consulta
  eq: (c: string, v: unknown) => Consulta
}

/**
 * Los filtros que se expresan como columnas de `drive_index`. Se aplican IGUAL a cada parte cuando
 * la consulta se parte: si una parte filtrara distinto, la unión mezclaría dos búsquedas.
 */
function conFiltros(consulta: Consulta, filtro: FiltroDocumentos): Consulta {
  let c = consulta
  if (esCategoria(filtro.categoria)) c = conCategoria(c, filtro.categoria)

  // `q` NO se aplica acá: es la escalera, y se prueba peldaño por peldaño (ver `getDocumentos`).
  // `carpeta` viene de la lista de carpetas reales del índice, pero llega por la URL: se escapa
  // igual que la búsqueda. Un `%` puesto a mano acá convertiría el filtro en «traé todo».
  const carpeta = filtro.carpeta?.trim().replace(/[,()*%]/g, '')
  if (carpeta) c = c.like('path', `${carpeta}/%`)
  if (filtro.tipo?.trim()) c = c.eq('tipo', filtro.tipo.trim())
  return c
}

/** Lo que hace falta para cerrar la consulta después de filtrarla. */
interface ConsultaOrdenable extends Consulta {
  order: (c: string, o: { ascending: boolean; nullsFirst: boolean }) => ConsultaOrdenable
  limit: (n: number) => ConsultaOrdenable
  in: (c: string, v: string[]) => PromiseLike<RespuestaLista>
  then: PromiseLike<RespuestaLista>['then']
}

type RespuestaLista = {
  data: unknown[] | null
  error: { message: string } | null
  count: number | null
}

export async function getDocumentos(
  supabase: SupabaseClient,
  filtro: FiltroDocumentos = {},
): Promise<ServiceResult<Catalogo>> {
  // ═══ LOS DOS RECORTES QUE NO SON COLUMNAS DE `drive_index` ═══
  //
  // El vencimiento vive en `documentacion_legajo` y el vínculo en tres tablas más. Los dos se
  // resuelven ANTES, a lista de ids, y se INTERSECAN: pedir «vencidos» y «de personas» a la vez
  // tiene que devolver los que cumplen las dos cosas, no la suma.
  const listas: string[][] = []
  if (filtro.vence) {
    const r = await idsPorVencer(supabase, filtro.vence, filtro.hoy ?? new Date().toISOString().slice(0, 10))
    if (r.error) return { data: null, error: r.error }
    listas.push(r.data ?? [])
  }
  if (esEntidad(filtro.entidad)) {
    const r = await idsDeEntidad(supabase, filtro.entidad)
    if (r.error) return { data: null, error: r.error }
    listas.push(r.data ?? [])
  }

  let ids: string[] | null = null
  if (listas.length > 0) {
    ids = listas.reduce((a, b) => { const s = new Set(b); return a.filter((x) => s.has(x)) })
    // CERO IDS ES CERO DOCUMENTOS, no «traé todo». Un `.in()` con la lista vacía es la clase de
    // filtro que se cae hacia el lado abierto y muestra 3.123 archivos donde no había ninguno.
    if (ids.length === 0) return { data: { documentos: [], total: 0, busqueda: null }, error: null }
  }

  const tope = TOPE * Math.min(Math.max(1, Math.trunc(filtro.paginas ?? 1)), PAGINAS_MAX)
  const texto = filtro.q?.trim() ?? ''
  const consulta = texto ? analizar(texto) : null
  // Con búsqueda se trae la ventana de rankeo y se recorta DESPUÉS de ordenar por parecido: recortar
  // antes dejaría la página con las 100 más nuevas de las que coinciden, no con las 100 que más se
  // parecen a lo pedido.
  const traer = consulta ? Math.max(tope, VENTANA_RANKEO) : tope
  const base = (peldano: Peldano | null): ConsultaOrdenable => {
    const conQ = conFiltros(
      supabase.from('drive_index').select(COLUMNAS, { count: 'exact' }).eq('is_folder', false) as unknown as Consulta,
      filtro,
    )
    const conEscalera = peldano
      ? conPeldano(conQ as unknown as ConsultaFiltrable, peldano) as unknown as Consulta
      : conQ
    return (conEscalera as ConsultaOrdenable)
      .order('modified_time', { ascending: false, nullsFirst: false }).limit(traer)
  }

  // Sin recorte por ids es UNA consulta. Con recorte son tantas como partes: ver `partirIds`, que
  // explica por qué un `.in()` de 847 ids no filtra mal sino que devuelve 400.
  const correr = async (peldano: Peldano | null): Promise<RespuestaLista[]> => (ids === null
    ? [await base(peldano)]
    : Promise.all(partirIds(ids).map((parte) => base(peldano).in('drive_file_id', parte))))

  // ═══ LA ESCALERA: SE BAJA HASTA EL PRIMER PELDAÑO QUE TRAE ALGO ═══
  //
  // Igual que en el chat, y por la misma razón: si el nombre exacto existe, lo que apenas comparte
  // una palabra no compite. El peldaño se prueba CON los demás filtros puestos —categoría, carpeta,
  // tipo, vencimiento, entidad—; probarlo suelto y filtrar después daría «no hay nada» cada vez que
  // el mejor peldaño cae entero fuera del filtro que la persona eligió.
  //
  // Son hasta cuatro idas a Postgres en el peor caso, y el peor caso es el que antes no encontraba
  // nada. Las dos primeras son por índice (`nombre_norm` btree, `tokens` GIN) y la de `ilike` recorre
  // 3.789 filas, que para Postgres es ruido. Medido en el baseline: 4 peldaños, 96 ms.
  let respuestas: RespuestaLista[] = []
  let peldanoUsado: string | null = null
  if (!consulta) {
    respuestas = await correr(null)
  } else {
    for (const peldano of peldanos(consulta)) {
      respuestas = await correr(peldano)
      if (respuestas.some((r) => r.error)) break
      if (respuestas.some((r) => (r.data?.length ?? 0) > 0)) { peldanoUsado = peldano.nombre; break }
    }
  }

  const fallo = respuestas.find((r) => r.error)
  if (fallo?.error) return { data: null, error: fallo.error.message }

  const crudos = unirPartes(
    respuestas.map((r) => (r.data ?? []) as ArchivoIndexado[]),
    traer,
  )
  const archivos = (consulta ? ordenar(crudos, consulta) : crudos).slice(0, tope)
  // Las partes no comparten ningún id, así que los `count` son disjuntos y su suma es el total real.
  // Sin peldaño que traiga nada el total es 0 aunque la última respuesta haya contado otra cosa.
  const total = peldanoUsado === null && consulta ? 0 : respuestas.reduce((s, r) => s + (r.count ?? 0), 0)

  const vinculos = await leerVinculos(supabase, archivos.map((a) => a.drive_file_id))
  return {
    data: {
      documentos: conVinculos(archivos, vinculos.legajos, vinculos.clientes, vinculos.obras),
      total,
      busqueda: consulta && peldanoUsado ? { peldano: peldanoUsado, tokens: consulta.tokens } : null,
    },
    error: null,
  }
}

// EL CONTADOR POR CHIP SE FUE CON EL PORTE 27 v2 (25/08/2026). `getConteoEntidades` traía los ids
// de las TRES tablas de vínculo —1.093 filas— en cada carga para poner un número al lado de cada
// pastilla; el v2 no los dibuja, y el único conteo que quedó es `n/total`, que sale de la consulta
// que la lista ya hace. Tres lecturas menos por página vista, y ningún dato menos en pantalla.

/** Los archivos vinculados a una clase de entidad. Es lo que hace que «De obras» filtre en Postgres
 *  y no descartando filas ya traídas: sin esto, filtrar por obra sobre las 100 primeras dejaría
 *  fuera las 32 de `obra_documento` casi siempre. */
async function idsDeEntidad(supabase: SupabaseClient, entidad: Entidad): Promise<ServiceResult<string[]>> {
  const tabla = { persona: 'documentacion_legajo', cliente: 'cliente_documento', obra: 'obra_documento' }[entidad]
  const { data, error } = await supabase.from(tabla).select('drive_file_id').not('drive_file_id', 'is', null)
  if (error) return { data: null, error: error.message }
  const ids = (data ?? []).map((f) => (f as { drive_file_id: string }).drive_file_id)
  return { data: [...new Set(ids)], error: null }
}

/**
 * Los vínculos SÓLO de los archivos que se van a dibujar.
 *
 * Un error de permisos acá no vacía la pantalla: el archivo existe igual y su ruta sigue diciendo
 * dónde está. Se devuelve la lista vacía y la columna dirá «sin vincular», que es exactamente lo
 * que ve alguien que no tiene permiso para saberlo.
 */
async function leerVinculos(
  supabase: SupabaseClient,
  ids: string[],
): Promise<{ legajos: VinculoLegajo[]; clientes: VinculoCliente[]; obras: VinculoObra[] }> {
  if (ids.length === 0) return { legajos: [], clientes: [], obras: [] }
  const [legajo, cliente, obra] = await Promise.all([
    supabase
      .from('documentacion_legajo')
      // `id` viaja porque es lo que la acción de fijar el vencimiento necesita para saber QUÉ fila
      // escribe. Sin él, el panel tendría que buscarla por (persona, tipo) y elegir una de varias.
      .select('id, drive_file_id, tipo_documento, fecha_vencimiento, persona_id, personas(nombre_completo)')
      .in('drive_file_id', ids),
    supabase
      .from('cliente_documento')
      .select('drive_file_id, rol, clientes(nombre_comercial, slug)')
      .in('drive_file_id', ids),
    // `obra_canonica.id` ES el identificador de la URL de la obra: no hay columna `slug`.
    supabase
      .from('obra_documento')
      .select('drive_file_id, rol, obra_canonica(id, nombre)')
      .in('drive_file_id', ids),
  ])
  return {
    legajos: (legajo.data ?? []) as unknown as VinculoLegajo[],
    clientes: (cliente.data ?? []) as unknown as VinculoCliente[],
    obras: (obra.data ?? []) as unknown as VinculoObra[],
  }
}

// ═══ VENCIMIENTOS ══════════════════════════════════════════════════════════════════════════════
//
// `documentacion_legajo.fecha_vencimiento` es HOY la única fecha de vigencia que existe en el OS:
// `cliente_documento` no tiene la columna (cliente_id, drive_file_id, rol, origen, creado_en y nada
// más). Así que la banda mide sobre 847 filas posibles, no sobre los 3.123 archivos, y lo dice.

// CUÁNTOS VENCIERON Y CUÁNTOS VENCEN ESTE MES lo contaba `getResumenVencimientos`, y su único
// consumidor era la banda «Lo que pide trabajo» de `/documentos`, retirada el 08/09/2026 por orden
// del dueño. Se fue con ella: tres `count` contra `documentacion_legajo` en cada carga de la
// pantalla que ya nadie leía. El recorte por vencimiento de la LISTA no dependía de esto —lo
// resuelve `idsPorVencer` acá abajo—, así que `?vence=vencido` sigue funcionando igual.

/** Los archivos de Drive que caen en la ventana pedida. Es lo que convierte la banda en un filtro. */
async function idsPorVencer(
  supabase: SupabaseClient,
  ventana: string,
  hoy: string,
): Promise<ServiceResult<string[]>> {
  const { desde, hasta } = ventanaVencimientos(hoy)
  let consulta = supabase
    .from('documentacion_legajo')
    .select('drive_file_id')
    .not('drive_file_id', 'is', null)
  consulta = ventana === 'vencido'
    ? consulta.lt('fecha_vencimiento', desde)
    : consulta.gte('fecha_vencimiento', desde).lte('fecha_vencimiento', hasta)

  const { data, error } = await consulta
  if (error) return { data: null, error: error.message }
  const ids = (data ?? []).map((f) => (f as { drive_file_id: string }).drive_file_id)
  // Un mismo PDF puede estar en el legajo de dos personas: sin deduplicar, el `.in()` lo pediría
  // dos veces y el `count` de la tabla contaría de más.
  return { data: [...new Set(ids)], error: null }
}

/**
 * LAS CARPETAS RAÍZ, LEÍDAS DEL ÍNDICE.
 *
 * `depth = 0` son las tres raíces reales que el indexador escribe (`administracion`,
 * `archivo-fiscal`, `libro-sueldos`). No hay una taxonomía escrita a mano en el código: si mañana
 * el indexador suma una raíz, el filtro la ofrece sin tocar esta pantalla.
 */
export async function getCarpetasRaiz(supabase: SupabaseClient): Promise<ServiceResult<CarpetaRaiz[]>> {
  const { data, error } = await supabase
    .from('drive_index')
    .select('path, name')
    .eq('is_folder', true)
    .eq('depth', 0)
    .order('path', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as CarpetaRaiz[], error: null }
}

/** Un documento por su id de Drive, para el panel de detalle. */
export async function getDocumento(
  supabase: SupabaseClient,
  driveFileId: string,
): Promise<ServiceResult<Documento | null>> {
  const { data, error } = await supabase
    .from('drive_index')
    .select(COLUMNAS)
    .eq('drive_file_id', driveFileId)
    .maybeSingle()
  if (error) return { data: null, error: error.message }
  if (!data) return { data: null, error: null }
  const archivo = data as ArchivoIndexado
  const vinculos = await leerVinculos(supabase, [archivo.drive_file_id])
  return { data: conVinculos([archivo], vinculos.legajos, vinculos.clientes, vinculos.obras)[0], error: null }
}

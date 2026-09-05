// PROVEEDORES — la lectura del maestro y de la cola de nombres sin resolver.
//
// Las dos consultas de resolución NO calculan nada acá: leen `proveedor_nombre_pendiente` y
// `proveedor_nombre_resuelto`, que son las vistas donde vive la definición. Si el criterio de "qué
// está pendiente" se escribiera también en TypeScript, habría dos respuestas posibles a la misma
// pregunta y la pantalla podría discrepar con cualquier otro consumidor.

import type { SupabaseClient } from '@supabase/supabase-js'
// La ruta es relativa y con extensión a propósito: `node --test` corre este archivo sin el alias
// `@/` de Next, y un import por alias lo hace fallar antes del primer test.
import { contieneEnAlguno } from '../../../shared/utils/busqueda.ts'
import type { NombrePendiente, NombreResuelto, Proveedor, ServiceResult } from '../types'

const COLUMNAS = 'id, nombre, razon_social, cuit, notas, activo'

export type FiltroActivo = 'activos' | 'archivados' | 'todos'

export interface FiltroProveedores {
  activo?: FiltroActivo
  /**
   * `true` = sólo los que NO tienen CUIT. Es el filtro al que aterriza el aviso de la cartera: un
   * chip que dice «14 sin CUIT» y cae en una lista de 36 obliga a buscar a mano los 14 que acaba
   * de contar. El predicado vive acá y no en la página para que el número y las filas salgan de la
   * misma consulta.
   *
   * El vacío cuenta como ausencia: la columna admite `''` además de `null`, y un CUIT vacío no
   * cruza con ARCA ni con el banco igual que uno que no está.
   */
  sinCuit?: boolean
}

/**
 * EL PREDICADO, UNA SOLA VEZ — y como DATOS, no como una función que toca el builder.
 *
 * Lo comparten la lista y el conteo: si «sin CUIT» se escribiera dos veces, el día que difieran el
 * aviso de la primera línea pediría un trabajo que la lista no muestra.
 *
 * Devuelve condiciones en vez de aplicarlas porque el builder de `postgrest-js` lleva ocho
 * parámetros genéricos que arrastran la forma del `select()`: una función que lo recibiera y lo
 * devolviera obliga a un `any` o a un cast por llamada, y con `T extends Filtrable<T>` TypeScript
 * se va a «type instantiation is excessively deep». De paso, el predicado queda probable sin base.
 */
export type CondicionProveedores =
  | { op: 'eq'; columna: string; valor: unknown }
  | { op: 'or'; filtro: string }

export function condicionesDe(filtro: FiltroProveedores): CondicionProveedores[] {
  const cs: CondicionProveedores[] = []
  const activo = filtro.activo ?? 'activos'
  if (activo === 'activos') cs.push({ op: 'eq', columna: 'activo', valor: true })
  if (activo === 'archivados') cs.push({ op: 'eq', columna: 'activo', valor: false })
  // EL CUIT VACÍO CUENTA COMO AUSENCIA: la columna admite `''` además de `null`, y un CUIT vacío no
  // cruza con ARCA ni con el banco igual que uno que no está.
  if (filtro.sinCuit) cs.push({ op: 'or', filtro: 'cuit.is.null,cuit.eq.' })
  return cs
}

/**
 * ¿ESTE PROVEEDOR COINCIDE CON LO QUE SE TIPEÓ?
 *
 * El filtro por texto se resolvía en Postgres con tres `ilike`. Se trajo a memoria por dos motivos
 * medidos, no por gusto:
 *
 *   1. `ilike` NO ignora las tildes. Buscar «corralon» no encontraba «Corralón», y nadie escribe
 *      los acentos cuando busca. `contiene` —la misma normalización que usan las otras cuatro
 *      listas del OS— sí los ignora, así que el mismo tipeo da el mismo resultado en toda la app.
 *   2. La pantalla necesita DOS conteos: cuántos hay bajo el filtro y cuántos quedan después de
 *      buscar. Con el texto en la consulta hacían falta dos viajes para saberlos; con el maestro ya
 *      en memoria —decenas de filas, no miles— salen los dos de la misma lectura.
 *
 * El CUIT se compara por sus DÍGITOS: quien lo tiene a mano lo tipea con guiones y la base lo guarda
 * sin ellos, así que sin esto buscar «30-70839055-7» no encontraría nada.
 */
export function coincideProveedor(p: Proveedor, q: string | undefined): boolean {
  if (!q?.trim()) return true
  if (contieneEnAlguno([p.nombre, p.razon_social], q)) return true
  const digitos = q.replace(/\D/g, '')
  return digitos.length > 0 && (p.cuit ?? '').includes(digitos)
}

export async function getProveedores(
  supabase: SupabaseClient,
  filtro: FiltroProveedores = {},
): Promise<ServiceResult<Proveedor[]>> {
  let consulta = supabase.from('proveedores').select(COLUMNAS)
  for (const c of condicionesDe(filtro)) {
    consulta = c.op === 'eq' ? consulta.eq(c.columna, c.valor) : consulta.or(c.filtro)
  }
  const { data, error } = await consulta.order('nombre', { ascending: true })
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as Proveedor[], error: null }
}

export async function getProveedor(supabase: SupabaseClient, id: string): Promise<ServiceResult<Proveedor | null>> {
  const { data, error } = await supabase.from('proveedores').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) return { data: null, error: error.message }
  return { data: (data as Proveedor) ?? null, error: null }
}

/**
 * Los nombres del Sheet que nadie resolvió, con lo que pesan.
 *
 * Vienen ordenados por cantidad de comprobantes porque la lista es una COLA DE TRABAJO: resolver el
 * nombre que aparece 190 veces mueve mucho más costo de obra que el que aparece una sola.
 */
export async function getNombresPendientes(
  supabase: SupabaseClient,
  limite = 200,
): Promise<ServiceResult<NombrePendiente[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_pendiente')
    .select('nombre_norm, nombre_origen, comprobantes, total, primera_fecha, ultima_fecha')
    .order('comprobantes', { ascending: false })
    .limit(limite)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombrePendiente[], error: null }
}

export async function getNombresResueltos(
  supabase: SupabaseClient,
  limite = 200,
): Promise<ServiceResult<NombreResuelto[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id, ultima_compra')
    .order('comprobantes', { ascending: false })
    .limit(limite)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombreResuelto[], error: null }
}

// ═══ LOS NOMBRES DE COMPRAS DE UN PROVEEDOR, Y LO QUE PESAN ═══
//
// El handoff pide en la ficha «los nombres de Compras vinculados a ese CUIT». No es decoración: es
// la prueba de que la canonicalización funcionó. Ver «CORRALON DEL CENTRO · CORRALON CENTRO SRL ·
// CORR. CENTRO» colgando de una sola ficha es lo que deja confirmar que las tres grafías dejaron de
// ser tres proveedores.
//
// Y de ahí sale también LO COMPRADO, sumando lo que ya suma `proveedor_nombre_resuelto` sobre
// `costos_obra`. NO se guarda en la ficha: un total al lado de sus filas es la segunda versión del
// mismo número, y el día que entre un comprobante nuevo dejan de coincidir sin avisar.
//
// LO QUE NO SE PUEDE MOSTRAR: la ÚLTIMA COMPRA. `proveedor_nombre_resuelto` publica comprobantes y
// total, no la fecha máxima —a diferencia de la cola de pendientes, que sí la tiene—. Ponerle la
// fecha de otra cosa sería inventarla; agregarla exige tocar la vista, o sea una migración, y este
// bloque no abre migraciones. Queda declarado.

export interface ComprasDelProveedor {
  nombres: { nombre_norm: string; comprobantes: number; total: number; manual: boolean }[]
  comprobantes: number
  /** En pesos, histórico. `null` si no hay ningún nombre vinculado: 0 diría que nunca se le compró. */
  comprado: number | null
}

/**
 * El resumen de UN proveedor, a partir de las filas de la lectura única de la cartera.
 *
 * Es una función pura sobre datos ya leídos, no una consulta: el panel de un proveedor NO dispara
 * un viaje propio. `getResolucionCartera` trae la vista una sola vez para toda la página y de ahí
 * salen las dos cosas —la columna COMPRADO de cada fila y el detalle del que está abierto—. Antes
 * eran dos lecturas de `proveedor_nombre_resuelto`, y esa vista reagrupa `costos_obra` ENTERA en
 * cada llamada: pedirla dos veces era pagar dos veces el mismo agregado.
 */
export function resumirCompras(filas: NombreResuelto[]): ComprasDelProveedor {
  const nombres = filas
    .map((f) => ({
      nombre_norm: f.nombre_norm,
      comprobantes: Number(f.comprobantes ?? 0),
      total: Number(f.total ?? 0),
      manual: f.via === 'resolucion_manual',
    }))
    .sort((a, b) => b.total - a.total)
  const comprobantes = nombres.reduce((a, n) => a + n.comprobantes, 0)
  return {
    nombres,
    comprobantes,
    comprado: nombres.length === 0 ? null : nombres.reduce((a, n) => a + n.total, 0),
  }
}

// ═══ LA CARTERA (canónico 22): LO COMPRADO Y EL TIPO, PARA TODAS LAS FILAS DE UNA VEZ ═══
//
// El canónico v2 ya viene podado a lo que la base prueba: PROVEEDOR · CUIT · COMPRADO · COMPROB.
// La v1 dibujaba además RUBRO y PAPELES y ninguna tenía fuente. Queda escrito por qué, para que
// nadie las vuelva a agregar «porque el diseño viejo las tenía»:
//
//   COMPRADO  sale de `proveedor_nombre_resuelto`, la misma vista que ya alimenta la ficha. Se lee
//             una vez para toda la lista y se agrupa en memoria —son decenas de filas, no miles—;
//             una consulta por proveedor sería N viajes para el mismo número.
//             NO ES «12 M»: la vista publica comprobantes y total, no la fecha de cada uno. El
//             rótulo dice COMPRADO a secas. Poner «12 M» sobre un total histórico sería declarar
//             una ventana de tiempo que el dato no tiene — la regla 3 de las de oro.
//   TIPO      «Subcontratista» es un HECHO derivable: tiene al menos un paquete en `subcontrato`.
//             Material / Equipos / Servicio NO se derivan de nada: `proveedores` no tiene columna
//             de tipo ni de rubro. Se dibuja el único que la base puede probar.
//   RUBRO     sin fuente. PAPELES sin fuente: ninguna tabla vincula un archivo con un proveedor
//             (mismo agujero que declara la ficha 23). No se dibujan columnas vacías.

export interface CompradoProveedor {
  comprobantes: number
  /** En pesos, histórico. Nunca 0 por ausencia: un proveedor sin filas no está en el mapa. */
  total: number
  /**
   * La compra fechada más reciente, en ISO. Un proveedor llega acá con VARIOS nombres de Compras
   * («CORRALON PROGRESO», «Corralon Progreso SRL»): la última compra del proveedor es el máximo
   * entre todos ellos, no la del primer nombre que aparezca.
   */
  ultima: string | null
}

/** El agrupado, separado de la consulta para poder probarlo sin base. */
export function agruparComprado(filas: NombreResuelto[]): Map<string, CompradoProveedor> {
  const mapa = new Map<string, CompradoProveedor>()
  for (const f of filas) {
    // `no_es_proveedor` marca un texto que NO es nadie: sumarlo le regalaría compras a un
    // proveedor que la resolución justamente descartó.
    if (!f.proveedor_id || f.estado !== 'vinculado') continue
    const previo = mapa.get(f.proveedor_id) ?? { comprobantes: 0, total: 0, ultima: null }
    mapa.set(f.proveedor_id, {
      comprobantes: previo.comprobantes + Number(f.comprobantes ?? 0),
      total: previo.total + Number(f.total ?? 0),
      // MÁXIMO, no «el último que pasó». Las fechas vienen en ISO `YYYY-MM-DD`, que ordena igual
      // como texto que como fecha; comparar así evita construir un `Date` por fila.
      ultima: (f.ultima_compra ?? '') > (previo.ultima ?? '') ? f.ultima_compra : previo.ultima,
    })
  }
  return mapa
}

export async function getResolucionCartera(
  supabase: SupabaseClient,
): Promise<ServiceResult<NombreResuelto[]>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id, ultima_compra')
    .not('proveedor_id', 'is', null)
  // UN ERROR DE LECTURA NO ES UNA LISTA VACÍA. Vacío se dibuja como «a ninguno se le compró nada»;
  // el error se dice y la columna queda sin afirmar nada.
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as NombreResuelto[], error: null }
}

/**
 * CUÁNTOS PROVEEDORES CUMPLEN UN FILTRO, SIN TRAERLOS.
 *
 * El aviso «14 sin CUIT» necesita el número, no las filas: `head: true` deja el cuerpo vacío y
 * Postgres devuelve sólo el conteo. Traer las 14 fichas enteras para hacerles `.length` era pedir
 * datos que nadie iba a mirar, y además metía una segunda copia del maestro en la memoria del
 * render. El predicado es EL MISMO de `getProveedores`: si se escribiera aparte, el día que
 * difieran el aviso pediría un trabajo que la lista no muestra.
 *
 * ═══ POR QUÉ `exact` Y NO `planned` (decisión consciente, 25/08/2026) ═══
 *
 * `planned` usa la estimación del planificador y sale en tiempo constante, pero MIENTE por diseño.
 * Acá el número no es una luz de aviso: es la etiqueta de un enlace que aterriza en la lista
 * filtrada por el MISMO predicado, así que quien lee «14 sin CUIT» y hace clic tiene que ver 14
 * filas. Un estimado que dijera 12 o 17 convertiría la primera línea de la pantalla en un dato que
 * no se puede confrontar con nada — lo contrario de para qué existe.
 *
 * El costo está medido y es despreciable: `proveedores` tiene 36 filas (24/08/2026) y su política
 * de RLS es un portero de área, no una comparación por fila. Si esta tabla creciera a decenas de
 * miles, la decisión se revisa: ahí `exact` con RLS recorre y evalúa fila por fila.
 */
export async function contarProveedores(
  supabase: SupabaseClient,
  filtro: FiltroProveedores = {},
): Promise<ServiceResult<number>> {
  let consulta = supabase.from('proveedores').select('id', { count: 'exact', head: true })
  for (const c of condicionesDe(filtro)) {
    consulta = c.op === 'eq' ? consulta.eq(c.columna, c.valor) : consulta.or(c.filtro)
  }
  const { count, error } = await consulta
  if (error) return { data: null, error: error.message }
  // `count` puede venir `null` si PostgREST no pudo contar. NULL NO ES CERO: cero diría «no hay
  // ninguno sin CUIT», que es justo la afirmación que esta pantalla no puede permitirse regalar.
  if (count === null) return { data: null, error: 'PostgREST no devolvió el conteo' }
  return { data: count, error: null }
}

/**
 * Los proveedores con al menos un paquete de subcontrato.
 *
 * `subcontrato` está filtrada por obra (`subcontrato_por_obra`): un jefe de obra ve los paquetes de
 * SUS obras. Por eso el conjunto es «los que puedo probar que son subcontratistas», no «todos los
 * que lo son» — y por eso la ausencia del chip nunca se escribe como «no es subcontratista».
 */
export async function getSubcontratistas(supabase: SupabaseClient): Promise<ServiceResult<Set<string>>> {
  const { data, error } = await supabase.from('subcontrato').select('proveedor_id').not('proveedor_id', 'is', null)
  if (error) return { data: null, error: error.message }
  const ids = new Set<string>()
  for (const f of (data ?? []) as { proveedor_id: string | null }[]) if (f.proveedor_id) ids.add(f.proveedor_id)
  return { data: ids, error: null }
}

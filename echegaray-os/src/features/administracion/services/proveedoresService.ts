// PROVEEDORES — la lectura del maestro y de la cola de nombres sin resolver.
//
// Las dos consultas de resolución NO calculan nada acá: leen `proveedor_nombre_pendiente` y
// `proveedor_nombre_resuelto`, que son las vistas donde vive la definición. Si el criterio de "qué
// está pendiente" se escribiera también en TypeScript, habría dos respuestas posibles a la misma
// pregunta y la pantalla podría discrepar con cualquier otro consumidor.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NombrePendiente, NombreResuelto, Proveedor, ServiceResult } from '../types'

const COLUMNAS = 'id, nombre, razon_social, cuit, notas, activo'

export type FiltroActivo = 'activos' | 'archivados' | 'todos'

export interface FiltroProveedores {
  q?: string
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

export async function getProveedores(
  supabase: SupabaseClient,
  filtro: FiltroProveedores = {},
): Promise<ServiceResult<Proveedor[]>> {
  let consulta = supabase.from('proveedores').select(COLUMNAS)

  const activo = filtro.activo ?? 'activos'
  if (activo === 'activos') consulta = consulta.eq('activo', true)
  if (activo === 'archivados') consulta = consulta.eq('activo', false)

  if (filtro.sinCuit) consulta = consulta.or('cuit.is.null,cuit.eq.')

  const q = filtro.q?.trim()
  if (q) {
    const seguro = q.replace(/[,()]/g, ' ').trim()
    // El CUIT se busca por sus dígitos: quien lo tiene a mano lo tipea con guiones, y la base lo
    // guarda sin ellos. Sin esto, buscar "30-70839055-7" no encontraría nada.
    const digitos = seguro.replace(/\D/g, '')
    const partes = [`nombre.ilike.%${seguro}%`, `razon_social.ilike.%${seguro}%`]
    if (digitos) partes.push(`cuit.ilike.%${digitos}%`)
    if (seguro) consulta = consulta.or(partes.join(','))
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
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
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

/** El resumen, separado de la consulta para poder probarlo sin base. */
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

export async function getComprasDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<ComprasDelProveedor> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
    .eq('proveedor_id', proveedorId)
  // Un error de lectura NO se dibuja como «no compró nada»: se devuelve la lista vacía con
  // `comprado: null`, que la ficha escribe como ausencia y no como cero.
  if (error) return { nombres: [], comprobantes: 0, comprado: null }
  return resumirCompras((data ?? []) as NombreResuelto[])
}

// ═══ LA CARTERA (canónico 22): LO COMPRADO Y EL TIPO, PARA TODAS LAS FILAS DE UNA VEZ ═══
//
// El canónico dibuja seis columnas: PROVEEDOR · RUBRO · TIPO · CUIT · COMPRADO 12 M · PAPELES.
// Tres de ellas tienen fuente y tres no, y la diferencia se resuelve acá, no en el componente:
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
}

/** El agrupado, separado de la consulta para poder probarlo sin base. */
export function agruparComprado(filas: NombreResuelto[]): Map<string, CompradoProveedor> {
  const mapa = new Map<string, CompradoProveedor>()
  for (const f of filas) {
    // `no_es_proveedor` marca un texto que NO es nadie: sumarlo le regalaría compras a un
    // proveedor que la resolución justamente descartó.
    if (!f.proveedor_id || f.estado !== 'vinculado') continue
    const previo = mapa.get(f.proveedor_id) ?? { comprobantes: 0, total: 0 }
    mapa.set(f.proveedor_id, {
      comprobantes: previo.comprobantes + Number(f.comprobantes ?? 0),
      total: previo.total + Number(f.total ?? 0),
    })
  }
  return mapa
}

export async function getCompradoDeLaCartera(
  supabase: SupabaseClient,
): Promise<ServiceResult<Map<string, CompradoProveedor>>> {
  const { data, error } = await supabase
    .from('proveedor_nombre_resuelto')
    .select('nombre_norm, comprobantes, total, estado, proveedor_id, proveedor_nombre, via, alias_id')
    .not('proveedor_id', 'is', null)
  // UN ERROR DE LECTURA NO ES UN MAPA VACÍO. Vacío se dibuja como «a ninguno se le compró nada»;
  // el error se dice y la columna queda sin afirmar nada.
  if (error) return { data: null, error: error.message }
  return { data: agruparComprado((data ?? []) as NombreResuelto[]), error: null }
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

export interface ResumenCartera {
  proveedores: number
  sinCuit: number
  subcontratistas: number
  /** `null` cuando ninguna fila visible tiene compras leídas: 0 diría que no se compró nada. */
  comprado: number | null
}

/** El pie de la cartera: cuenta lo que la pantalla MUESTRA, con el mismo dato con que la dibuja. */
export function resumirCartera(
  proveedores: Proveedor[],
  comprado: Map<string, CompradoProveedor> | null,
  subcontratistas: Set<string> | null,
): ResumenCartera {
  let total = 0
  let conDato = 0
  for (const p of proveedores) {
    const c = comprado?.get(p.id)
    if (c) { total += c.total; conDato += 1 }
  }
  return {
    proveedores: proveedores.length,
    sinCuit: proveedores.filter((p) => !p.cuit).length,
    subcontratistas: subcontratistas ? proveedores.filter((p) => subcontratistas.has(p.id)).length : 0,
    comprado: conDato === 0 ? null : total,
  }
}

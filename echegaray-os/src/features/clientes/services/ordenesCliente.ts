import type { SupabaseClient } from '@supabase/supabase-js'

// LAS ÓRDENES DEL CLIENTE, PARA LA PANTALLA — cuántas OC y cuántas OP cuelgan de cada obra.
//
// La tabla la escribe `orquestador/scripts/gmail-ordenes-clientes.mjs` bajando los adjuntos de la
// casilla del dueño. Acá sólo se CUENTAN, y se cuentan con la sesión de quien mira: la RLS de
// `cliente_orden` ya recorta —Dirección y Administración ven la cartera entera, el jefe de obra
// sólo su obra— así que esta función no vuelve a filtrar por rol. Filtrar dos veces esconde el día
// que una de las dos reglas cambie y dejen de coincidir.

/** Lo que la FILA necesita de una orden para identificarla: número, fecha e importe. No es el
 *  detalle del panel — es lo mínimo con lo que el dueño la reconoce sin abrir nada. */
export interface OrdenBreve {
  id: string
  tipo: string
  numero: string | null
  fecha: string | null
  importe: number | null
  obra_id: string | null
}

/** Clave para lo que no se pudo atribuir a una obra: cuelga del CLIENTE. */
export const SIN_OBRA = 'sin-obra'

export type OrdenesDeLaCartera = {
  /** obra_id → sus órdenes. */
  porObra: Map<string, OrdenBreve[]>
  /** cliente_id → TODAS las del cliente, con obra o sin ella. La fila del cliente muestra las que
   *  no tienen fila propia debajo, y eso no se puede decidir sin ver la lista entera. */
  porCliente: Map<string, OrdenBreve[]>
  /** `true` = la lectura falló. Sin esto, un error de permisos se dibuja idéntico a «no hay ninguna». */
  fallo: boolean
}

/** Una sola consulta para toda la cartera: la pantalla dibuja decenas de obras y una consulta por
 *  obra sería una cascada. Sólo las vigentes: la baja es lógica y una orden dada de baja no cuenta. */
export async function getOrdenesDeLaCartera(supabase: SupabaseClient): Promise<OrdenesDeLaCartera> {
  const { data, error } = await supabase
    .from('cliente_orden')
    .select('id, cliente_id, obra_id, tipo, numero, fecha, importe')
    .is('eliminado_en', null)

  const porObra = new Map<string, OrdenBreve[]>()
  const porCliente = new Map<string, OrdenBreve[]>()
  if (error || !data) return { porObra, porCliente, fallo: Boolean(error) }

  for (const fila of data as (OrdenBreve & { cliente_id: string })[]) {
    const { cliente_id: clienteId, ...orden } = fila
    porCliente.set(clienteId, [...(porCliente.get(clienteId) ?? []), orden])
    if (orden.obra_id) porObra.set(orden.obra_id, [...(porObra.get(orden.obra_id) ?? []), orden])
  }
  return { porObra, porCliente, fallo: false }
}

// ── LO QUE SE DIBUJA EN LA FILA: LA IDENTIDAD, NO EL CONTEO ─────────────────────────────────────
//
// Pedido del dueño (10/09/2026), mirando «OC ·4 · OP ·5»: «me tiene que demostrar claramente la
// OC/OP que corresponde a cada obra desde esa pantalla; necesito identificarlas con la obra a
// simple vista». Un conteo obliga a abrir el panel para saber CUÁL es; el número y la fecha no.
//
// LAS REGLAS DE NÚMERO SON LAS DEL `orquestador/lib/ordenes-cliente.mjs` (probadas contra los PDF
// reales en `ordenes-cliente.test.mjs`). Acá se repiten en TypeScript porque el núcleo del
// orquestador no se importa desde `src/`, y `ordenesCliente.test.ts` clava LOS MISMOS casos: si
// alguna de las dos cambia sola, un test se pone rojo.

/** «00002-00002162» → «2-2162». Une el mismo número escrito de tres formas distintas. */
function canonico(numero: string | null): string | null {
  const tramos = String(numero ?? '').match(/\d+/g)
  if (!tramos) return null
  const limpios = tramos.map((t) => t.replace(/^0+/, '') || '0').filter((t) => t !== '0')
  return limpios.length ? limpios.join('-') : null
}

/** Lo que se DIBUJA: el último tramo sin ceros. La celda tiene ~80px y «00002-00002162» los gasta
 *  sin decir nada que «2162» no diga. */
export function numeroCorto(numero: string | null): string | null {
  return canonico(numero)?.split('-').pop() ?? null
}

/** «05/08» — día y mes, sin año: todas las órdenes de la cartera son del ejercicio en curso y el
 *  año repetido veinte veces en la misma columna no distingue ninguna. El año está en el panel. */
export function diaMes(fecha: string | null): string | null {
  const m = String(fecha ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}` : null
}

const PREFIJO: Record<string, string> = { orden_compra: 'OC', orden_pago: 'OP' }

/**
 * El rótulo de UNA orden: «OC 2162 · 05/08». Sin número se escribe «s/n» y sin fecha se omite la
 * fecha — nunca se rellena con la fecha del mail ni con un guión que parezca un dato.
 */
export function rotuloOrden(o: Pick<OrdenBreve, 'tipo' | 'numero' | 'fecha'>): string {
  const partes = [`${PREFIJO[o.tipo] ?? 'Doc'} ${numeroCorto(o.numero) ?? 's/n'}`]
  const dm = diaMes(o.fecha)
  if (dm) partes.push(dm)
  return partes.join(' · ')
}

/** Una orden, con todos los papeles que la prueban. Un grupo = un rótulo en la fila. */
export type GrupoOrden = { clave: string; rotulo: string; ids: string[]; fecha: string | null }

/**
 * LO QUE ENTRA EN LA FILA. Agrupa por (tipo, número canónico) —la OC 2162 llegó en dos mails y es
 * UNA orden—, ordena por fecha descendente y devuelve las `max` más recientes más cuántas quedaron.
 *
 * Las que no tienen número NO se agrupan entre sí: dos papeles sin número no son el mismo papel.
 */
export function ordenesParaFila(
  ordenes: OrdenBreve[] | undefined, { max = 3 }: { max?: number } = {},
): { visibles: GrupoOrden[]; resto: number } {
  const porClave = new Map<string, GrupoOrden>()
  const grupos: GrupoOrden[] = []
  for (const o of ordenes ?? []) {
    const canon = canonico(o.numero)
    const clave = canon ? `${o.tipo}::${canon}` : `sola::${o.id}`
    const ya = canon ? porClave.get(clave) : undefined
    if (ya) {
      ya.ids.push(o.id)
      // La fecha del grupo es la MÁS VIEJA de sus papeles: la orden se emitió una vez, y la copia
      // que llegó después no la vuelve más nueva.
      if (o.fecha && (!ya.fecha || o.fecha < ya.fecha)) { ya.fecha = o.fecha; ya.rotulo = rotuloOrden(o) }
      continue
    }
    const g: GrupoOrden = { clave, rotulo: rotuloOrden(o), ids: [o.id], fecha: o.fecha }
    if (canon) porClave.set(clave, g)
    grupos.push(g)
  }
  // Las más nuevas primero y las sin fecha al final: una orden sin fecha no es la más vieja.
  grupos.sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''))
  return { visibles: grupos.slice(0, max), resto: Math.max(0, grupos.length - max) }
}

/**
 * LAS DEL CLIENTE QUE NO TIENEN FILA PROPIA DEBAJO: las que no se pudieron atribuir a ninguna obra
 * (`obra_id` null) y las que cuelgan de una obra que esta pantalla NO dibuja.
 *
 * El segundo caso no es teórico: `/clientes` lista sólo las obras `activa` (`homeCartera:132`), y
 * ocho de las once órdenes de Messina con obra cuelgan de obras CERRADAS. Mostrarlas sólo bajo su
 * obra sería esconderlas; decir que el cliente no tiene ninguna sería mentir.
 */
export function sinFilaPropia(delCliente: OrdenBreve[] | undefined, obrasVisibles: string[]): OrdenBreve[] {
  const visibles = new Set(obrasVisibles)
  return (delCliente ?? []).filter((o) => !o.obra_id || !visibles.has(o.obra_id))
}

// ── EL DETALLE, PARA EL PANEL ───────────────────────────────────────────────────────────────────
//
// Los conteos de arriba dicen CUÁNTAS hay; esto dice cuáles son. Se lee sólo cuando alguien abre el
// panel de una obra —no para las decenas de filas de la tabla— y otra vez con la sesión de quien
// mira: la RLS de `cliente_orden` es la cerradura, acá no se vuelve a filtrar por rol.

export interface OrdenDetallada {
  id: string
  tipo: string
  numero: string | null
  fecha: string | null
  importe: number | null
  moneda: string | null
  nombre_archivo: string
  emisor: string | null
  /** `remitente` lo prueba el dominio del mail; `texto` lo dedujo el OS. HECHO vs INFERENCIA. */
  atribucion: string
}

/**
 * LAS ÓRDENES DE UNA OBRA, o las que quedaron a nivel CLIENTE sin obra atribuida.
 *
 * `obraId === SIN_OBRA` NO es un obra_id inventado: es la clave con la que la tabla nombra el resto
 * del cliente, y acá se traduce a `obra_id is null`. Sin esa rama, las nueve órdenes de Messina que
 * el OS no pudo atribuir no tendrían panel donde abrirse.
 */
export async function getOrdenesDe(
  supabase: SupabaseClient,
  { clienteId, obraId }: { clienteId: string; obraId: string | null },
): Promise<OrdenDetallada[] | null> {
  let q = supabase
    .from('cliente_orden')
    .select('id, tipo, numero, fecha, importe, moneda, nombre_archivo, emisor, atribucion')
    .eq('cliente_id', clienteId)
    .is('eliminado_en', null)
  q = obraId === null ? q.is('obra_id', null) : q.eq('obra_id', obraId)
  // Las más nuevas primero, y las sin fecha al final: una orden sin fecha no es la más vieja, es
  // una que el PDF no fechó.
  const { data, error } = await q.order('fecha', { ascending: false, nullsFirst: false })
  if (error) return null
  return (data ?? []) as OrdenDetallada[]
}

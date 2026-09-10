import type { SupabaseClient } from '@supabase/supabase-js'
import { agruparPapeles, type Orden, type PapelCrudo, type PapelesDelCliente } from './papelesCliente.ts'

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
  moneda: string | null
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
    // `cita` y `nombre_archivo` NO son adorno: sin el nombre no se puede distinguir un comprobante
    // de retención —que lleva el número de SU orden de pago— de una orden de pago, y el total
    // cobrado de la cartera se duplicaría. La clasificación vive en `papelesCliente.clasePapel`.
    .select('id, cliente_id, obra_id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo')
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

// `Ret.` y no «OP»: un certificado de retención no es un pago. La fila sólo dibuja OC y OP
// (`ordenesParaFila` filtra), pero el rótulo también se usa en el panel y ahí tiene que decir la verdad.
const PREFIJO: Record<string, string> = { orden_compra: 'OC', orden_pago: 'OP', retencion: 'Ret.', factura: 'Factura' }

/** «$10.133.750» — SIN centavos y sin espacio. La fila tiene ~110 px para el rótulo entero y los
 *  centavos de una orden de ocho cifras no cambian ninguna decisión. El importe exacto, con sus
 *  decimales, está en el panel. `Intl` y no `pesos()`: este archivo es lógica pura y lo prueba
 *  `node --test`, que no monta componentes. */
export function importeCorto(importe: number | null, moneda: string | null = 'ARS'): string | null {
  if (importe === null) return null
  const n = Math.round(importe).toLocaleString('es-AR')
  return moneda === 'USD' ? `U$S ${n}` : `$${n}`
}

/**
 * El rótulo de UNA orden: «OC 2173 · 11/08 · $78.650.000». Sin número se escribe «s/n» y sin fecha
 * se omite la fecha — nunca se rellena con la fecha del mail ni con un guión que parezca un dato.
 *
 * EL IMPORTE SÓLO CON `veEconomia`, y por eso es un parámetro y no un `??`: el importe de una orden
 * de compra ES el precio de venta de la obra. El jefe de obra y el campo ven qué orden hay; cuánto
 * se cobra por ella, no. Un `false` de más deja la pantalla pobre; uno de menos publica el precio.
 */
export function rotuloOrden(
  o: Pick<OrdenBreve, 'tipo' | 'numero' | 'fecha'> & Partial<Pick<OrdenBreve, 'importe' | 'moneda'>>,
  { veEconomia = false }: { veEconomia?: boolean } = {},
): string {
  const partes = [`${PREFIJO[o.tipo] ?? 'Doc'} ${numeroCorto(o.numero) ?? 's/n'}`]
  const dm = diaMes(o.fecha)
  if (dm) partes.push(dm)
  const imp = veEconomia ? importeCorto(o.importe ?? null, o.moneda ?? null) : null
  if (imp) partes.push(imp)
  return partes.join(' · ')
}

/**
 * EL RÓTULO DE UNA ORDEN YA AGRUPADA: «OC 2256 · 02/09 · $12.100.000».
 *
 * `Orden` viene de `papelesCliente` —que es quien decide qué es una orden y cuántas hay—; acá sólo
 * se escribe. Es la MISMA función que arma el rótulo de la lista y el de la ficha: dos formatos
 * parecidos se separan en cuanto uno aprende algo.
 */
export function rotuloDe(o: Orden, { veEconomia = false }: { veEconomia?: boolean } = {}): string {
  return rotuloOrden(
    {
      tipo: o.clase === 'oc' ? 'orden_compra' : 'orden_pago',
      numero: o.numeroCanonico,
      fecha: o.fecha,
      importe: o.importe,
      moneda: o.moneda,
    },
    { veEconomia },
  )
}

/**
 * LOS PAPELES DE TODA LA CARTERA, AGRUPADOS POR CLIENTE.
 *
 * Una sola consulta y una sola agrupación: la lista dibuja decenas de obras y una lectura por obra
 * sería una cascada. La RLS de `cliente_orden` ya recorta por rol.
 */
export async function getPapelesDeLaCartera(
  supabase: SupabaseClient,
): Promise<{ porCliente: Map<string, PapelesDelCliente>; fallo: boolean }> {
  const { data, error } = await supabase
    .from('cliente_orden')
    .select('id, cliente_id, obra_id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo')
    .is('eliminado_en', null)

  const crudos = new Map<string, PapelCrudo[]>()
  if (error || !data) return { porCliente: new Map(), fallo: Boolean(error) }
  for (const fila of data as (PapelCrudo & { cliente_id: string })[]) {
    const { cliente_id: clienteId, ...papel } = fila
    crudos.set(clienteId, [...(crudos.get(clienteId) ?? []), papel])
  }
  const porCliente = new Map<string, PapelesDelCliente>()
  for (const [clienteId, papeles] of crudos) porCliente.set(clienteId, agruparPapeles(papeles))
  return { porCliente, fallo: false }
}

/**
 * LOS PAPELES DE UN CLIENTE, POR OBRA Y A NIVEL CLIENTE — lo que dibuja la ficha.
 *
 * `null` = la lectura falló. «No pude leerlos» nunca se dibuja como «no hay ninguno».
 */
export async function ordenesPorClienteYObra(
  supabase: SupabaseClient, clienteId: string,
): Promise<PapelesDelCliente | null> {
  const { data, error } = await supabase
    .from('cliente_orden')
    .select('id, obra_id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo, atribucion')
    .eq('cliente_id', clienteId)
    .is('eliminado_en', null)
  if (error) return null
  return agruparPapeles((data ?? []) as PapelCrudo[])
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
  /** La OC que este papel NOMBRA, en canónico. Una factura nuestra la trae; una OC no. */
  cita: string | null
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
    .select('id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo, emisor, atribucion')
    .eq('cliente_id', clienteId)
    .is('eliminado_en', null)
  q = obraId === null ? q.is('obra_id', null) : q.eq('obra_id', obraId)
  // Las más nuevas primero, y las sin fecha al final: una orden sin fecha no es la más vieja, es
  // una que el PDF no fechó.
  const { data, error } = await q.order('fecha', { ascending: false, nullsFirst: false })
  if (error) return null
  return (data ?? []) as OrdenDetallada[]
}

/**
 * LAS ÓRDENES DE UNA OBRA, PEDIDAS DESDE LA OBRA. Misma tabla, misma RLS, otra puerta.
 *
 * `getOrdenesDe` exige el cliente porque la pantalla de la cartera puede pedir «las del cliente sin
 * obra». La ficha de la obra no tiene esa pregunta: sabe la obra y nada más. Filtrar además por
 * cliente acá obligaría a leer el cliente de la obra sólo para repetir un dato que `obra_id` ya
 * determina — y el día que los dos no coincidieran, la ficha escondería la orden en silencio.
 *
 * NO SE VUELVE A FILTRAR POR ROL: la policy de `cliente_orden` ya recorta (el jefe de obra ve la
 * suya). Filtrar dos veces esconde el día que una de las dos reglas cambie.
 */
export async function getOrdenesDeObra(
  supabase: SupabaseClient, obraId: string,
): Promise<OrdenDetallada[] | null> {
  const { data, error } = await supabase
    .from('cliente_orden')
    .select('id, tipo, numero, fecha, importe, moneda, cita, nombre_archivo, emisor, atribucion')
    .eq('obra_id', obraId)
    .is('eliminado_en', null)
    .order('fecha', { ascending: false, nullsFirst: false })
  if (error) return null
  return (data ?? []) as OrdenDetallada[]
}

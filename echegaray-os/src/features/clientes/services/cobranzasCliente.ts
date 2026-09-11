// LA PESTAÑA COBRANZAS DEL CLIENTE — la lectura y las reglas, sin pantalla.
//
// ═══ EL PEDIDO (dueño, 10/09/2026 18:20) ═══
//
// «Necesito una sección exclusiva por cliente con todo lo que involucre cobranzas; quiero que
// lleves toda la información de la pestaña Cobranzas del Sheet Flujo de Fondos bien organizada por
// cliente (con OC si corresponde).»
//
// ═══ QUÉ DECIDE ESTE ARCHIVO Y QUÉ NO ═══
//
// NO decide qué está cobrado —lo dice `es_cobrada()` en la base—, ni de qué obra es cada fila —lo
// dice `cobranza_imputacion`—, ni cuándo está vencida —`plazo_cobro_dias()`, emisión + 30 días—.
// Todo eso llega resuelto en `public.cliente_cobranza` y acá sólo se AGRUPA y se SUMA.
//
// Lo que sí decide, y por eso vive suelto y probado: qué suma cada total, qué fila entra en cada
// recorte, y que una fila anulada se vea pero no se cuente.

import type { SupabaseClient } from '@supabase/supabase-js'
import { corto } from './papelesCliente.ts'

/** Una fila de la pestaña, tal como la publica `public.cliente_cobranza`. */
export interface FilaCobranza {
  cobranza_id: string
  /** `null` = la imputación no pudo atarla a una obra: es del cliente y va al grupo del final. */
  obra_id: string | null
  imputacion: string | null
  /** El número de fila DEL SHEET. Es lo que hace auditable cada renglón contra el archivo. */
  fila: string | null
  /** `B` = facturado (con comprobante) · `N` = sin comprobante. */
  categoria: string | null
  fecha_emision: string | null
  factura: string | null
  numero_comprobante: string | null
  concepto: string | null
  orden_compra: string | null
  monto_neto: number | null
  iva: number | null
  retenciones: number | null
  total_bruto: number | null
  estado: string | null
  esta_cobrada: boolean
  esta_cancelada: boolean
  esta_vencida: boolean
  fecha_cobro: string | null
  forma_cobro: string | null
  /**
   * EL PAPEL QUE RESPALDA LA FILA cuando no hay factura (`cobranza_comprobante`, 11/09/2026): la
   * nota firmada de Rodrigo por los tres cobros en efectivo de Messina. Opcionales porque la vista
   * los publica sólo desde esa migración y una fila sin respaldo los trae en `null`.
   */
  respaldo_drive_id?: string | null
  respaldo_titulo?: string | null
  respaldo_nota?: string | null
}

/** Lo que la vista publica desde siempre. Sin esto no hay pantalla. */
const COLUMNAS_BASE = 'cobranza_id, obra_id, imputacion, fila, categoria, fecha_emision, factura, numero_comprobante, concepto, orden_compra, monto_neto, iva, retenciones, total_bruto, estado, esta_cobrada, esta_cancelada, esta_vencida, fecha_cobro, forma_cobro'
/** El papel que respalda una fila sin factura. Lo agrega la migración `20260911T0920`. */
const COLUMNAS_RESPALDO = 'respaldo_drive_id, respaldo_titulo, respaldo_nota'
const COLUMNAS = `${COLUMNAS_BASE}, ${COLUMNAS_RESPALDO}`

/** `42703` = «undefined_column» de Postgres: la vista todavía no tiene la columna que se pidió. */
export const COLUMNA_INEXISTENTE = '42703'

/**
 * TODAS LAS FILAS DEL CLIENTE, EN UNA CONSULTA.
 *
 * `null` = no se pudo leer —y la pantalla lo dice con palabras—, que no es lo mismo que «este
 * cliente no tiene cobranzas». Ordenadas por fecha de emisión, que es el orden del Sheet y el único
 * que no se mueve: la fecha de cobro se re-tipea cada vez que un cobro se posterga.
 */
export async function getCobranzasDelCliente(
  supabase: SupabaseClient, clienteId: string,
): Promise<FilaCobranza[] | null> {
  const leer = (columnas: string) => supabase
    .from('cliente_cobranza')
    .select(columnas)
    .eq('cliente_id', clienteId)
    .order('fecha_emision', { ascending: true })

  let { data, error } = await leer(COLUMNAS)
  // ═══ UN ENRIQUECIMIENTO QUE FALTA NO PUEDE BORRAR LA PANTALLA (11/09/2026) ═══
  //
  // Medido: con la migración `20260911T0920` en el repo y NO aplicada, la vista no tiene
  // `respaldo_drive_id` y el `select` entero devuelve 42703 — la solapa completa de un cliente con
  // veinticuatro cobranzas se dibujaba como «no pude leer las cobranzas». El respaldo es un papel
  // opcional que decora tres filas; perder la pestaña por él es desproporcionado. Se reintenta sin
  // esas columnas y las filas llegan con el respaldo en `undefined`, que es lo que su tipo declara.
  //
  // NO es un silencio: `null` sigue siendo `null` si la lectura base también falla, y la pantalla
  // sigue diciendo con palabras que la consulta falló.
  if (error?.code === COLUMNA_INEXISTENTE) ({ data, error } = await leer(COLUMNAS_BASE))
  if (error) return null
  return (data ?? []) as unknown as FilaCobranza[]
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LOS TOTALES — qué suma cada uno, dicho una sola vez
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface TotalesCobranza {
  /** Lo FACTURADO: las filas `B`, que son las que tienen comprobante. Criterio DEVENGADO. */
  facturado: number | null
  /** Lo COBRADO, total con IVA. Criterio PERCIBIDO: sólo lo que ya entró. */
  cobrado: number | null
  /** Lo que falta cobrar: pendiente de verdad, sin las anuladas. */
  pendiente: number | null
  /** De lo pendiente, lo que ya pasó su plazo (emisión + 30 días). */
  vencido: number | null
  /** Cuántas filas se sumaron —sin las anuladas—, para que un total diga de dónde sale. */
  filas: number
  /** Cuántas quedaron afuera por anuladas. Se dice: una fila que no se ve ni se cuenta desaparece. */
  anuladas: number
}

/**
 * SUMA QUE NO INVENTA: sin ninguna fila que aporte, el total es `null` y no cero. «Nadie facturó
 * nada» y «no hay ninguna fila con comprobante» son dos afirmaciones distintas sobre un cliente.
 */
function suma(valores: (number | null)[]): number | null {
  const con = valores.filter((v): v is number => v != null)
  return con.length === 0 ? null : con.reduce((a, b) => a + b, 0)
}

/** UNA FILA ANULADA (`CANCELAR`) SE VE PERO NO SE CUENTA. Esconderla es cómo un total deja de
 *  cuadrar contra el Sheet sin que nadie sepa por qué. */
export function totalesDeCobranzas(filas: readonly FilaCobranza[]): TotalesCobranza {
  const vivas = filas.filter((f) => !f.esta_cancelada)
  const pendientes = vivas.filter((f) => !f.esta_cobrada)
  return {
    facturado: suma(vivas.filter((f) => f.categoria === 'B').map((f) => f.total_bruto)),
    cobrado: suma(vivas.filter((f) => f.esta_cobrada).map((f) => f.total_bruto)),
    pendiente: suma(pendientes.map((f) => f.total_bruto)),
    vencido: suma(vivas.filter((f) => f.esta_vencida).map((f) => f.total_bruto)),
    filas: vivas.length,
    anuladas: filas.length - vivas.length,
  }
}

/** EL PRÓXIMO COBRO ESPERADO: la fecha pendiente más cercana, con su medio y su importe. */
export interface ProximoCobroDelCliente {
  fecha: string
  medio: string | null
  importe: number | null
}

export function proximoCobro(filas: readonly FilaCobranza[]): ProximoCobroDelCliente | null {
  const candidatas = filas
    .filter((f) => !f.esta_cancelada && !f.esta_cobrada && f.fecha_cobro)
    .sort((a, b) => (a.fecha_cobro ?? '').localeCompare(b.fecha_cobro ?? ''))
  const primera = candidatas[0]
  if (!primera?.fecha_cobro) return null
  // TODAS LAS DEL MISMO DÍA, no sólo una: el 18/09 San Francisco cobra tres cuotas distintas y
  // publicar la primera diría que ese día entra un tercio de lo que entra.
  const delDia = candidatas.filter((f) => f.fecha_cobro === primera.fecha_cobro)
  return {
    fecha: primera.fecha_cobro,
    medio: primera.forma_cobro?.trim() || null,
    importe: suma(delDia.map((f) => f.total_bruto)),
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LOS GRUPOS — un trabajo por grupo, y las filas sin trabajo al final
// ─────────────────────────────────────────────────────────────────────────────────────────────

export interface GrupoDeCobranzas {
  /** `null` = el grupo de las filas que la imputación no pudo atar a una obra. */
  obra_id: string | null
  titulo: string
  filas: FilaCobranza[]
  totales: TotalesCobranza
}

/**
 * ═══ EL GRUPO SIN OBRA VA AL FINAL Y NUNCA SE ESCONDE ═══
 *
 * Son los saldos que Cobranzas anota contra el CLIENTE —«Saldo obras San Francisco, cuota 1 de 4»,
 * $47,6 M— y las filas que ningún papel ató a una obra. Esconderlas haría que la suma de los grupos
 * no cuadre con la cabecera, que es exactamente la forma en que un total deja de ser auditable.
 *
 * EL ORDEN DE LOS GRUPOS ES EL DE LAS OBRAS QUE SE LE PASAN —el mismo de la ficha— y no el alfabético
 * ni el de aparición: dos listas del mismo cliente ordenadas distinto se leen como dos clientes.
 */
export function agruparCobranzas(
  filas: readonly FilaCobranza[],
  obras: readonly { obra_id: string; nombre: string }[],
): GrupoDeCobranzas[] {
  const grupos: GrupoDeCobranzas[] = []
  for (const o of obras) {
    const suyas = filas.filter((f) => f.obra_id === o.obra_id)
    if (suyas.length === 0) continue
    grupos.push({ obra_id: o.obra_id, titulo: o.nombre, filas: suyas, totales: totalesDeCobranzas(suyas) })
  }
  const conocidas = new Set(obras.map((o) => o.obra_id))
  const sueltas = filas.filter((f) => !f.obra_id || !conocidas.has(f.obra_id))
  if (sueltas.length > 0) {
    grupos.push({
      obra_id: null,
      titulo: 'Sin obra atribuida',
      filas: sueltas,
      totales: totalesDeCobranzas(sueltas),
    })
  }
  return grupos
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LOS RECORTES — los mismos chips de todo el módulo
// ─────────────────────────────────────────────────────────────────────────────────────────────

export const RECORTES_COBRANZA = ['todo', 'pendiente', 'cobrado', 'b', 'n'] as const
export type RecorteCobranza = (typeof RECORTES_COBRANZA)[number]

export const esRecorteCobranza = (v: string | undefined): v is RecorteCobranza =>
  !!v && (RECORTES_COBRANZA as readonly string[]).includes(v)

/** El recorte NO toca las anuladas: siguen fuera de todo total y visibles en «Todo». */
export function recortar(
  filas: readonly FilaCobranza[], recorte: RecorteCobranza,
): FilaCobranza[] {
  switch (recorte) {
    case 'pendiente': return filas.filter((f) => !f.esta_cobrada && !f.esta_cancelada)
    case 'cobrado': return filas.filter((f) => f.esta_cobrada)
    case 'b': return filas.filter((f) => f.categoria === 'B')
    case 'n': return filas.filter((f) => f.categoria === 'N')
    default: return [...filas]
  }
}

/** «FA 230» · «FA 01-00000228» · `null` cuando la fila no tiene comprobante (las `N`). */
export function comprobanteDe(f: FilaCobranza): string | null {
  const tipo = f.factura?.trim()
  const numero = f.numero_comprobante?.trim()
  if (!tipo && !numero) return null
  return [tipo, numero].filter(Boolean).join(' ')
}

/** El estado que se dibuja. UNA palabra por fila: la que manda es la peor que le corresponde. */
export type EstadoFila = 'cobrado' | 'vencido' | 'pendiente' | 'anulado'

export function estadoDe(f: FilaCobranza): EstadoFila {
  if (f.esta_cancelada) return 'anulado'
  if (f.esta_cobrada) return 'cobrado'
  return f.esta_vencida ? 'vencido' : 'pendiente'
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LAS TRES SECCIONES — el rediseño del 11/09/2026
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// «Es realmente muy difícil de entender lo que hiciste en la sección Cobranzas dentro de Clientes»
// (dueño, 11/09/2026). La causa medida: la pantalla mezclaba en una sola lista lo que ya entró con
// lo que falta cobrar, y el encabezado de cada trabajo publicaba tres totales con DENOMINADORES
// DISTINTOS —facturado sólo B, cobrado B+N, pendiente B+N— que por construcción no podían cerrar.
// Playón de Azufre decía «facturado $78,0 M» arriba de renglones que sumaban $114,9 M.
//
// La corrección es estructural, no cosmética: primero se PARTE la pestaña en tres poblaciones que
// no se pisan, y recién adentro de cada una se agrupa por trabajo. Así el total de un grupo es,
// siempre, la suma de los renglones que tiene abajo.

export type SeccionCobranza = 'por-cobrar' | 'cobrado' | 'anulada'

/** A qué sección pertenece una fila. Son EXCLUYENTES: toda fila cae en una y sólo una. */
export function seccionDe(f: FilaCobranza): SeccionCobranza {
  if (f.esta_cancelada) return 'anulada'
  return f.esta_cobrada ? 'cobrado' : 'por-cobrar'
}

export interface SeccionesDeCobranza {
  porCobrar: FilaCobranza[]
  cobrado: FilaCobranza[]
  anuladas: FilaCobranza[]
}

/** LA PARTICIÓN. Ninguna fila se duplica y ninguna se pierde — lo prueba su test. */
export function partirEnSecciones(filas: readonly FilaCobranza[]): SeccionesDeCobranza {
  return {
    porCobrar: filas.filter((f) => seccionDe(f) === 'por-cobrar'),
    cobrado: filas.filter((f) => seccionDe(f) === 'cobrado'),
    anuladas: filas.filter((f) => seccionDe(f) === 'anulada'),
  }
}

/**
 * EL ORDEN DE LA AGENDA: por fecha de cobro.
 *
 * `asc` en lo que falta cobrar —lo que entra primero, primero— y `desc` en lo cobrado —lo último
 * que entró, arriba—. Una fila SIN fecha de cobro va al final en los dos sentidos: no es «la más
 * vieja», es una fila sin previsión, y ordenarla como si tuviera fecha inventaría un lugar.
 */
export function ordenarPorCobro(
  filas: readonly FilaCobranza[], sentido: 'asc' | 'desc',
): FilaCobranza[] {
  const signo = sentido === 'asc' ? 1 : -1
  return [...filas].sort((a, b) => {
    if (!a.fecha_cobro && !b.fecha_cobro) return 0
    if (!a.fecha_cobro) return 1
    if (!b.fecha_cobro) return -1
    return signo * a.fecha_cobro.localeCompare(b.fecha_cobro)
  })
}

/**
 * LA SUMA DE LOS RENGLONES QUE SE ESTÁN VIENDO.
 *
 * Es la única aritmética que puede escribirse en el encabezado de un grupo: el total de un bloque
 * tiene que ser la suma de sus filas visibles, sin excepciones ni denominadores escondidos.
 */
export function totalDeFilas(filas: readonly FilaCobranza[]): number | null {
  return suma(filas.map((f) => f.total_bruto))
}

/**
 * LOS DOS CIRCUITOS, SEPARADOS Y QUE CIERRAN: `b + n` es exactamente `totalDeFilas`.
 *
 * `B` = con comprobante (el circuito facturado, con IVA) · `N` = sin comprobante. Se dicen porque
 * son dos conversaciones distintas con el mismo cliente — pero NUNCA en ámbar: una fila N no es un
 * problema, es otro circuito.
 */
export function totalPorCircuito(filas: readonly FilaCobranza[]): { b: number | null; n: number | null } {
  return {
    b: suma(filas.filter((f) => f.categoria === 'B').map((f) => f.total_bruto)),
    n: suma(filas.filter((f) => f.categoria !== 'B').map((f) => f.total_bruto)),
  }
}

/** De un conjunto de filas, lo que ya pasó su plazo. `null` = ninguna, y entonces no se dibuja. */
export function vencidoDeFilas(filas: readonly FilaCobranza[]): number | null {
  return suma(filas.filter((f) => f.esta_vencida && !f.esta_cancelada).map((f) => f.total_bruto))
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LA COLUMNA «ORDEN DE COMPRA» DEL SHEET — un número Y una condición comercial en el mismo campo
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// La columna H de la pestaña NO es un número de OC: es texto libre donde conviven las dos cosas.
//
//   «00002-00002226 · cta. cte. 15 días»                        → OC 2226 + la condición
//   «Resto 50% s/ contrato U$S 63.000 + IVA — cert. quincenal 3/9» → sin OC, sólo la condición
//   «…Playon de Azufre. Cargar OC»                              → sin OC, y lo DICE
//
// Dibujarlas juntas en una celda angosta fue lo que produjo los «…» que escondían la OC y el tipo
// de cambio. Se separan: el número va a su columna —angosto, alineado, comparable— y la condición
// va como segunda línea del concepto, en texto, legible entera.

const PATRON_OC = /(?:\bOC\s*)?(\d{1,5}-\d{4,9})/i

export interface OrdenDeFila {
  /** El número corto —«2226»—, o `null` cuando el campo no trae ninguno. */
  oc: string | null
  /** Lo que queda del campo una vez sacado el número: la condición comercial, o `null`. */
  condicion: string | null
}

/** El doble espacio del Sheet no es un dato: se normaliza SIEMPRE, con número o sin él. */
const limpiar = (t: string) => t
  .replace(/\s+/g, ' ')
  .replace(/^[\s·—–-]+/, '')
  .replace(/[\s·—–-]+$/, '')
  .trim()

export function ordenDeLaFila(raw: string | null | undefined): OrdenDeFila {
  const texto = String(raw ?? '').trim()
  if (!texto) return { oc: null, condicion: null }
  const m = PATRON_OC.exec(texto)
  if (!m) return { oc: null, condicion: limpiar(texto) || null }
  const resto = limpiar(texto.slice(0, m.index) + texto.slice(m.index + m[0].length))
  return { oc: corto(m[1]), condicion: resto || null }
}

/**
 * ¿ESTE RENGLÓN ES EL IVA DE OTRO?
 *
 * La pestaña anota el IVA de una factura como una fila propia cuando se cobra por separado —«IVA de
 * Factura 220», cobrado el 19/08 contra el neto cobrado el 31/07—. Es un cobro real y no se
 * fusiona con nada; lo que cambia es cómo se lee: se dibuja colgado de su factura con «↳», para
 * que nadie lo cuente como una venta más.
 */
export function esRenglonDeIva(concepto: string | null | undefined): boolean {
  return /^\s*iva\s+(?:de|del|s\/)\b/i.test(String(concepto ?? ''))
}

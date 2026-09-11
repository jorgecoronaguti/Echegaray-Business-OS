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

const COLUMNAS = 'cobranza_id, obra_id, imputacion, fila, categoria, fecha_emision, factura, numero_comprobante, concepto, orden_compra, monto_neto, iva, retenciones, total_bruto, estado, esta_cobrada, esta_cancelada, esta_vencida, fecha_cobro, forma_cobro, respaldo_drive_id, respaldo_titulo, respaldo_nota'

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
  const { data, error } = await supabase
    .from('cliente_cobranza')
    .select(COLUMNAS)
    .eq('cliente_id', clienteId)
    .order('fecha_emision', { ascending: true })
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

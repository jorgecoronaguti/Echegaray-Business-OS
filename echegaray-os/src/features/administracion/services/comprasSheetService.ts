// LO QUE LA PANTALLA 24 LE PREGUNTA A LA RÉPLICA DE LA PESTAÑA COMPRAS.
//
// ═══ SE TRAE LA PESTAÑA ENTERA EN UN VIAJE, Y ES UNA DECISIÓN ═══
//
// Son 882 filas hoy y crecen ~40 por mes. Traerlas todas cuesta un viaje y ~250 KB, y a cambio los
// conteos de los chips y los totales del pie salen de la POBLACIÓN ENTERA en vez de la página que se
// está mirando. Contarlos sobre lo traído diría «400 comprobantes» para siempre y el número de
// arriba dejaría de ser el de la empresa — que es exactamente el defecto que la pantalla anterior ya
// había corregido pidiendo conteos aparte.
//
// El día que sean 10.000 esto se parte en un `count` por chip. Hasta entonces, partirlo sería pagar
// cuatro viajes para ahorrar 200 KB.
//
// ═══ EL TOPE SE DICE ═══
//
// Si alguna vez recorta, la pantalla lo declara. Un control que no pudo mirar todo no puede afirmar
// que no hay nada más: seis faltantes falsos ya costaron una investigación entera en este repo.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: string }

/** El techo de la lectura. Hoy no recorta nada (882 filas); existe para el año que viene. */
export const TOPE = 3000

export interface CompraSheet {
  fila: number
  sheet_id: number | null
  clave: string | null
  fecha: string | null
  proveedor: string | null
  tipo: string | null
  comprobante: string | null
  concepto: string | null
  detalle_obra: string | null
  obra_texto: string | null
  unidad_negocio: string | null
  categoria: string | null
  importe: number | null
  iva: number | null
  total: number | null
  estado: string | null
  estado_pago: string | null
  tipo_pago: string | null
  modalidad: string | null
  fecha_prevista: string | null
  monto_pagado: number | null
  saldo_pendiente: number | null
  cuit: string | null
  anulada: boolean
}

export interface Adjunto {
  id: string
  compra_clave: string | null
  fila_compras: number | null
  storage_path: string
  nombre: string
  media_type: string
  bytes: number
  origen: string
  vinculado_por: string
  confianza: number | null
  subido_at: string | null
}

/** Una fila de la pestaña con su papel al lado. `adjuntos` vacío = no hay comprobante guardado. */
export interface FilaConPapel extends CompraSheet {
  adjuntos: Adjunto[]
  tiene_adjunto: boolean
}

const COLUMNAS = [
  'fila', 'sheet_id', 'clave', 'fecha', 'proveedor', 'tipo', 'comprobante', 'concepto',
  'detalle_obra', 'obra_texto', 'unidad_negocio', 'categoria', 'importe', 'iva', 'total',
  'estado', 'estado_pago', 'tipo_pago', 'modalidad', 'fecha_prevista', 'monto_pagado',
  'saldo_pendiente', 'cuit', 'anulada',
].join(', ')

const COLUMNAS_ADJUNTO = [
  'id', 'compra_clave', 'fila_compras', 'storage_path', 'nombre', 'media_type', 'bytes',
  'origen', 'vinculado_por', 'confianza', 'subido_at',
].join(', ')

/**
 * LA PESTAÑA ENTERA CON SUS PAPELES.
 *
 * El cruce se hace por CLAVE y, si el adjunto no la tiene, por FILA — en ese orden. La clave es
 * estable; la fila es una posición que se mueve al insertar un renglón arriba. Usar la fila primero
 * colgaría el papel de la factura equivocada el día que el dueño inserte una línea.
 */
export async function getComprasSheet(supabase: SupabaseClient): Promise<ServiceResult<{
  filas: FilaConPapel[]
  truncado: boolean
}>> {
  const [compras, adjuntos] = await Promise.all([
    supabase.from('compra_sheet').select(COLUMNAS).order('fecha', { ascending: false, nullsFirst: false })
      .order('fila', { ascending: false }).limit(TOPE),
    supabase.from('compra_adjunto').select(COLUMNAS_ADJUNTO),
  ])
  if (compras.error) return { data: null, error: compras.error.message }
  // UN ADJUNTO QUE NO SE PUDO LEER NO PUEDE VACIAR LA LISTA DE COMPRAS. La pestaña es el dato
  // principal; el papel es el respaldo. Si la tabla de adjuntos falla, se muestran las compras sin
  // papel — y como `tiene_adjunto` queda en false, el chip «sin comprobante» lo va a gritar.
  const papeles = (adjuntos.data ?? []) as unknown as Adjunto[]
  const porClave = new Map<string, Adjunto[]>()
  const porFila = new Map<number, Adjunto[]>()
  for (const a of papeles) {
    if (a.compra_clave) {
      const l = porClave.get(a.compra_clave) ?? []; l.push(a); porClave.set(a.compra_clave, l)
    } else if (a.fila_compras != null) {
      const l = porFila.get(a.fila_compras) ?? []; l.push(a); porFila.set(a.fila_compras, l)
    }
  }
  const filas = ((compras.data ?? []) as unknown as CompraSheet[]).map((c) => {
    const suyos = (c.clave ? porClave.get(c.clave) : null) ?? porFila.get(c.fila) ?? []
    return { ...c, adjuntos: suyos, tiene_adjunto: suyos.length > 0 }
  })
  return { data: { filas, truncado: filas.length >= TOPE }, error: null }
}

/**
 * LOS PAPELES QUE NO ENCONTRARON SU FILA. Es la sub-vista de trabajo: cada uno de éstos es un gasto
 * cuyo respaldo está guardado pero colgado de nada, y sólo una persona puede decir de cuál es.
 */
export async function getAdjuntosSueltos(supabase: SupabaseClient): Promise<ServiceResult<Adjunto[]>> {
  const { data, error } = await supabase
    .from('compra_adjunto').select(COLUMNAS_ADJUNTO)
    .is('compra_clave', null).order('subido_at', { ascending: false }).limit(500)
  if (error) return { data: null, error: error.message }
  return { data: (data ?? []) as unknown as Adjunto[], error: null }
}

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
// ═══ LO QUE SE TRAE NO ES TODO LO QUE SE MUESTRA (08/09/2026) ═══
//
// Se leen las 955 filas y se devuelven las 803 que son COMPRAS DE OBRA. El corte lo decide
// `comprasDeObra.ts` y su motivo está escrito ahí: la pestaña es el ledger de todo lo que sale de
// la empresa —impuestos, cuota del prendario, quincena— y esta pantalla responde otra pregunta.
// Las 152 que salen se cuentan y viajan en `fuera` para que el pie las declare.
//
// ═══ EL TOPE SE DICE ═══
//
// Si alguna vez recorta, la pantalla lo declara. Un control que no pudo mirar todo no puede afirmar
// que no hay nada más: seis faltantes falsos ya costaron una investigación entera en este repo.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  separarComprasDeObra, type Corte, type MotivoFuera,
} from './comprasDeObra.ts'
import { ordenarPorCarga, papelesDeCadaFila } from './comprasSheet.ts'

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
  /**
   * EL TRAMO DE VENCIMIENTO YA CALCULADO POR EL SHEET («1 · Vencido», «2 · Vence esta semana»…).
   * Se trae y no se deriva de `fecha_prevista` contra hoy: dos definiciones de «esto está vencido»
   * se contradicen el día que el criterio del Sheet cambie. El filtro de vencimiento lo usa.
   */
  tramo_vencimiento: string | null
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
  'estado', 'estado_pago', 'tipo_pago', 'modalidad', 'fecha_prevista', 'tramo_vencimiento', 'monto_pagado',
  'saldo_pendiente', 'cuit', 'anulada',
].join(', ')

const COLUMNAS_ADJUNTO = [
  'id', 'compra_clave', 'fila_compras', 'storage_path', 'nombre', 'media_type', 'bytes',
  'origen', 'vinculado_por', 'confianza', 'subido_at',
].join(', ')

/**
 * LA PESTAÑA ENTERA CON SUS PAPELES.
 *
 * El cruce se hace SÓLO POR CLAVE (`papelesDeCadaFila`). El número de renglón nunca vincula: es una
 * posición que se mueve al insertar una línea arriba, y usarlo de respaldo ya colgó el comprobante
 * de otro CUIT en la fila 932 (10/09/2026). Que la clave del papel y la de la fila sean la misma es
 * responsabilidad del sync, que las vuelve a conciliar cada vez que reescribe el espejo.
 */
export interface ListadoCompras {
  /** SÓLO las compras de obra: civil, mantenimiento y estructura. */
  filas: FilaConPapel[]
  truncado: boolean
  /** Cuántas filas de la pestaña NO son compras de obra, por motivo. La pantalla lo declara. */
  fuera: Record<MotivoFuera, number>
  /** Las que entraron con un rubro no clasificado. Se muestran y se nombran. */
  dudosas: FilaConPapel[]
}

export async function getComprasSheet(supabase: SupabaseClient): Promise<ServiceResult<ListadoCompras>> {
  const [compras, adjuntos] = await Promise.all([
    // ORDEN DE CARGA, NO FECHA DE FACTURA — y acá importa por el TOPE, no por lo que se ve.
    // Si la lectura alguna vez recorta, tiene que quedarse con lo ÚLTIMO QUE ENTRÓ: ordenando por
    // fecha, un comprobante cargado hoy con fecha vieja sería justo lo que el tope descarta. El
    // orden final lo impone `ordenarPorCarga` más abajo; acá se pide el mismo para que el recorte
    // de la base y el de la pantalla no puedan discrepar.
    supabase.from('compra_sheet').select(COLUMNAS).order('fila', { ascending: false })
      .order('fecha', { ascending: false, nullsFirst: false }).limit(TOPE),
    supabase.from('compra_adjunto').select(COLUMNAS_ADJUNTO),
  ])
  if (compras.error) return { data: null, error: compras.error.message }
  // UN ADJUNTO QUE NO SE PUDO LEER NO PUEDE VACIAR LA LISTA DE COMPRAS. La pestaña es el dato
  // principal; el papel es el respaldo. Si la tabla de adjuntos falla, se muestran las compras sin
  // papel — y como `tiene_adjunto` queda en false, el chip «sin comprobante» lo va a gritar.
  const papeles = (adjuntos.data ?? []) as unknown as Adjunto[]
  const leidas = papelesDeCadaFila((compras.data ?? []) as unknown as CompraSheet[], papeles)
  // EL CORTE SE HACE ACÁ, EN EL SERVIDOR, Y NO EN LA CONSULTA.
  //
  // Podría escribirse como un `.not('unidad_negocio', 'in', ...)` y ahorrar el viaje de 152 filas,
  // pero entonces «qué es una compra de obra» estaría definido en dos lugares —el SQL de este
  // archivo y `comprasDeObra.ts`— y el día que el dueño agregue un rubro habría que acordarse de
  // los dos. Una definición, un archivo. Lo que NO se hace es mandarlas al navegador para que las
  // esconda el front: los conteos de los chips y el total del pie salen de esta población ya
  // recortada, y nunca viaja al cliente una fila que la pantalla no va a mostrar.
  // EL ORDEN LO DECIDE UNA FUNCIÓN PURA Y NO LA CONSULTA. La regla —última cargada arriba— vive en
  // `comprasSheet.ts`, se prueba sin base y no cambia si mañana esta lectura pasa por una vista, un
  // caché o un `count`. La consulta pide el mismo orden por el tope, no para definirlo.
  const corte: Corte<FilaConPapel> = separarComprasDeObra(ordenarPorCarga(leidas))
  return {
    data: {
      filas: corte.deObra,
      // EL TOPE SE MIDE SOBRE LO LEÍDO, no sobre lo que quedó. Si la base devolvió 3.000 filas y el
      // corte dejó 2.400, la lectura se truncó igual y hay que decirlo: medir el tope después del
      // filtro apagaría el aviso justo cuando más falta hace.
      truncado: leidas.length >= TOPE,
      fuera: corte.fuera,
      dudosas: corte.dudosas,
    },
    error: null,
  }
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

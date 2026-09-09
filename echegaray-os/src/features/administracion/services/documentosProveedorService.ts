// LEER LOS DOCUMENTOS DE UN PROVEEDOR — la consulta, separada de las reglas.
//
// `proveedor_documento` es lo que alguien de Administración SUBIÓ contra esta ficha —contrato de
// subcontrato, póliza, habilitación, un video de una entrega— y no tiene nada que ver con
// `proveedor_papel`, que DERIVA los comprobantes de sus compras. Dos conceptos distintos, dos
// lecturas distintas: mezclarlos haría que dar de baja un contrato pareciera borrar una factura.
//
// LO QUE ESTA LECTURA VE NO DEPENDE DE LA OBRA. La policy es `es_administracion()`: Dirección,
// Administración y jefe de obra ven los mismos documentos. No hay recorte por obra porque un
// contrato no cuelga de una obra — cuelga de la relación con el proveedor.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '../types'
import type { DocumentoProveedor } from './documentosProveedor'

/** Tope de documentos listados. Si se alcanza, la pantalla lo dice en vez de recortar en silencio. */
export const TOPE_DOCUMENTOS = 100

export interface DocumentosLeidos {
  documentos: DocumentoProveedor[]
  /** `true` cuando se llegó al tope y hay más documentos que los listados. */
  truncado: boolean
}

type FilaCruda = Omit<DocumentoProveedor, 'subido_por_nombre'>

/**
 * LOS DOCUMENTOS VIGENTES DE UN PROVEEDOR, el último arriba.
 *
 * ═══ EL NOMBRE DE QUIEN SUBIÓ ES UNA SEGUNDA CONSULTA, Y SU FALLA NO ES «NADIE» ═══
 *
 * `subido_por` apunta a `auth.users`, que PostgREST no expone: no hay embed posible. Se resuelve
 * contra `perfiles` en un segundo viaje con los uid que ya se trajeron. Si ese viaje falla, el
 * nombre queda en `null` y la pantalla escribe «sin identificar» — nunca un nombre vacío, que se
 * leería como que el documento no tiene dueño.
 *
 * Los dados de baja NO se traen. La fila queda en la base para saber que existió y quién lo sacó;
 * listarlos tachados en la ficha convertiría el bloque en un historial cuando lo que se pregunta
 * parado ahí es «qué papeles tengo hoy de este proveedor».
 */
export async function getDocumentosDelProveedor(
  supabase: SupabaseClient,
  proveedorId: string,
): Promise<ServiceResult<DocumentosLeidos>> {
  const { data, error } = await supabase
    .from('proveedor_documento')
    .select('id, nombre_archivo, tipo_mime, tamano_bytes, categoria, descripcion, creado_en, subido_por')
    .eq('proveedor_id', proveedorId)
    .is('eliminado_en', null)
    .order('creado_en', { ascending: false })
    .limit(TOPE_DOCUMENTOS + 1)
  if (error) return { data: null, error: error.message }

  const filas = (data ?? []) as unknown as FilaCruda[]
  const truncado = filas.length > TOPE_DOCUMENTOS
  const visibles = truncado ? filas.slice(0, TOPE_DOCUMENTOS) : filas
  const nombres = await nombresDeQuienesSubieron(supabase, visibles)

  return {
    data: {
      documentos: visibles.map((d) => ({ ...d, subido_por_nombre: nombres.get(d.subido_por) ?? null })),
      truncado,
    },
    error: null,
  }
}

async function nombresDeQuienesSubieron(
  supabase: SupabaseClient, filas: readonly FilaCruda[],
): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const uids = [...new Set(filas.map((d) => d.subido_por))]
  if (!uids.length) return nombres
  const { data } = await supabase.from('perfiles').select('id, nombre').in('id', uids)
  for (const p of data ?? []) {
    if (p.nombre) nombres.set(String(p.id), String(p.nombre))
  }
  return nombres
}

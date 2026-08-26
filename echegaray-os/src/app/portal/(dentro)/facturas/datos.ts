import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AccesoDelPortal } from '../../permisos'
import { alcanzaLaObra } from '../../permisos'
import { recibosDelPortal, type FilaRecibo, type ReciboDelPortal } from '../../recibos'

// LO QUE LA PANTALLA DE FACTURAS LE PREGUNTA A `public.recibo_cliente`.
//
// Vive acá y no en `datosObra.ts` porque es de UNA pantalla: el cronograma y Pagos no muestran el
// papel, muestran el compromiso.

export type LecturaDeRecibos = {
  recibos: ReciboDelPortal[]
  /** `true` = la consulta falló (típicamente: la migración todavía no se aplicó). NO es «no hay
   *  recibos»: un cero por tabla ausente y un cero real se ven igual, y el que mira tiene que poder
   *  distinguirlos. */
  noSePudoLeer: boolean
}

/**
 * LOS RECIBOS DE ESTE CLIENTE, ya recortados por lo que el acceso alcanza.
 *
 * Se piden TODOS los del cliente y el filtro por obra se aplica después, en `recibosDelPortal`: es
 * una decisión de permiso y tiene que poder probarse sin base. `select('*')` por la misma razón que
 * en `datosObra.ts`: nombrar columnas hace que el día que falte una, PostgREST devuelva error y la
 * pantalla entera quede vacía por una columna.
 */
export async function recibosDelCliente(acceso: AccesoDelPortal): Promise<LecturaDeRecibos> {
  const sb = createAdminClient()
  const { data, error } = await sb.from('recibo_cliente').select('*').eq('cliente_id', acceso.clienteId)
  if (error) return { recibos: [], noSePudoLeer: true }

  const filas = (data ?? []) as unknown as FilaRecibo[]
  const idsDeObra = [...new Set(filas.map((f) => f.obra_id).filter((id): id is string => !!id))]
  const { data: obras } = idsDeObra.length
    ? await sb.from('obra_canonica').select('id, nombre').in('id', idsDeObra)
    : { data: [] as { id: string; nombre: string }[] }
  const nombres = new Map((obras ?? []).map((o) => [String(o.id), String(o.nombre)]))

  return {
    recibos: recibosDelPortal(filas, nombres, (obraId) => alcanzaLaObra(acceso.obras, obraId), acceso.puedeVerMontos),
    noSePudoLeer: false,
  }
}

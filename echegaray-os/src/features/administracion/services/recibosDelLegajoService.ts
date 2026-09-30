// LA LECTURA DE LA SOLAPA «RECIBOS»: los papeles del estudio (Drive) con su neto, y los firmados de la app.
//
// SIN PERMISO NO SE VIAJA, igual que `getRecibosEmitidos`: el neto sale de `recibo_sueldo_linea`, que cierra
// `liquida_sueldos()`; el jefe de obra vería cero líneas sin error y «sin neto» se leería como «sin dato».
// El que llama pasa `puedeVer`; sin él no se consulta nada y la pantalla dice «sin permiso».
//
// EL PAPEL MANDA, LA LÍNEA SÓLO LO ENRIQUECE: la lista se arma desde `documentacion_legajo` (los PDF que existen,
// incluidos los anteriores a 2026 que el importador nunca leyó) y se le pega el neto por `drive_file_id`.
// Partir de la línea habría dejado afuera todo recibo no importado.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getRecibosEmitidos } from './recibosEmitidosService'
import { unirRecibos, type FilaDeRecibo, type ReciboDelEstudio } from './recibosDelLegajo'

export interface RecibosDeLaSolapa {
  puedeVer: boolean
  filas: FilaDeRecibo[]
  /** Un fallo se dice; nunca se dibuja como «sin recibos». */
  error: string | null
}

interface Documento { id: string; nombre: string | null; drive_file_id: string | null; fecha_documento: string | null }
interface Linea { drive_file_id: string | null; periodo: string; neto: unknown }

export async function getRecibosDelLegajo(
  supabase: SupabaseClient, p: { personaId: string; puedeVer: boolean },
): Promise<RecibosDeLaSolapa> {
  if (!p.puedeVer) return { puedeVer: false, filas: [], error: null }
  const [docs, lineas, emitidos] = await Promise.all([
    supabase.from('documentacion_legajo')
      .select('id, nombre, drive_file_id, fecha_documento')
      .eq('persona_id', p.personaId).eq('tipo_documento', 'recibo_sueldo').eq('presente', true),
    supabase.from('recibo_sueldo_linea').select('drive_file_id, periodo, neto').eq('persona_id', p.personaId),
    getRecibosEmitidos(supabase, { personaId: p.personaId, puedeVer: true }),
  ])
  if (docs.error) return { puedeVer: true, filas: [], error: `No pude leer los recibos del estudio: ${docs.error.message}` }
  const neto = new Map<string, { periodo: string; neto: number }>()
  for (const l of (lineas.data ?? []) as Linea[]) {
    if (l.drive_file_id && Number.isFinite(Number(l.neto))) neto.set(l.drive_file_id, { periodo: l.periodo, neto: Number(l.neto) })
  }
  const estudio = ((docs.data ?? []) as Documento[]).map((d): ReciboDelEstudio => {
    const l = d.drive_file_id ? neto.get(d.drive_file_id) : undefined
    return {
      documentoId: d.id, nombre: d.nombre, driveFileId: d.drive_file_id, fechaDocumento: d.fecha_documento,
      periodoLinea: l?.periodo ?? null, neto: l?.neto ?? null,
    }
  })
  return {
    puedeVer: true,
    filas: unirRecibos({ estudio, emitidos: emitidos.recibos }),
    error: emitidos.error ?? (lineas.error ? `No pude leer el neto de los recibos: ${lineas.error.message}` : null),
  }
}

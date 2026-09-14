// LOS RECIBOS DE SUELDO DEL AÑO, COMO ESTÁN EN EL LEGAJO. Ni una regla acá: trae filas.
//
// Viven en `documentacion_legajo` con `tipo_documento = 'recibo_sueldo'`, `persona_id` y
// `drive_file_id`, y el período escrito en el NOMBRE («Recibo 2026-08 Q2 · APELLIDO NOMBRE.pdf»).
// Medido el 14/09/2026: de 12 a 22 por quincena desde enero, 19 en 2026-08 Q2, ninguno de septiembre.
// La quincena de cada uno la decide `periodoDelNombre`, la misma regla de «Mis recibos».
//
// La RLS de la tabla deja leer a `es_administracion()`: quien entra a Liquidación ve los de todos.
// Unos 350 por año entran en una página de PostgREST; si alguna vez no entran, se dice.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface DocumentoDeRecibo {
  persona_id: string | null
  nombre: string | null
  drive_file_id: string | null
}

const PAGINA = 1000

export async function getRecibosDeSueldoDelAnio(
  supabase: SupabaseClient, anio: string,
): Promise<{ docs: DocumentoDeRecibo[]; error: string | null }> {
  const { data, error } = await supabase.from('documentacion_legajo')
    .select('persona_id, nombre, drive_file_id')
    .eq('tipo_documento', 'recibo_sueldo')
    .eq('presente', true)
    .ilike('nombre', `%${anio}-%`)
    .range(0, PAGINA - 1)
  if (error) return { docs: [], error: error.message || 'la base rechazó la consulta de recibos (permiso).' }
  const docs = (data ?? []) as DocumentoDeRecibo[]
  // UNA LECTURA CORTADA NO SE CALLA: una página llena puede haber dejado recibos afuera.
  return {
    docs,
    error: docs.length >= PAGINA ? `hay ${PAGINA} o más recibos en ${anio}: la lista puede estar cortada.` : null,
  }
}

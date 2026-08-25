// PANTALLA 31 — quién entra al portal, qué puede ver, y qué hizo cuando entró.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceResult } from '@/features/obras/types'
import type { AccesoPortal, ActividadPortal } from '../types'
import { nombresDeObra } from './nombresDeObra.ts'

const COLUMNAS =
  'id, cliente_id, email, persona_contacto, puede_ver_obra, puede_ver_montos, puede_aprobar, obras,'
  + ' habilitado_at, invitacion_enviada_at, primer_ingreso_at, ultimo_ingreso_at, ultimo_dispositivo,'
  + ' revocado_at, auth_user_id'

/**
 * Todos los accesos del cliente, INCLUIDOS los revocados.
 *
 * Los revocados no se filtran acá: la pantalla 31 tiene que poder mostrar «María ya no tiene acceso
 * desde el 12/08», que es justamente la pregunta que se hace cuando alguien se fue de la empresa del
 * cliente. Ocultarlos haría parecer que esa persona nunca tuvo acceso.
 */
export async function getAccesos(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<ServiceResult<AccesoPortal[]>> {
  const { data, error } = await supabase
    .from('cliente_acceso')
    .select(COLUMNAS)
    .eq('cliente_id', clienteId)
    .order('revocado_at', { ascending: true, nullsFirst: true })
    .order('habilitado_at', { ascending: false, nullsFirst: false })

  if (error) return { data: null, error: error.message }
  const filas = (data ?? []) as unknown as Record<string, unknown>[]
  // `obras` es `null` = TODAS: no hay ids que resolver y `obras_nombres` queda `null` también.
  // Aplanar las dos cosas a `[]` haría que «entra a todas» y «no entra a ninguna» se vean igual.
  const nombres = await nombresDeObra(
    supabase, filas.flatMap((f) => ((f.obras as string[] | null) ?? [])),
  )
  return {
    data: filas.map((f) => ({
      ...f,
      obras_nombres: (f.obras as string[] | null)?.map((id) => nombres.get(id) ?? id) ?? null,
    })) as unknown as AccesoPortal[],
    error: null,
  }
}

/**
 * Lo que hicieron en el portal, lo más reciente primero.
 *
 * `limite` porque este libro sólo crece: cada ingreso deja un renglón. La pantalla muestra los
 * últimos y no necesita los 4.000 del año pasado para responder «¿aprobó el certificado?».
 */
export async function getActividadPortal(
  supabase: SupabaseClient,
  clienteId: string,
  limite = 50,
): Promise<ServiceResult<ActividadPortal[]>> {
  const { data, error } = await supabase
    .from('cliente_actividad_portal')
    .select('id, cliente_id, acceso_id, tipo, referencia, detalle, monto, at,'
      + ' cliente_acceso:acceso_id (persona_contacto, email)')
    .eq('cliente_id', clienteId)
    .order('at', { ascending: false })
    .limit(limite)

  if (error) return { data: null, error: error.message }
  return {
    // QUIÉN LO HIZO. `acceso_id` es null cuando la línea la produjo administración («habilitado»),
    // y entonces `persona` queda null: escribir ahí el nombre del cliente diría que la acción la
    // hizo él. Cuando hay acceso pero no cargaron el nombre, vale el mail — es lo que se sabe.
    data: ((data ?? []) as unknown as Record<string, unknown>[]).map((a) => {
      const acc = a.cliente_acceso as { persona_contacto: string | null; email: string } | null
      const { cliente_acceso: _ignorado, ...fila } = a
      return { ...fila, persona: acc?.persona_contacto ?? acc?.email ?? null }
    }) as unknown as ActividadPortal[],
    error: null,
  }
}

/**
 * ¿ESTE ACCESO ESTÁ VIVO? Un acceso revocado no es lo mismo que uno que todavía no entró.
 *
 * La pantalla 31 pinta tres estados distintos y confundir los dos últimos haría que un acceso recién
 * creado se vea como uno dado de baja.
 */
export function estadoDeAcceso(a: AccesoPortal): 'revocado' | 'sin_estrenar' | 'activo' {
  if (a.revocado_at) return 'revocado'
  return a.primer_ingreso_at ? 'activo' : 'sin_estrenar'
}

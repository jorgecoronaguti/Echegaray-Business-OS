// LA LECTURA DE LAS CUENTAS — sólo por `cuentas_del_plantel()`, que lleva el portero adentro.
//
// Las columnas están revocadas a `authenticated` (20261001T0300): un `from('personas').select('cbu')`
// contestaría «permission denied». Por eso no hay otra puerta, y por eso quien llama decide ANTES si
// el que mira liquida sueldos: sin permiso la función tira 42501, y esta pantalla dice «sin permiso»
// en vez de pagar el viaje para enterarse.
//
// MIENTRAS LA MIGRACIÓN NO ESTÉ APLICADA la función no existe y PostgREST contesta PGRST202. Eso no es
// un error del legajo ni un «sin cuentas»: es «falta la base», y se dice con su nombre.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ControlDeCuentas } from './cuentasDelLegajo'

export const MIGRACION_CUENTAS = '20261001T0300_legajo_cuentas_sueldo_y_fcl.sql'

export interface FilaDeCuentas {
  persona_id: string
  nombre: string
  legajo: string | null
  convenio_colectivo: string | null
  en_la_empresa: boolean
  cuenta_sueldo_banco: string | null
  cuenta_sueldo_numero: string | null
  cbu: string | null
  cuenta_sueldo_estado: string | null
  fcl_cuenta: string | null
  fcl_cbu: string | null
  fcl_estado: string | null
  fcl_exigible: boolean
  cuentas_fuente: string | null
  cuentas_relevadas_en: string | null
  control: ControlDeCuentas
}

export type LecturaDeCuentas =
  | { estado: 'ok'; filas: FilaDeCuentas[] }
  | { estado: 'falta_migracion' }
  | { estado: 'error'; mensaje: string }

const FALTA_FUNCION = new Set(['PGRST202', '42883'])

export async function leerCuentas(supabase: SupabaseClient, personaId?: string): Promise<LecturaDeCuentas> {
  const { data, error } = await supabase.rpc('cuentas_del_plantel', personaId ? { p_persona_id: personaId } : {})
  if (error && FALTA_FUNCION.has(error.code ?? '')) return { estado: 'falta_migracion' }
  if (error) return { estado: 'error', mensaje: error.message }
  return { estado: 'ok', filas: (data ?? []) as FilaDeCuentas[] }
}

/** El control por persona, para la lista. Sólo las que vinieron: quien falta no es «falta todo». */
export function controlPorPersona(filas: FilaDeCuentas[]): Map<string, ControlDeCuentas> {
  return new Map(filas.map((f) => [f.persona_id, f.control]))
}

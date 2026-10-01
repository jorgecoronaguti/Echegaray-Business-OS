'use server'

// GUARDAR LAS CUENTAS DE UNA PERSONA — sólo por `fijar_cuentas_de_persona()`.
//
// Las columnas están revocadas a `authenticated`: un `update` directo rebotaría. La función tiene el
// portero (`liquida_sueldos()`), valida los 22 dígitos y deja el autor. Esta capa repite el permiso
// sólo para no pagar el viaje y decirlo en castellano; la cerradura es la de la base.
//
// LA ESCRITURA SE PRUEBA LEYENDO EL DESTINO. Después de guardar se relee la fila por la misma
// función de lectura y se compara lo que importa —los dos CBU, los dos números y los dos estados—.
// Si no coincide, el panel no se cierra: un «guardado» que no se puede leer de vuelta no está
// guardado.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { rolDeLaSesion } from '@/shared/auth/rolDeLaSesion'
import { liquidaSueldos } from '@/shared/auth/areas'
import { esquemaCuentas, type CuentasEditadas } from './cuentasDelLegajo'
import { leerCuentas } from './cuentasDelLegajoService'
import type { Resultado } from './personasActions'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMPARADOS = [
  'cbu', 'cuenta_sueldo_numero', 'cuenta_sueldo_estado', 'fcl_cuenta', 'fcl_cbu', 'fcl_estado',
] as const satisfies readonly (keyof CuentasEditadas)[]

export async function editarCuentas(personaId: string, form: FormData): Promise<Resultado> {
  if (!UUID.test(personaId)) return { ok: false, error: 'No sé de qué persona son estas cuentas.' }
  const parsed = esquemaCuentas.safeParse(Object.fromEntries(form))
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const c = parsed.data

  const supabase = await createClient()
  // EL ROL REAL, NO LA LENTE: una acción de servidor se invoca desde cualquier pantalla.
  const sesion = await rolDeLaSesion(supabase)
  if (!liquidaSueldos(sesion?.rol)) return { ok: false, error: 'Las cuentas las cargan Dirección y Administración.' }

  const { error } = await supabase.rpc('fijar_cuentas_de_persona', {
    p_persona_id: personaId,
    p_cuenta_sueldo_banco: c.cuenta_sueldo_banco,
    p_cuenta_sueldo_numero: c.cuenta_sueldo_numero,
    p_cbu: c.cbu,
    p_cuenta_sueldo_estado: c.cuenta_sueldo_estado,
    p_fcl_cuenta: c.fcl_cuenta,
    p_fcl_cbu: c.fcl_cbu,
    p_fcl_estado: c.fcl_estado,
    p_cuentas_fuente: c.cuentas_fuente,
    p_cuentas_relevadas_en: c.cuentas_relevadas_en,
  })
  if (error?.code === 'PGRST202') {
    return { ok: false, error: 'Todavía no puedo guardar cuentas: falta aplicar la migración en la base. No guardé nada.' }
  }
  if (error) return { ok: false, error: `No guardé las cuentas: ${error.message}` }

  const leida = await leerCuentas(supabase, personaId)
  const fila = leida.estado === 'ok' ? leida.filas[0] : undefined
  if (!fila || COMPARADOS.some((k) => (fila[k] ?? null) !== (c[k] ?? null))) {
    return { ok: false, error: 'La base respondió pero al releer las cuentas no coinciden con lo cargado. No las doy por guardadas: revisá el legajo.' }
  }

  revalidatePath('/administracion/personas')
  revalidatePath(`/administracion/personas/${personaId}`)
  redirect(`/administracion/personas/${personaId}`)
}

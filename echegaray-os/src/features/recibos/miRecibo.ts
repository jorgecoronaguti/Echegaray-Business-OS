// «MI» RECIBO DE PAGO — el que ve la persona en su teléfono, y sólo el suyo.
//
// La vista ya filtra por `mi_persona_id()`, pero quien liquida también es una persona con teléfono: sin
// comparar el `persona_id`, Administración abriendo «Yo» vería el recibo de otro con la flecha de «Mis
// recibos». Se compara acá; la base igual impide que firme por otro.

import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { leerRecibo, leerRecibosDePersona, type ReciboDePago } from './datos'

export type MiRecibo =
  | { que: 'sin-sesion' }
  | { que: 'sin-vinculo'; disponible: boolean }
  | { que: 'no-esta' }
  | { que: 'error'; error: string }
  | { que: 'ok'; r: ReciboDePago; anteriores: number }

export async function cargarMiRecibo(id: string): Promise<MiRecibo> {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return { que: 'sin-sesion' }
  const perfil = await getPerfilPropio(supabase, user.id)
  const personaId = perfil.data?.persona_id
  if (!personaId) return { que: 'sin-vinculo', disponible: perfil.data?.vinculoDisponible !== false }
  if (!/^[0-9a-f-]{36}$/.test(id)) return { que: 'no-esta' }
  const [uno, todos] = await Promise.all([leerRecibo(supabase, id), leerRecibosDePersona(supabase, personaId)])
  if (uno.error) return { que: 'error', error: uno.error }
  if (!uno.data || uno.data.personaId !== personaId) return { que: 'no-esta' }
  const anteriores = (todos.data ?? []).filter((x) => x.id !== id && x.vigente).length
  return { que: 'ok', r: uno.data, anteriores }
}

/** Los recibos de pago de quien pregunta, para «Mis recibos». */
export async function misRecibosDePago(personaId: string) {
  const supabase = await createClient()
  return leerRecibosDePersona(supabase, personaId)
}

export const BASE_MI_RECIBO = (id: string) => `/mi-informacion/recibos/pago/${id}`

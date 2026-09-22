import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { getMiEfectivo } from '../datos'
import { sufijoDeVuelta, tarjetaDeHoy } from '../logica'
import { TarjetaMiEfectivo, TarjetaRecibir } from './TarjetasHoy'

// EL EFECTIVO DEL JEFE EN SU «HOY» (J01) — la misma tarjeta que el empleado, con la vuelta a su obra.
//
// Lee sola, para no agregar tres consultas al cuerpo de J01, que ya junta seis. Mira TODAS las
// entregas del jefe y no sólo las de la obra elegida: una entrega sin firmar de otra obra también es
// plata que tiene en la mano hoy. Sin persona vinculada o sin la migración, no dibuja nada.
export async function EfectivoEnHoyJefe({ obraId }: { obraId: string | null }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) return null
  const perfil = await getPerfilPropio(supabase, user.id)
  const personaId = perfil.data?.persona_id
  if (!personaId) return null
  const lectura = await getMiEfectivo(supabase, personaId)
  if (lectura.estado !== 'ok') return null
  const t = tarjetaDeHoy(lectura.dato.entregas, lectura.dato.tickets)
  if (!t) return null
  const href = obraId ? `/obra/efectivo?obra=${encodeURIComponent(obraId)}` : '/obra/efectivo'
  return (
    <div style={{ marginTop: 14 }} data-testid="jefe-hoy-efectivo">
      {t.tipo === 'recibir' ? <TarjetaRecibir t={t} sufijo={sufijoDeVuelta('obra', obraId)} /> : <TarjetaMiEfectivo t={t} href={href} />}
    </div>
  )
}

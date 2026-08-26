import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ObraDelPortal } from './Shell'

// QUÉ VE ESTE MAIL — la pregunta se le hace a la BASE, no a la cookie.
//
// El alcance de un mail a una o varias obras es una decisión del administrador y vive en la ficha del
// cliente. Que la cookie diga "cliente X" no autoriza a ver la obra de X: se vuelve a preguntar acá,
// en cada carga. Si el administrador saca un mail de la ficha, la sesión abierta deja de ver la obra
// en la siguiente pantalla, no cuando venza la cookie.

export async function obrasDelCliente(clienteId: string): Promise<ObraDelPortal[]> {
  const sb = createAdminClient()
  const { data } = await sb
    .from('obras')
    .select('id, nombre, estado')
    .eq('cliente_id', clienteId)
    .order('nombre')
  return (data ?? []).map((o) => ({ id: String(o.id), nombre: String(o.nombre) }))
}

export async function nombreDelCliente(clienteId: string): Promise<string> {
  const sb = createAdminClient()
  const { data } = await sb.from('clientes').select('nombre_comercial, razon_social').eq('id', clienteId).maybeSingle()
  return String(data?.nombre_comercial ?? data?.razon_social ?? 'Cliente')
}

/** La obra elegida por la URL, acotada SIEMPRE a las que este mail alcanza. */
export function obraElegida(obras: ObraDelPortal[], pedida: string | undefined): ObraDelPortal | null {
  const halla = pedida ? obras.find((o) => o.id === pedida) : null
  // Una obra pedida que no está en el alcance no da error ni pantalla vacía: cae en la primera suya.
  return halla ?? obras[0] ?? null
}

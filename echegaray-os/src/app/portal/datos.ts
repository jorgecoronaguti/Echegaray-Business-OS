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
  // LAS CERRADAS VAN AL FINAL. La primera de la lista es la que abre el portal, y abrir por una obra
  // terminada le muestra al cliente un cronograma vacío de algo que ya pagó — parece que perdimos su
  // obra en curso. Las terminadas tienen su propia pantalla.
  return (data ?? [])
    .map((o) => ({ id: String(o.id), nombre: String(o.nombre), cerrada: String(o.estado) === 'cerrada' }))
    .sort((a, b) => Number(a.cerrada) - Number(b.cerrada))
    .map(({ id, nombre }) => ({ id, nombre }))
}

export async function nombreDelCliente(clienteId: string): Promise<string> {
  const sb = createAdminClient()
  const { data } = await sb.from('clientes').select('nombre_comercial, razon_social').eq('id', clienteId).maybeSingle()
  // El nombre viene como lo cargó administración —«(IMOTOR / Javier Sánchez)»— y los paréntesis son
  // una anotación interna. El cliente no tiene por qué ver la nota que alguien se dejó a sí mismo.
  const crudo = String(data?.nombre_comercial ?? data?.razon_social ?? 'Cliente').trim()
  return crudo.replace(/^\((.*)\)$/, '$1').trim()
}

/** La obra elegida por la URL, acotada SIEMPRE a las que este mail alcanza. */
export function obraElegida(obras: ObraDelPortal[], pedida: string | undefined): ObraDelPortal | null {
  const halla = pedida ? obras.find((o) => o.id === pedida) : null
  // Una obra pedida que no está en el alcance no da error ni pantalla vacía: cae en la primera suya.
  return halla ?? obras[0] ?? null
}

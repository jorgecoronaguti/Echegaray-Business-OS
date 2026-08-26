'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarCookie, NOMBRE_COOKIE } from '../sesion'
import { normalizarMail, pareceMail } from './acceso'

// LA PUERTA DEL PORTAL: EL MAIL Y NADA MÁS.
//
// ═══ QUÉ CAMBIÓ (26/08/2026, decisión del dueño) ═══
//
// La primera versión mandaba un código de seis dígitos al buzón y lo pedía en un segundo paso. El
// dueño lo rechazó por dos razones, y las dos son ciertas:
//
//   1. NO ES LO QUE SE PIDIÓ. El requisito decía «entra sólo con el mail que el administrador cargó
//      en su ficha, sin registro y sin contraseña». Un código de un solo uso ES una contraseña: le
//      agrega un paso al cliente y una cosa más que puede fallar.
//   2. NO FUNCIONABA EN PRODUCCIÓN. El código salía por el Gmail de la empresa, y eso necesita el
//      JSON del service account: un ARCHIVO que vive en la VM y NO existe en Vercel, donde corre la
//      web. El envío fallaba siempre y el cliente quedaba sin ninguna puerta.
//
// ═══ QUÉ PROTEGE ESTO Y QUÉ NO — declarado, no escondido ═══
//
// PROTEGE: nadie se da de alta solo. Sólo entra un mail que administración cargó a mano en
// `cliente_mail`, y cada mail alcanza EXACTAMENTE las obras de los clientes donde está habilitado —
// eso se vuelve a comprobar contra la base en cada pantalla, no se confía a la cookie.
//
// NO PROTEGE: quien CONOZCA el mail de un cliente entra a ver lo de ese cliente. Es una decisión
// tomada con el riesgo a la vista (26/08/2026): lo que el portal muestra es plata del propio cliente
// —su cronograma, sus facturas, sus planos—, nunca costos, márgenes, proveedores ni obras de otro.
// El día que eso deje de alcanzar, el lugar donde se agrega el segundo factor es esta función.
//
// TODO INTENTO QUEDA REGISTRADO en `portal_acceso`. Es lo único que convierte «alguien entró» en un
// hecho verificable, y la señal temprana de un mail que golpea sin estar habilitado.

export type EstadoLogin = {
  mail?: string
  error?: 'no_habilitado' | 'mail_invalido'
  /** Sólo cuando el mail alcanza MÁS de un cliente: hay que elegir como cuál se entra. */
  elegir?: { id: string; nombre: string }[]
}

async function huella() {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    agente: h.get('user-agent')?.slice(0, 300) ?? null,
  }
}

export async function entrar(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  if (!pareceMail(mail)) return { mail, error: 'mail_invalido' }

  const sb = createAdminClient()
  const { data } = await sb
    .from('cliente_mail')
    .select('cliente_id, clientes(nombre_comercial, razon_social)')
    .eq('mail', mail)
    .eq('activo', true)

  const { ip, agente } = await huella()
  if (!data?.length) {
    await sb.from('portal_acceso').insert({ mail, resultado: 'no_habilitado', ip, agente })
    return { mail, error: 'no_habilitado' }
  }

  // UN MAIL PUEDE ALCANZAR VARIOS CLIENTES —es el caso del dueño, que entra a ver lo que ve cada uno—.
  // Se elige en la PUERTA y no adentro: el pedido fue «quiero verlo como lo ve el cliente, no algo
  // adaptado a mí», y un selector de cliente dentro del portal sería justamente eso. Un cliente de
  // verdad tiene uno solo y nunca ve este paso.
  const clientes = [...new Map(data.map((r) => {
    const c = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    const crudo = String(c?.nombre_comercial ?? c?.razon_social ?? 'Cliente').trim()
    // Los paréntesis de «(IMOTOR / Javier Sánchez)» son una anotación interna de administración.
    return [String(r.cliente_id), { id: String(r.cliente_id), nombre: crudo.replace(/^\((.*)\)$/, '$1').trim() }]
  })).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  if (clientes.length > 1) return { mail, elegir: clientes }

  const clienteId = clientes[0].id
  await sb.from('portal_acceso').insert({ mail, resultado: 'entro', ip, agente })

  // El `clienteId` va en la cookie sólo para saber por dónde entró. QUÉ puede ver lo decide
  // `obrasDelMail(mail)` contra la base, en cada pantalla: un mail habilitado en tres clientes ve los
  // tres, y uno dado de baja deja de ver en la pantalla siguiente sin esperar a que venza la cookie.
  const { valor, maxAge } = armarCookie({ mail, clienteId: String(clienteId) })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
  redirect('/portal')
}

export async function salir() {
  ;(await cookies()).delete({ name: NOMBRE_COOKIE, path: '/portal' })
  redirect('/portal/login')
}

/**
 * ENTRAR COMO UNO DE LOS CLIENTES que este mail alcanza.
 *
 * El `clienteId` que llega del formulario NO se cree: se vuelve a buscar contra `cliente_mail`. El
 * campo viaja por el navegador y ahí se puede escribir cualquier cosa; sin esta comprobación,
 * cambiarlo a mano entraría a un cliente que el mail no alcanza.
 */
export async function entrarComo(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  const clienteId = String(form.get('cliente') ?? '')
  const sb = createAdminClient()
  const { data } = await sb
    .from('cliente_mail')
    .select('cliente_id')
    .eq('mail', mail).eq('cliente_id', clienteId).eq('activo', true)
    .limit(1)

  const { ip, agente } = await huella()
  if (!data?.length) {
    await sb.from('portal_acceso').insert({ mail, resultado: 'no_habilitado', ip, agente })
    return { mail, error: 'no_habilitado' }
  }
  await sb.from('portal_acceso').insert({ mail, resultado: 'entro', ip, agente })

  const { valor, maxAge } = armarCookie({ mail, clienteId })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
  redirect('/portal')
}

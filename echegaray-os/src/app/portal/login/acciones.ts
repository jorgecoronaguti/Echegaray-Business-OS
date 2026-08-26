'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarCookie, NOMBRE_COOKIE } from '../sesion'
import { accesosDelMail } from '../datos'
import type { AccesoDelPortal } from '../permisos'
import { normalizarMail, pareceMail } from './acceso'

// LA PUERTA DEL PORTAL: EL MAIL Y NADA MÁS.
//
// ═══ QUÉ CAMBIÓ (26/08/2026, decisión del dueño) ═══
//
// La primera versión mandaba un código de seis dígitos al buzón y lo pedía en un segundo paso. El
// dueño lo rechazó por dos razones, y las dos son ciertas:
//
//   1. NO ES LO QUE SE PIDIÓ. El requisito decía «entra sólo con el mail que el administrador cargó
//      en su ficha, sin registro y sin contraseña». Un código de un solo uso ES una contraseña.
//   2. NO FUNCIONABA EN PRODUCCIÓN. El código salía por el Gmail de la empresa, y eso necesita el
//      JSON del service account: un ARCHIVO que vive en la VM y NO existe en Vercel.
//
// ═══ LA LISTA DE INVITADOS ES LA DE LA FICHA DEL CLIENTE (26/08/2026) ═══
//
// Esta función leía `cliente_mail`, una tabla del portal. La pantalla 31 ya administraba lo mismo en
// `cliente_acceso` y ahí es donde administración da de alta y REVOCA. Mientras convivieron, revocar
// en la ficha no cerraba la puerta del portal. Ahora la puerta pregunta en un solo lugar.
//
// ═══ QUÉ PROTEGE ESTO Y QUÉ NO — declarado, no escondido ═══
//
// PROTEGE: nadie se da de alta solo, y un acceso revocado deja de entrar en el acto.
//
// NO PROTEGE: quien CONOZCA el mail de un cliente entra a ver lo de ese cliente. Es una decisión
// tomada con el riesgo a la vista (26/08/2026): lo que el portal muestra es plata del propio cliente
// —su cronograma, sus facturas, sus planos—, nunca costos, márgenes, proveedores ni obras de otro.
// El día que eso deje de alcanzar, el lugar donde se agrega el segundo factor es esta función.
//
// ═══ EL INGRESO QUEDA EN EL LIBRO QUE MIRA LA PANTALLA 31 ═══
//
// `cliente_actividad_portal` es lo que administración lee para saber si el cliente entró. Si el
// portal no escribiera ahí, la ficha diría que nadie entró nunca teniendo al cliente adentro.
//
// LO QUE ESTE LIBRO NO PUEDE REGISTRAR: un intento RECHAZADO. `cliente_actividad_portal.cliente_id`
// es NOT NULL y un mail no habilitado no tiene cliente. Queda en el log del servidor, que es donde
// hoy se puede mirar; convertirlo en un hecho consultable necesita una tabla que no es ésta.

export type EstadoLogin = {
  mail?: string
  error?: 'no_habilitado' | 'mail_invalido'
  /** Sólo cuando el mail alcanza MÁS de un cliente: hay que elegir como cuál se entra. */
  elegir?: { id: string; nombre: string }[]
}

/** El navegador con el que entró, para la columna `ultimo_dispositivo` de la pantalla 31. */
async function dispositivo(): Promise<string | null> {
  return (await headers()).get('user-agent')?.slice(0, 300) ?? null
}

/**
 * ABRE LA SESIÓN: marca el ingreso en el acceso, lo anota en el libro, y firma la cookie.
 *
 * El orden importa. Las dos escrituras van ANTES de la cookie porque `redirect()` corta la
 * ejecución: dejarlas después haría que el cliente entrara y la ficha no se enterara nunca.
 *
 * `primer_ingreso_at` sólo si estaba vacío. Pisarlo en cada entrada borraría el dato que responde
 * «¿alguna vez usó el portal?», que es distinto de «¿entró hoy?».
 */
async function abrirSesion(acceso: AccesoDelPortal, mail: string): Promise<void> {
  const sb = createAdminClient()
  const ahora = new Date().toISOString()

  const { data: previo } = await sb
    .from('cliente_acceso').select('primer_ingreso_at').eq('id', acceso.accesoId).maybeSingle()
  const primero = previo?.primer_ingreso_at ?? null

  await sb.from('cliente_acceso').update({
    primer_ingreso_at: primero ?? ahora,
    ultimo_ingreso_at: ahora,
    ultimo_dispositivo: await dispositivo(),
  }).eq('id', acceso.accesoId)

  await sb.from('cliente_actividad_portal').insert({
    cliente_id: acceso.clienteId,
    acceso_id: acceso.accesoId,
    tipo: 'ingreso',
    detalle: primero ? 'ingreso al portal' : 'primer ingreso al portal',
  })

  const { valor, maxAge } = armarCookie({ mail, clienteId: acceso.clienteId })
  ;(await cookies()).set(NOMBRE_COOKIE, valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge,
  })
}

export async function entrar(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  if (!pareceMail(mail)) return { mail, error: 'mail_invalido' }

  const accesos = await accesosDelMail(mail)
  if (!accesos.length) {
    console.warn(`[portal] intento de ingreso sin acceso vigente: ${mail}`)
    return { mail, error: 'no_habilitado' }
  }

  // UN MAIL PUEDE ALCANZAR VARIOS CLIENTES —es el caso del dueño, que entra a ver lo que ve cada
  // uno—. Se elige en la PUERTA y no adentro: el pedido fue «quiero verlo como lo ve el cliente, no
  // algo adaptado a mí», y un selector de cliente dentro del portal sería justamente eso.
  if (accesos.length > 1) {
    return { mail, elegir: accesos.map((a) => ({ id: a.clienteId, nombre: a.clienteNombre })) }
  }

  await abrirSesion(accesos[0], mail)
  redirect('/portal')
}

export async function salir() {
  ;(await cookies()).delete({ name: NOMBRE_COOKIE, path: '/portal' })
  redirect('/portal/login')
}

/**
 * ENTRAR COMO UNO DE LOS CLIENTES que este mail alcanza.
 *
 * El `clienteId` que llega del formulario NO se cree: se vuelve a buscar contra `cliente_acceso`. El
 * campo viaja por el navegador y ahí se puede escribir cualquier cosa; sin esta comprobación,
 * cambiarlo a mano entraría a un cliente que el mail no alcanza.
 */
export async function entrarComo(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  const clienteId = String(form.get('cliente') ?? '')
  const acceso = (await accesosDelMail(mail)).find((a) => a.clienteId === clienteId)
  if (!acceso) {
    console.warn(`[portal] intento de ingreso a un cliente fuera de alcance: ${mail}`)
    return { mail, error: 'no_habilitado' }
  }

  await abrirSesion(acceso, mail)
  redirect('/portal')
}

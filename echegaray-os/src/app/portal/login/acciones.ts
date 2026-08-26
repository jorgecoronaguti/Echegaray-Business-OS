'use server'

import { headers, cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { armarCookie, NOMBRE_COOKIE } from '../sesion'
import {
  normalizarMail, pareceMail, generarCodigo, hashearCodigo, evaluarCodigo, venceEn, VIDA_CODIGO_MIN,
} from './acceso'

// LA PUERTA DEL PORTAL.
//
// ═══ EL MAIL NO SE INVENTA: SE BUSCA EN LA FICHA ═══
//
// Sólo entra un mail que el administrador cargó en `cliente_mail`. No hay alta propia, no hay
// contraseña, no hay «registrate». Si no está, se lo dice y se registra el intento — un mail que
// golpea veinte veces es la única señal temprana de que alguien está probando direcciones.
//
// ═══ LO QUE SE DEVUELVE NO CUENTA DE MÁS ═══
//
// Un código malo y un código vencido devuelven el mismo mensaje al navegador. La diferencia queda en
// `portal_acceso`, donde la mira quien tiene que mirarla.

export type EstadoLogin = {
  paso: 'mail' | 'codigo'
  mail?: string
  error?: 'no_habilitado' | 'mail_invalido' | 'codigo_malo' | 'sin_envio'
}

async function huella() {
  const h = await headers()
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  return { ip, agente: h.get('user-agent')?.slice(0, 300) ?? null }
}

async function registrar(mail: string, resultado: string) {
  const { ip, agente } = await huella()
  await createAdminClient().from('portal_acceso').insert({ mail, resultado, ip, agente })
}

export async function pedirCodigo(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  if (!pareceMail(mail)) return { paso: 'mail', mail, error: 'mail_invalido' }

  const sb = createAdminClient()
  const { data } = await sb.from('cliente_mail').select('id').eq('mail', mail).eq('activo', true).limit(1)
  if (!data?.length) {
    await registrar(mail, 'no_habilitado')
    return { paso: 'mail', mail, error: 'no_habilitado' }
  }

  const codigo = generarCodigo()
  const { ip } = await huella()
  await sb.from('portal_codigo').insert({ mail, hash: hashearCodigo(mail, codigo), vence_en: venceEn().toISOString(), ip })
  await registrar(mail, 'habilitado')

  const enviado = await enviarPorMail(mail, codigo)
  // SI EL MAIL NO SALIÓ, SE DICE. Dejarlo pasar sería mandar al cliente a esperar un mail que nunca
  // llega, y el código quedaría vivo sin que nadie lo tenga.
  if (!enviado) return { paso: 'mail', mail, error: 'sin_envio' }
  return { paso: 'codigo', mail }
}

export async function validarCodigo(_previo: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const mail = normalizarMail(String(form.get('mail') ?? ''))
  const codigo = String(form.get('codigo') ?? '').replace(/\D/g, '')
  const sb = createAdminClient()

  const { data } = await sb
    .from('portal_codigo')
    .select('id, hash, vence_en, usado_en, intentos')
    .eq('mail', mail).is('usado_en', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const veredicto = evaluarCodigo(data ?? null, mail, codigo)
  if (!veredicto.ok) {
    if (data) await sb.from('portal_codigo').update({ intentos: data.intentos + 1 }).eq('id', data.id)
    await registrar(mail, veredicto.motivo === 'vencido' ? 'codigo_vencido' : 'codigo_malo')
    return { paso: 'codigo', mail, error: 'codigo_malo' }
  }

  const { data: alcance } = await sb.from('cliente_mail').select('cliente_id').eq('mail', mail).eq('activo', true).limit(1)
  const clienteId = alcance?.[0]?.cliente_id
  // El mail se dio de baja entre el pedido y el código: no entra.
  if (!clienteId) {
    await registrar(mail, 'no_habilitado')
    return { paso: 'mail', mail, error: 'no_habilitado' }
  }

  await sb.from('portal_codigo').update({ usado_en: new Date().toISOString() }).eq('id', data!.id)
  await registrar(mail, 'codigo_ok')

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
 * El código sale por el Gmail de la empresa, el mismo que ya usa el OS.
 *
 * Se importa en caliente y no arriba: `orquestador/lib/google.mjs` arrastra la configuración entera
 * del OS, y cargarla en cada render del login pondría ese peso en una pantalla que casi siempre se
 * ve sin enviar nada.
 */
async function enviarPorMail(mail: string, codigo: string): Promise<boolean> {
  try {
    // `google.mjs` es JavaScript con JSDoc: TypeScript infiere su forma y se queda corto (no ve
    // `scopes` ni los campos de `gmailSend`). Se declara acá lo poco que se usa, en vez de apagar el
    // chequeo con un `any` que taparía también un error de verdad.
    type ClienteGoogle = { gmailSend(m: { to: string; subject: string; body: string }): Promise<unknown> }
    type ModGoogle = { makeGoogleClient(o: Record<string, unknown>): ClienteGoogle; WRITE_SCOPES: unknown }
    const [google, config] = await Promise.all([
      import('../../../../orquestador/lib/google.mjs') as unknown as Promise<ModGoogle>,
      import('../../../../orquestador/lib/config.mjs') as unknown as Promise<{ loadConfig(): unknown }>,
    ])
    const g = google.makeGoogleClient({ config: config.loadConfig(), scopes: google.WRITE_SCOPES })
    await g.gmailSend({
      to: mail,
      subject: `Su código para entrar: ${codigo}`,
      body:
        `Su código es ${codigo}\n\n` +
        `Vence en ${VIDA_CODIGO_MIN} minutos y sirve una sola vez.\n\n` +
        `Si no pidió entrar al portal, ignore este mail.\n\n` +
        `Echegaray Construcciones`,
    })
    return true
  } catch {
    return false
  }
}

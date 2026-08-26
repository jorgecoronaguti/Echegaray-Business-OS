'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { altaSchema } from '@/features/administracion/services/portalClientes'
import { decidirAlta } from '@/features/administracion/services/altaPortal'

// QUIÉN ENTRA AL PORTAL — las dos escrituras de la consola.
//
// EL PORTERO ESTÁ ACÁ, NO EN LA PANTALLA. Una acción de servidor se puede invocar sin pasar por el
// formulario que la dibuja; comprobar el rol sólo al renderizar deja la escritura abierta. Y lo que
// se escribe acá es la llave de la casa: quien tenga el mail habilitado ve lo que ese cliente debe,
// lo que pagó y sus papeles.
//
// SE ESCRIBE CON LA CLAVE DE SERVICIO porque `cliente_mail` tiene RLS sin políticas —el portal entra
// por el servidor y esto también—. La autorización es este chequeo, explícito y arriba de todo.

export type Resultado = { ok: boolean; mensaje: string }

/** El portero, una vez. Devuelve el id del perfil que escribe, o null si no puede escribir. */
async function quienEscribe(): Promise<string | null> {
  const supabase = await createClient()
  const [usuario, perfil] = await Promise.all([getUsuarioActual(supabase), getPerfilActual(supabase)])
  if (!usuario || !veEconomia(perfil.data?.rol)) return null
  return usuario.id
}

function refrescar() {
  revalidatePath('/administracion/portal')
  revalidatePath('/portal')
}

/**
 * HABILITAR UN MAIL.
 *
 * Tres cosas que no son obvias y que sin ellas la pantalla miente:
 *  · la obra elegida tiene que ser DE ESE CLIENTE. El `<select>` sólo ofrece las suyas, pero una
 *    acción de servidor se invoca sin el `<select>`: sin este chequeo se le podría dar a un mail la
 *    obra de otro cliente, que es exactamente el agujero que el portal existe para no tener;
 *  · un mail dado de baja se REACTIVA, no se inserta —la fila apagada sigue ocupando el índice
 *    único— y así el rastro de quién lo dio de alta la primera vez sobrevive;
 *  · la evidencia es la re-lectura, no el 204: PostgREST responde OK sin haber escrito nada visible.
 */
export async function habilitarMail(_previo: Resultado, form: FormData): Promise<Resultado> {
  const perfilId = await quienEscribe()
  if (!perfilId) return { ok: false, mensaje: 'No tenés permiso para dar acceso al portal' }

  const v = altaSchema.safeParse({
    clienteId: String(form.get('clienteId') ?? ''),
    mail: String(form.get('mail') ?? ''),
    // Un `<select>` vacío es «todas sus obras», no una obra llamada "".
    obraId: form.get('obraId') ? String(form.get('obraId')) : null,
    nombre: form.get('nombre') ? String(form.get('nombre')) : null,
  })
  if (!v.success) {
    const e = v.error.issues[0]
    return { ok: false, mensaje: `${e.path.join('.') || 'alta'}: ${e.message}` }
  }
  const { clienteId, mail, obraId, nombre } = v.data

  const sb = createAdminClient()

  if (obraId) {
    const { data: obra } = await sb.from('obras').select('cliente_id').eq('id', obraId).maybeSingle()
    if (!obra) return { ok: false, mensaje: 'Esa obra no existe' }
    if (String(obra.cliente_id) !== clienteId) {
      return { ok: false, mensaje: 'Esa obra no es de ese cliente — no se puede dar acceso cruzado' }
    }
  }

  // Las APAGADAS entran a propósito: son las que ocupan el índice único.
  const { data: existentes, error: eLeer } = await sb
    .from('cliente_mail').select('id, mail, obra_id, activo').eq('cliente_id', clienteId)
  if (eLeer) return { ok: false, mensaje: `No pude leer los mails del cliente: ${eLeer.message}` }

  const decision = decidirAlta(
    (existentes ?? []).map((e) => ({
      id: String(e.id), mail: String(e.mail), obra_id: e.obra_id ? String(e.obra_id) : null, activo: e.activo !== false,
    })),
    { mail, obraId },
  )
  if (decision.accion === 'duplicado') return { ok: false, mensaje: `${mail} ya está habilitado con ese alcance` }

  const escritura = decision.accion === 'reactivar'
    ? await sb.from('cliente_mail').update({ activo: true, nombre, creado_por: perfilId }).eq('id', decision.id)
    : await sb.from('cliente_mail').insert({ cliente_id: clienteId, mail, obra_id: obraId, nombre, activo: true, creado_por: perfilId })
  if (escritura.error) {
    // El caso conocido: el índice único todavía es `(mail, obra_id)` sin el cliente, y el mismo mail
    // no puede alcanzar a dos clientes. Se nombra en vez de mostrar el texto crudo de Postgres.
    const duplicado = /duplicate key|cliente_mail_unico/i.test(escritura.error.message)
    return {
      ok: false,
      mensaje: duplicado
        ? `${mail} ya está cargado (puede estar habilitado para otro cliente). Buscalo antes de volver a cargarlo.`
        : `No pude guardarlo: ${escritura.error.message}`,
    }
  }

  // LA EVIDENCIA ES EL DATO LEÍDO EN SU DESTINO.
  const { data: leido } = await sb
    .from('cliente_mail').select('mail, activo').eq('cliente_id', clienteId).eq('mail', mail).eq('activo', true)
  refrescar()
  if (!leido?.length) return { ok: false, mensaje: 'La base aceptó la escritura pero no lo devuelve. No lo des por hecho.' }
  return { ok: true, mensaje: `${mail} ya puede entrar al portal.` }
}

/**
 * DAR DE BAJA UN MAIL — apaga, NUNCA borra.
 *
 * Borrar la fila deja la pregunta «¿quién le dio acceso a este mail, y cuándo?» sin respuesta seis
 * meses después. Apagarla la responde y corta el acceso igual: el portal lee `where activo`.
 */
export async function darDeBajaMail(_previo: Resultado, form: FormData): Promise<Resultado> {
  const perfilId = await quienEscribe()
  if (!perfilId) return { ok: false, mensaje: 'No tenés permiso para quitar accesos al portal' }

  const id = String(form.get('id') ?? '')
  if (!id) return { ok: false, mensaje: 'No sé qué acceso querés dar de baja' }

  const sb = createAdminClient()
  const { error } = await sb.from('cliente_mail').update({ activo: false }).eq('id', id)
  if (error) return { ok: false, mensaje: `No pude darlo de baja: ${error.message}` }

  const { data: leido } = await sb.from('cliente_mail').select('mail, activo').eq('id', id).maybeSingle()
  refrescar()
  if (!leido) return { ok: false, mensaje: 'No encuentro ese acceso después de escribirlo.' }
  if (leido.activo !== false) return { ok: false, mensaje: `${leido.mail} SIGUE habilitado. La baja no se aplicó.` }
  return { ok: true, mensaje: `${leido.mail} ya no entra. La fila queda como rastro.` }
}

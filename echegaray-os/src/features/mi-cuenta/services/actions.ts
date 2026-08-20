'use server'

// MI CUENTA — lo que cada uno escribe DE SÍ MISMO.
//
// ═══ QUÉ NO SE PUEDE ESCRIBIR ACÁ, Y POR QUÉ NO HACE FALTA CONTROLARLO ═══
//
// El nivel de usuario (`rol`) y el legajo vinculado (`persona_id`) NO son campos de esta pantalla.
// Y la garantía no es que este archivo no los mande: es que Postgres no los concedió. El grant de
// `20260820T3000` enumera `nombre`, `telefono` y `avatar_url` y nada más, así que un UPDATE con
// `rol` adentro lo rechaza la BASE, venga de acá, de PostgREST o de curl.
//
// Esa es la diferencia entre una interfaz que no ofrece la escalada y un sistema que no la permite.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { AVATAR_MAX_BYTES, AVATAR_TIPOS, perfilInputSchema } from '../types'

export type Resultado = { ok: true; id?: string } | { ok: false; error: string }

const BUCKET = 'avatares'

async function usuario() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Nombre y teléfono de la CUENTA. El del legajo lo administra Administración y no se toca desde acá. */
export async function guardarPerfil(form: FormData): Promise<Resultado> {
  const parsed = perfilInputSchema.safeParse({
    nombre: form.get('nombre'),
    telefono: form.get('telefono'),
  })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { error } = await supabase
    .from('perfiles')
    .update({ nombre: parsed.data.nombre, telefono: parsed.data.telefono })
    .eq('id', user.id)
  if (error) return { ok: false, error: error.message }

  // El header muestra el nombre en TODAS las pantallas: sin revalidar el layout, cambiarlo acá deja
  // el viejo arriba hasta la próxima recarga completa y parece que no se guardó.
  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * EL EMAIL DE ACCESO NO CAMBIA DE UN CLIC.
 *
 * `updateUser({ email })` no lo cambia: manda un correo a la dirección nueva y el cambio ocurre
 * cuando esa persona lo confirma. Es exactamente lo que tiene que pasar —si el email cambiara sin
 * verificar, alguien con la sesión abierta se apropia de la cuenta— y por eso la pantalla dice
 * «cambiarlo exige verificación» y esta función devuelve «revisá tu correo», no «listo».
 */
export async function pedirCambioDeEmail(form: FormData): Promise<Resultado> {
  const email = String(form.get('email') ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Escribí un email válido.' }

  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }
  if (email === user.email) return { ok: false, error: 'Ese ya es tu email de acceso.' }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** La contraseña nueva. El largo mínimo es el mismo que el del alta: dos mínimos distintos para la
 *  misma contraseña es una de las dos reglas mintiendo. */
export async function cambiarContrasena(form: FormData): Promise<Resultado> {
  const nueva = String(form.get('password') ?? '')
  const repetida = String(form.get('password2') ?? '')
  if (nueva.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
  // Se piden dos veces porque un error de tipeo acá deja a la persona afuera del sistema y sin
  // forma de entrar a arreglarlo.
  if (nueva !== repetida) return { ok: false, error: 'Las dos contraseñas no coinciden.' }

  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { error } = await supabase.auth.updateUser({ password: nueva })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * LA FOTO. Se guarda en `avatares/<id del usuario>/…`, y esa carpeta es la cerradura: la policy de
 * Storage sólo deja escribir donde el primer segmento es el `auth.uid()` de quien sube.
 */
export async function subirFoto(form: FormData): Promise<Resultado> {
  const archivo = form.get('foto')
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, error: 'Elegí una imagen.' }
  // El `accept` del input es una comodidad del navegador, no una cerradura: se valida acá también.
  if (!(AVATAR_TIPOS as readonly string[]).includes(archivo.type)) {
    return { ok: false, error: 'La foto tiene que ser JPG, PNG o WEBP.' }
  }
  if (archivo.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: `La foto no puede pesar más de ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.` }
  }

  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const extension = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg'
  // El nombre lleva la marca de tiempo para que el navegador y el CDN no sirvan la foto vieja: con
  // un nombre fijo, cambiar la foto no cambia nada visible hasta que caduque el caché.
  const ruta = `${user.id}/perfil-${Date.now()}.${extension}`

  const { error: subida } = await supabase.storage.from(BUCKET).upload(ruta, archivo, {
    contentType: archivo.type,
    upsert: false,
  })
  if (subida) return { ok: false, error: subida.message }

  const { data: publica } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
  const { error } = await supabase.from('perfiles').update({ avatar_url: publica.publicUrl }).eq('id', user.id)
  // SI LA FILA NO SE ACTUALIZA, EL ARCHIVO SE BORRA. Un archivo subido que nadie apunta es basura
  // en el bucket y, peor, la pantalla diría «guardado» sobre una foto que no se ve en ningún lado.
  if (error) {
    await supabase.storage.from(BUCKET).remove([ruta])
    return { ok: false, error: error.message }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/** Quitar la foto. La fila se limpia primero: si se borrara el archivo primero y fallara el update,
 *  el perfil quedaría apuntando a una imagen que ya no existe. */
export async function quitarFoto(): Promise<Resultado> {
  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { data: perfil } = await supabase.from('perfiles').select('avatar_url').eq('id', user.id).maybeSingle()
  const { error } = await supabase.from('perfiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) return { ok: false, error: error.message }

  const url = (perfil as { avatar_url: string | null } | null)?.avatar_url
  if (url) {
    const marca = `/${BUCKET}/`
    const i = url.indexOf(marca)
    // Sólo se borra si la ruta pertenece a la carpeta de este usuario: un `avatar_url` apuntando a
    // otro lado no puede convertirse en un borrado de un archivo ajeno.
    if (i !== -1) {
      const ruta = url.slice(i + marca.length)
      if (ruta.startsWith(`${user.id}/`)) await supabase.storage.from(BUCKET).remove([ruta])
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}

/**
 * CERRAR LA SESIÓN EN TODOS LOS DISPOSITIVOS. `scope: 'global'` invalida los refresh tokens de
 * todas las sesiones abiertas, incluida ésta — que es lo que se está prometiendo.
 */
export async function cerrarTodasLasSesiones(): Promise<Resultado> {
  const { supabase, user } = await usuario()
  if (!user) return { ok: false, error: 'Tu sesión venció. Volvé a entrar.' }

  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}

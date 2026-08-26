'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sesionDelPortal } from '../../sesion'
import { obrasDelMail } from '../../datos'

// LO QUE SUBE EL CLIENTE — se registra, y administración se entera.
//
// EL ALCANCE SE VUELVE A COMPROBAR ACÁ. Que el formulario mande un `obraId` no autoriza nada: un
// campo oculto lo edita cualquiera. Se pregunta de nuevo qué obras alcanza este mail.

const TOPE_BYTES = 25 * 1024 * 1024

export async function registrarAdjunto(
  _previo: { hecho: boolean; error?: string },
  form: FormData,
): Promise<{ hecho: boolean; error?: string }> {
  const sesion = await sesionDelPortal()
  if (!sesion) return { hecho: false, error: 'La sesión venció' }

  const obraId = String(form.get('obraId') ?? '')
  const permitidas = await obrasDelMail(sesion.mail)
  if (!permitidas.some((o) => o.id === obraId)) return { hecho: false, error: 'Esa obra no es suya' }

  const archivo = form.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return { hecho: false, error: 'Elegí un archivo' }
  if (archivo.size > TOPE_BYTES) return { hecho: false, error: 'El archivo pasa los 25 MB' }

  const { error } = await createAdminClient().from('obra_adjunto_cliente').insert({
    obra_id: obraId, mail: sesion.mail, nombre: archivo.name, mime: archivo.type, bytes: archivo.size,
  })
  // SI LA ESCRITURA FALLÓ, NO SE DICE «recibido». Un acuse falso hace que el cliente deje de
  // insistir por algo que nadie recibió.
  if (error) return { hecho: false, error: 'No pudimos recibirlo ahora' }
  return { hecho: true }
}

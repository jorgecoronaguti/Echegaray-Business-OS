'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { obrasParaElInicio } from '../datosObra'

// LO QUE SUBE EL CLIENTE — se registra, y administración se entera.
//
// EL ALCANCE SE VUELVE A COMPROBAR ACÁ. Que el formulario mande un `obraId` no autoriza nada: un
// campo oculto lo edita cualquiera. Se pregunta de nuevo qué obras alcanza este mail.
//
// ═══ LA OBRA ES LA CANÓNICA (26/08/2026) ═══
//
// El `obraId` era un uuid de `public.obras`. La pantalla de Documentos pasó a `obra_canonica` —el
// registro que tiene las carpetas de Drive y cuyos ids nombra `cliente_acceso.obras`—, y si el
// adjunto se quedaba en el registro viejo el botón «Adjuntar» sólo habría aparecido en 3 de 16
// obras. `obra_adjunto_cliente.obra_canonica_id` es la columna nueva; `obra_id` queda para las filas
// viejas (hoy no hay ninguna) y no existe mapeo entre los dos registros.

const TOPE_BYTES = 25 * 1024 * 1024

export async function registrarAdjunto(
  _previo: { hecho: boolean; error?: string },
  form: FormData,
): Promise<{ hecho: boolean; error?: string }> {
  const sesion = await sesionDelPortal()
  if (!sesion) return { hecho: false, error: 'La sesión venció' }

  const obraId = String(form.get('obraId') ?? '')
  const acceso = await accesoDelPortal(sesion)
  // Sin acceso vigente, o sin `puede_ver_obra`, no hay dónde adjuntar: la misma respuesta que para
  // una obra ajena, porque distinguirlas convertiría el formulario en un oráculo de qué obras hay.
  if (!acceso?.puedeVerObra) return { hecho: false, error: 'Esa obra no es suya' }
  const permitidas = await obrasParaElInicio(acceso)
  if (!permitidas.some((o) => o.id === obraId)) return { hecho: false, error: 'Esa obra no es suya' }

  const archivo = form.get('archivo')
  if (!(archivo instanceof File) || !archivo.size) return { hecho: false, error: 'Elegí un archivo' }
  if (archivo.size > TOPE_BYTES) return { hecho: false, error: 'El archivo pasa los 25 MB' }

  const { error } = await createAdminClient().from('obra_adjunto_cliente').insert({
    obra_canonica_id: obraId, mail: sesion.mail, nombre: archivo.name, mime: archivo.type, bytes: archivo.size,
  })
  // SI LA ESCRITURA FALLÓ, NO SE DICE «recibido». Un acuse falso hace que el cliente deje de
  // insistir por algo que nadie recibió.
  if (error) return { hecho: false, error: 'No pudimos recibirlo ahora' }
  return { hecho: true }
}

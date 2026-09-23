import { createClient } from '@/lib/supabase/server'
import { getPerfilReal } from '@/features/auth/services/authService'
import { estadoVerComo } from '@/features/auth/services/verComo'
import { ROL_LABEL } from '@/features/auth/types'
import { ROLES_MIRABLES } from '@/lib/auth/ver-como'
import { BarraVerComo } from './BarraVerComo.tsx'

// EL AVISO QUE NO SE PUEDE OLVIDAR.
//
// El dueño: *«tengo que probar cómo las verían el resto»*. La trampa de una lente así es quedarse
// trabajando adentro sin darse cuenta y sacar conclusiones equivocadas —«esto está roto», «esto no
// se ve»— sobre la app propia. Por eso el aviso es una franja del ancho de la pantalla, en el color
// de alerta, pegada arriba de todo, en 1280 y en 390, con la salida a un clic.
//
// Y DICE LO QUE LA LENTE NO ES. «Se ve bien» no es «está cerrado»: lo que cierra el acceso es el
// RLS de Postgres, que sigue viendo al usuario real. Si eso no está escrito en la pantalla, alguien
// —el dueño el mes que viene, yo dentro de tres sesiones— va a usar una captura de esta lente como
// prueba de que un permiso está bien puesto, y no lo prueba.
//
// Se dibuja en los TRES marcos porque la lente cruza los tres: `(main)` es el escritorio,
// `(empleado)` es el teléfono del obrero y `(jefe)` el del jefe de obra — y justamente a esos dos
// se llega SÓLO con la lente puesta.
export async function AvisoVerComo() {
  const supabase = await createClient()
  const { data: perfilReal } = await getPerfilReal(supabase)
  const estado = await estadoVerComo(perfilReal)
  if (!estado.mirando) return null

  return (
    <BarraVerComo
      mirando={estado.mirando}
      etiqueta={estado.etiqueta ?? estado.mirando}
      roles={ROLES_MIRABLES.map((r) => ({ rol: r, label: ROL_LABEL[r] }))}
    />
  )
}

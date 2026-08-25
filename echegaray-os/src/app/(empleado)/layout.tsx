import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { ShellEmpleado } from '@/features/empleado/components/ShellEmpleado'

// EL MARCO DEL PERFIL EMPLEADO.
//
// Vive FUERA de `(main)` a propósito: `(main)` monta `AppHeader`, que dibuja las dos áreas del ERP.
// El empleado no navega áreas —navega su día— y ofrecerle dos puertas que la base le va a cerrar
// enseña que la pantalla miente. Es la misma razón por la que `/campo` tampoco está adentro.
//
// ═══ ESTO NO ES LA CERRADURA ═══
//
// Que estas pantallas se dibujen no decide qué datos salen: todo lo que leen son las vistas `mi_*`,
// que filtran por `mi_persona_id()` en la base. Un jefe de obra que entre a `/hoy` a mano no ve la
// obra de nadie: ve la suya, o nada si no tiene persona vinculada.

export default async function EmpleadoLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  // NI LAS INICIALES NI LA OBRA VIAJAN POR ACÁ. El topbar de marca lo dibuja M02 —M09 abre con la
  // ficha de la persona y M03…M08 con su topbar de detalle—, así que leerlos en el marco obligaba a
  // consultar el perfil y la obra en las nueve pantallas para pintarlos en una.
  return <ShellEmpleado>{children}</ShellEmpleado>
}

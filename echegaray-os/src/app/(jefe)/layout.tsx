import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { ShellJefe } from '@/features/jefe/components/ShellJefe'

// EL MARCO DEL JEFE DE OBRA EN EL TELÉFONO.
//
// Vive FUERA de `(main)` por el mismo motivo que `(empleado)`: `(main)` monta `AppHeader`, que
// dibuja las dos áreas del ERP con su navegación de escritorio. Estas seis pantallas no son una
// sección del ERP: son el producto que el jefe abre parado en el frente, con una mano.
//
// ═══ ESTO NO ES LA CERRADURA ═══
//
// Que estas pantallas se dibujen no decide qué datos salen. Todo lo que leen son vistas con
// `security_invoker = true` sobre `ve_obra()`: quien entre a mano no ve la obra de nadie, ve las
// suyas — o nada. Y ni una sola consulta de este perfil nombra una columna de dinero.
//
// LAS INICIALES YA NO VIAJAN POR ACÁ. El topbar de marca lo dibuja J01, que es la única pantalla
// que lo tiene (los mockups J02…J06 abren con su propio topbar de detalle): pasarlas por el marco
// obligaba a leer el perfil en las seis para pintarlas en una.
export default async function JefeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  return <ShellJefe>{children}</ShellJefe>
}

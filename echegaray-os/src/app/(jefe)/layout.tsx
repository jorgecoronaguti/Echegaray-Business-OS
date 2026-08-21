import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { inicialesDe } from '@/features/empleado/components/shell-logica'
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
// `inicialesDe` se importa del perfil empleado y no se copia: dos implementaciones del mismo
// círculo terminan mostrando iniciales distintas para la misma persona en dos pantallas.

export default async function JefeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase, user.id)

  return <ShellJefe iniciales={inicialesDe(perfil.data?.nombre, user.email)}>{children}</ShellJefe>
}

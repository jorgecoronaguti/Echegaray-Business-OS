import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { ShellEmpleado } from '@/features/empleado/components/ShellEmpleado'
// `inicialesDe` se importa de la LÓGICA y no del `.tsx`: ese archivo es `'use client'`, y una
// función re-exportada desde un módulo de cliente no se puede llamar desde el servidor —Next la
// convierte en una referencia y tira «Attempted to call inicialesDe() from the server».
import { inicialesDe } from '@/features/empleado/components/shell-logica'

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
  const perfil = await getPerfilActual(supabase, user.id)

  return (
    <ShellEmpleado
      email={user.email ?? null}
      iniciales={inicialesDe(perfil.data?.nombre, user.email)}
      salir={<LogoutButton />}
    >
      {children}
    </ShellEmpleado>
  )
}

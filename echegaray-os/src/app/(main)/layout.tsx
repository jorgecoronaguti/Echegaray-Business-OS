import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { areasDe } from '@/features/auth/types/areas'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { AppHeader } from '@/shared/components/AppHeader'

// EL MARCO DE LA APLICACIÓN — 18/08/2026.
//
// Acá vivían 17 links repartidos en seis grupos (`01 · Obras`, `OS`, `Finanzas`, `Reportes`,
// `Conexiones`, `Administración`) con sus títulos en versalitas arriba. El dueño lo rechazó entero:
// *"está saturado, sin jerarquía y debe rehacerse"* · *"Eso representa arquitectura interna, no
// navegación para usuarios"*. Toda esa estructura se fue a `AppHeader`, que dibuja UNA línea con las
// dos áreas de producto.
//
// LAS RUTAS SIGUEN TODAS VIVAS. `/os`, `/chat`, `/aprobaciones`, `/ingenieria-financiera`,
// `/calendario-financiero`, `/scorecard-finanzas`, `/calendario-caja`, `/flujo-caja`, `/reportes`,
// `/integraciones`, `/descargas`, `/operarios`: ninguna se borró y ninguna cambió. Lo único que
// cambió es que ya no ocupan la navegación principal. El dueño lo pidió así, textual: *"No borrar
// rutas ni funcionalidades. Sólo retirarlas de la navegación principal"*.
//
// Las que siguen siendo parte del trabajo diario —Pedidos de materiales, Herramientas, Movimientos—
// no desaparecieron: bajaron al lugar donde se usan, que es adentro del área (ver `/administracion`
// y la vista «Operación» de cada obra), no arriba de todo en cada pantalla del sistema.

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { email, rolLabel, rol } = await loadUsuario()

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader areas={areasDe(rol)} email={email} rolLabel={rolLabel} salir={<LogoutButton />} />
      <main>{children}</main>
    </div>
  )
}

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { email: null, rolLabel: null, rol: null }
    const perfil = await getPerfilActual(supabase)
    return {
      email: user.email ?? null,
      rolLabel: perfil.data ? ROL_LABEL[perfil.data.rol] : 'Sin rol asignado',
      rol: perfil.data?.rol ?? null,
    }
  } catch {
    // Sin perfil legible se cae al nivel MENOS privilegiado (`areasDe(null)` → sólo Obras), nunca al
    // más. Un error de lectura no puede ser una puerta a la economía de la empresa.
    return { email: null, rolLabel: null, rol: null }
  }
}

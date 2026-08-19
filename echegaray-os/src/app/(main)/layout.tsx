import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { areasDe } from '@/features/auth/types/areas'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { AppHeader } from '@/shared/components/AppHeader'
import { HeaderEsqueleto } from '@/shared/components/carga'

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

// ═══ EL MARCO SE PINTA ANTES DE SABER QUIÉN ENTRÓ (19/08/2026) ═══
//
// Este layout era `async` y esperaba `loadUsuario()` —dos llamadas a Supabase— antes de devolver una
// sola etiqueta. Como TODA página de este grupo es `force-dynamic`, esa espera se sumaba a la de la
// página y el navegador no pintaba NADA hasta que terminaban las dos: el *"no responde, no se mueve,
// nada"* del dueño. Medido contra producción el 19/08, una pantalla de este grupo tardaba ~95 s en
// contestar, y esos 95 s eran de pantalla anterior congelada, sin una sola señal.
//
// Ahora el layout es SÍNCRONO y la parte que depende del servidor —quién sos y qué áreas ves— cuelga
// de un `<Suspense>`. El documento sale por streaming: marco, header y el esqueleto del `loading.tsx`
// primero; el contenido, cuando esté. Lo que se muestra sigue dependiendo del rol exactamente igual:
// `HeaderConUsuario` es el mismo código de antes, corriendo en el servidor.
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <Suspense fallback={<HeaderEsqueleto />}>
        <HeaderConUsuario />
      </Suspense>
      <main>{children}</main>
    </div>
  )
}

async function HeaderConUsuario() {
  const { email, rolLabel, rol } = await loadUsuario()
  return <AppHeader areas={areasDe(rol)} email={email} rolLabel={rolLabel} salir={<LogoutButton />} />
}

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { email: null, rolLabel: null, rol: null }
    // El id ya está: `getPerfilActual()` sin él volvía a preguntarle a Supabase quién es el usuario.
    const perfil = await getPerfilActual(supabase, user.id)
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

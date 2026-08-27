import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { ROL_LABEL } from '@/features/auth/types'
import { puedeVerRuta } from '@/features/auth/types/areas'
import { solapasDeNav } from '@/features/auth/types/navegacion'
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
// EN AQUEL MOMENTO NO SE BORRÓ NINGUNA. El dueño lo pidió así, textual: *"No borrar rutas ni
// funcionalidades. Sólo retirarlas de la navegación principal"* — retirar un link es reversible en
// una línea y borrar una ruta no, así que primero se retiraron y se dejó pasar el tiempo.
//
// NUEVE MESES DESPUÉS, EL 27/08/2026, SE BORRARON LAS QUE NADIE VOLVIÓ A ENLAZAR: `/chat`,
// `/ingenieria-financiera`, `/scorecard-finanzas`, `/calendario-caja`, `/comunicacion`,
// `/control-obras`, `/operarios` y `/descargar`. La evidencia de que estaban muertas es que en todo
// `src/` no quedaba un solo `href`, `Link`, `router.push` ni `redirect` apuntándoles: no eran
// pantallas retiradas de la navegación, eran pantallas a las que sólo se llegaba escribiendo la URL
// a mano. Siguen vivas `/os`, `/aprobaciones`, `/calendario-financiero`, `/flujo-caja`,
// `/reportes`, `/integraciones` y `/descargas`.
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
  const { nombre, email, rolLabel, rol } = await loadUsuario()
  return (
    <AppHeader
      solapas={solapasDeNav(rol)}
      nombre={nombre}
      email={email}
      rolLabel={rolLabel}
      // El mismo portero que el middleware: si la ruta le está cerrada, el ítem del menú no existe.
      verUsuarios={puedeVerRuta(rol, '/administracion/usuarios')}
      salir={<LogoutButton />}
    />
  )
}

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { nombre: null, email: null, rolLabel: null, rol: null }
    // El id ya está: `getPerfilActual()` sin él volvía a preguntarle a Supabase quién es el usuario.
    const perfil = await getPerfilActual(supabase, user.id)
    return {
      // El nombre es sólo para las iniciales del avatar: si el perfil no lo tiene, `iniciales()`
      // se cae al correo. Nunca se dibuja entero en el header.
      nombre: perfil.data?.nombre ?? null,
      email: user.email ?? null,
      rolLabel: perfil.data ? ROL_LABEL[perfil.data.rol] : 'Sin rol asignado',
      rol: perfil.data?.rol ?? null,
    }
  } catch {
    // Sin perfil legible se cae al nivel MENOS privilegiado (`solapasDeNav(null)` → sólo Obras), nunca al
    // más. Un error de lectura no puede ser una puerta a la economía de la empresa.
    return { nombre: null, email: null, rolLabel: null, rol: null }
  }
}

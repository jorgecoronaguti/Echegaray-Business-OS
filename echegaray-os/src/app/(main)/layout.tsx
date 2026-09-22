import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual, getPerfilReal } from '@/features/auth/services/authService'
import { estadoVerComo } from '@/features/auth/services/verComo'
import { ROL_LABEL } from '@/features/auth/types'
import { puedeVerRuta } from '@/features/auth/types/areas'
import { solapasDeNav } from '@/features/auth/types/navegacion'
import { LogoutButton } from '@/features/auth/components/LogoutButton'
import { AvisoVerComo } from '@/features/auth/components/AvisoVerComo'
import { AppHeader } from '@/shared/components/AppHeader'
import { HeaderEsqueleto } from '@/shared/components/carga'
import { DeshacerProvider } from '@/shared/components/deshacer/DeshacerProvider'
import { ProveedorTiempoReal } from '@/shared/tiempo-real/ProveedorTiempoReal'

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
      {/* EL AVISO Y EL HEADER SE PEGAN JUNTOS. Los dos son `sticky top-0`: sueltos, el de arriba
          tapaba al otro al scrollear y el header desaparecía. Pegados en UN contenedor sticky, la
          franja de «ver como» y la navegación viajan como un bloque — que es lo que son mientras la
          lente está puesta. Sin lente, `AvisoVerComo` devuelve `null` y el contenedor mide lo mismo
          que el header solo: la geometría de siempre. */}
      <div className="sticky top-0 z-40">
        <Suspense fallback={null}>
          <AvisoVerComo />
        </Suspense>
        <Suspense fallback={<HeaderEsqueleto />}>
          <HeaderConUsuario />
        </Suspense>
      </div>
      {/* CMD/CTRL+Z EN TODA LA PLATAFORMA (dueño, 15/09/2026): un solo proveedor para todas las pantallas. */}
      <DeshacerProvider>
        {/* TIEMPO REAL (dueño, 15/09/2026): un canal por pestaña; cada pantalla declara sus tablas. */}
        <ProveedorTiempoReal>
          <main>{children}</main>
        </ProveedorTiempoReal>
      </DeshacerProvider>
    </div>
  )
}

async function HeaderConUsuario() {
  const { nombre, email, rolLabel, rol, verComo } = await loadUsuario()
  return (
    <AppHeader
      solapas={solapasDeNav(rol)}
      nombre={nombre}
      email={email}
      rolLabel={rolLabel}
      // El mismo portero que el middleware: si la ruta le está cerrada, el ítem del menú no existe.
      verUsuarios={puedeVerRuta(rol, '/administracion/usuarios')}
      // MISMA PUERTA QUE LA PANTALLA. Si el rol no puede abrir Personal, el menú no le ofrece un
      // atajo que el middleware va a rebotar: un ítem que no puede funcionar enseña que la app miente.
      cargaAsistencia={puedeVerRuta(rol, '/administracion/personas')}
      // «VER COMO» (dueño, 22/09/2026). Va con el rol REAL, no con el mirado: preguntando por el
      // mirado, un Dirección que se puso los ojos de `campo` perdería el menú desde el que salir.
      verComo={verComo}
      salir={<LogoutButton />}
    />
  )
}

async function loadUsuario() {
  try {
    const supabase = await createClient()
    const user = await getUsuarioActual(supabase)
    if (!user) return { nombre: null, email: null, rolLabel: null, rol: null, verComo: { puede: false, mirando: null } }
    // El id ya está: `getPerfilActual()` sin él volvía a preguntarle a Supabase quién es el usuario.
    const perfil = await getPerfilActual(supabase, user.id)
    // El real sale del MISMO memo por request: no es un viaje más a Postgres.
    const real = await getPerfilReal(supabase, user.id)
    const lente = await estadoVerComo(real.data)
    return {
      verComo: { puede: lente.puede, mirando: lente.mirando },
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
    return { nombre: null, email: null, rolLabel: null, rol: null, verComo: { puede: false, mirando: null } }
  }
}

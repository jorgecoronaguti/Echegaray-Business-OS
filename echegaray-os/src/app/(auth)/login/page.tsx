import { LoginForm } from '@/features/auth/components/LoginForm'
import { MarcoAuth } from '@/features/auth/components/MarcoAuth'

// M01 · LA PUERTA ÚNICA DE LA GENTE DE ADENTRO. El marco —isotipo + wordmark en dos renglones,
// columna de 430px sobre blanco, la ayuda al pie— es el de `M01 · Login.dc.html` y vive en
// `MarcoAuth`, que es el mismo de recuperación y contraseña nueva: tres pantallas sin sesión con un
// solo encabezado, no tres copias que se van separando de a un píxel.
//
// ═══ EL TÍTULO LE HABLABA A UNA SOLA DE LAS CUATRO IDENTIDADES (08/09/2026) ═══
//
// Decía «Entrá a tu obra», que es el mockup de la pantalla del operario. Por esta misma puerta
// entran Dirección, Administración y el jefe de obra, y ninguno de los tres entra «a una obra»:
// entran al sistema. Peor todavía, «tu obra» es exactamente lo que un CLIENTE cree que le están
// ofreciendo —el portal del cliente, que es la otra puerta, se titula «Ingresá»—: los dos rótulos
// estaban al revés. Ahora dice lo que es, y sirve para los cuatro.
//
// El `?registrado=1` se fue con `/signup` el 27/08/2026: era el cartel «cuenta creada» del alta
// libre, que ya no existe. Un cartel que ninguna pantalla puede encender es código que miente sobre
// lo que el sistema hace.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ volver?: string; cerraste?: string }>
}) {
  const { volver, cerraste } = await searchParams
  return (
    <MarcoAuth
      titulo="Entrá al OS de Echegaray"
      bajada="Con el usuario y la contraseña que te dio la empresa."
    >
      {cerraste && (
        <p
          data-testid="aviso-cerraste"
          className="mb-4 rounded-card border border-line bg-canvas px-3.5 py-2.5 text-[13px] text-muted"
        >
          Cerraste sesión. Cuando quieras volver, entrá de nuevo acá.
        </p>
      )}

      <LoginForm volver={volver} />
    </MarcoAuth>
  )
}

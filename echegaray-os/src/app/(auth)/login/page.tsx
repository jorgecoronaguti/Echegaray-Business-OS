import { LoginForm } from '@/features/auth/components/LoginForm'
import { MarcoAuth } from '@/features/auth/components/MarcoAuth'

// LA PRIMERA PANTALLA. El marco —logo entero, columna de 384px, sin card flotante— vive en
// `MarcoAuth`, que es el mismo de alta, recuperación y contraseña nueva: cuatro pantallas sin sesión
// con un solo encabezado, no cuatro copias que se van separando de a un píxel.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>
}) {
  const { registrado } = await searchParams
  return (
    <MarcoAuth titulo="Ingresar" bajada="Business OS · gestión interna">
      {registrado && (
        <p className="mb-4 rounded-card border border-pos/25 bg-pos-soft px-3.5 py-2.5 text-[13px] text-pos">
          Cuenta creada. Ya podés ingresar — el rol lo asigna Administración.
        </p>
      )}

      <LoginForm />
    </MarcoAuth>
  )
}

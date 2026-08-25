import { LoginForm } from '@/features/auth/components/LoginForm'
import { MarcoAuth } from '@/features/auth/components/MarcoAuth'

// M01 · LA PRIMERA PANTALLA. El marco —isotipo + wordmark en dos renglones, columna de 430px sobre
// blanco, la ayuda al pie— es el de `M01 · Login.dc.html` y vive en `MarcoAuth`, que es el mismo de
// alta, recuperación y contraseña nueva: cuatro pantallas sin sesión con un solo encabezado, no
// cuatro copias que se van separando de a un píxel.
//
// El título es el del mockup —«Entrá a tu obra»— y la bajada dice la verdad de este OS: el
// artboard promete «con el celular que registró la empresa» y acá se entra con el usuario. El
// porqué está en `LoginForm`.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>
}) {
  const { registrado } = await searchParams
  return (
    <MarcoAuth
      titulo="Entrá a tu obra"
      bajada="Con el usuario que te dio la empresa."
      ayuda="Si no tenés acceso o cambiaste de correo, pedile a la oficina que lo actualice."
    >
      {registrado && (
        <p className="mb-4 rounded-card border border-pos/25 bg-pos-soft px-3.5 py-2.5 text-[13px] text-pos">
          Cuenta creada. Ya podés ingresar — el rol lo asigna Administración.
        </p>
      )}

      <LoginForm />
    </MarcoAuth>
  )
}

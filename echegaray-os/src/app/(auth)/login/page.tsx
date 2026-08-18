import Image from 'next/image'
import { LoginForm } from '@/features/auth/components/LoginForm'

// LA PRIMERA PANTALLA — y la única donde la marca va entera.
//
// Adentro del OS el isotipo mide 26px y el logotipo es una palabra: ahí la marca es una firma, no el
// contenido. Acá todavía no hay contenido, así que el logo completo es lo correcto — y es el archivo
// oficial del dueño (`public/marca/logo.png`), no un redibujo.
//
// Sin gradiente, sin card flotando en el medio de un fondo de color, sin ilustración: el dueño pidió
// *"software operativo moderno, sobrio y extremadamente claro"* y *"no imitar la UI de un banco"*.
// Una pantalla de login que parece una landing es exactamente lo que no se quiere.

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registrado?: string }>
}) {
  const { registrado } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      {/* 384px: la medida de un formulario de una sola columna. Más ancho obliga a barrer el ojo de
          punta a punta para leer una etiqueta de dos palabras. */}
      <div className="w-full max-w-sm">
        <Image
          src="/marca/logo.png"
          alt="Echegaray Construcciones"
          width={578}
          height={432}
          priority
          className="mb-8 h-auto w-[188px]"
        />
        <h1 className="text-[20px] font-semibold leading-tight text-ink">Ingresar</h1>
        <p className="mt-1 mb-6 text-[13px] text-muted">Business OS · gestión interna</p>

        {registrado && (
          <p className="mb-4 rounded-card border border-pos/25 bg-pos-soft px-3.5 py-2.5 text-[13px] text-pos">
            Cuenta creada. Ya podés ingresar — el rol lo asigna Administración.
          </p>
        )}

        <LoginForm />
      </div>
    </div>
  )
}

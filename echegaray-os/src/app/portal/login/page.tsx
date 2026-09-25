import { redirect } from 'next/navigation'
import { Formulario } from './Formulario'
import { sesionDelPortal } from '../sesion'

export const metadata = { title: 'Echegaray Construcciones · Ingresá' }
export const dynamic = 'force-dynamic'

export default async function Login() {
  // Con sesión viva no se muestra la puerta: se entra.
  if (await sesionDelPortal()) redirect('/portal')

  return (
    // El panel derecho de la maqueta es superficie en calma, sin contenido. En el teléfono no entra:
    // 42% de 390px no es un panel, es un margen — así que desaparece y el formulario ocupa todo.
    <main className="flex min-h-dvh bg-surface text-ink">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-[clamp(40px,7vw,100px)]">
        <Formulario />
      </div>
      <div className="hidden w-[42%] border-l border-line bg-surface-quiet md:block" />
    </main>
  )
}

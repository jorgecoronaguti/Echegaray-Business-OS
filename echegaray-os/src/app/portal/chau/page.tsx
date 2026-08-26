import Link from 'next/link'
import { IconoFlecha } from '../iconos'

// LA DESPEDIDA — la única pantalla del portal que se ve SIN sesión y a propósito.
//
// ═══ POR QUÉ NO ALCANZABA CON VOLVER AL LOGIN ═══
//
// «Salir» devolvía al formulario de ingreso: la pantalla se ve casi igual que antes, así que cerrar
// la sesión parecía que había fallado y nadie sabía si de verdad se había cerrado. Y para el dueño
// era peor — como su sesión del OS seguía viva, el middleware lo expulsaba del portal y terminaba
// dentro de su propio sistema: «la splash page tiene que ser un logout externo; ahora está llevando
// a una pantalla de mi propio sistema».
//
// Acá no hay nada del cliente ni nada del OS: la marca, la confirmación, y una puerta para volver.

export const metadata = { title: 'Sesión cerrada · Echegaray Construcciones' }

export default function Chau() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center text-ink">
      <img src="/marca/logo.png" alt="Echegaray Construcciones" width={196} height={44}
        className="h-auto w-[196px] max-w-full" />
      <h1 className="mt-9 text-[24px] font-semibold tracking-[-.02em]">Cerraste la sesión</h1>
      <p className="mt-2 max-w-[380px] text-[14px] leading-relaxed text-muted">
        Gracias por pasar. Cuando quieras volver a ver tu obra, entrá con tu correo.
      </p>
      <Link
        href="/portal/login"
        className="mt-8 flex min-h-[48px] items-center gap-2 rounded-[8px] bg-marca px-6 text-[15px] font-semibold text-ink"
      >
        Volver a entrar
        <IconoFlecha tamano={18} />
      </Link>
    </main>
  )
}

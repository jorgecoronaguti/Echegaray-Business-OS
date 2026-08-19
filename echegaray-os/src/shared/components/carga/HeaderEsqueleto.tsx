import Image from 'next/image'
import { Linea } from './Esqueleto'

// EL HEADER MIENTRAS SE AVERIGUA QUIÉN ENTRÓ.
//
// La marca y la altura son lo mismo que en `AppHeader` (48px, `h-12`): lo único que falta es lo que
// depende del servidor —las áreas que le tocan a este usuario y su email—. Sin este fallback, el
// marco entero de la aplicación esperaba las dos consultas de sesión antes de pintar el primer
// píxel, y el usuario miraba una pantalla en blanco durante toda esa espera.
export function HeaderEsqueleto() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface" data-testid="app-header-esqueleto">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-1 px-4 sm:px-6">
        <span className="mr-3 flex shrink-0 items-center gap-2">
          <Image src="/marca/isotipo.png" alt="" width={26} height={26} priority className="h-[26px] w-[26px]" />
          <span className="hidden text-[13px] font-semibold tracking-[0.14em] text-ink sm:block">
            ECHEGARAY<span className="hidden lg:inline"> CONSTRUCCIONES</span>
          </span>
        </span>
        <span className="flex items-center gap-3 motion-safe:animate-pulse">
          <Linea className="h-2.5 w-24" />
          <Linea className="h-2.5 w-16" />
        </span>
      </div>
    </header>
  )
}

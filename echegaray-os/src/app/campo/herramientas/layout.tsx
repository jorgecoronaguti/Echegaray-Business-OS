import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// HERRAMIENTAS EN EL TELÉFONO (M01–M14). El proveedor de tiempo real lo pone `/campo/layout.tsx`; acá
// se declaran las tablas: lo que se mueve desde la oficina aparece en la obra sin recargar.
export default function CampoHerramientasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.herramientas} />
      {children}
    </>
  )
}

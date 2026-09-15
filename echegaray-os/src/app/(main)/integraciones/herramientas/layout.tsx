import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 15/09/2026). Herramientas y sus movimientos.
// En el layout y no en cada página: cubre todos los `return` (vacío, error, contenido) y las rutas
// de abajo. No dibuja nada.
export default function HerramientasEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.herramientas} />
      {children}
    </>
  )
}

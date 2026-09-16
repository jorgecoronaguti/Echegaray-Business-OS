import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 16/09/2026): lo que resuelve otro usuario sale solo de la lista.
export default function PendientesEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.pendientes} />
      {children}
    </>
  )
}

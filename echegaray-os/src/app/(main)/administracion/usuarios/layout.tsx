import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 16/09/2026): altas y obras asignadas que carga otro usuario.
export default function UsuariosEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.usuarios} />
      {children}
    </>
  )
}

import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 16/09/2026): movimientos y pedidos que carga otro usuario.
export default function IntegracionesEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.integraciones} />
      {children}
    </>
  )
}

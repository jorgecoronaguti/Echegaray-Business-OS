import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 16/09/2026): lo que administración corrige de mis horas o mi legajo.
export default function MiCuentaEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.miCuenta} />
      {children}
    </>
  )
}

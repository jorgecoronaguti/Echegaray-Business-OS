// ANALÍTICAS ES NIVEL 1 (dueño, 17/09/2026): la lectura económica de toda la cartera. Como Presupuestos,
// no dibuja la barra de Administración: su nivel 2 son sus propias vistas, que dibuja la página.
import type { ReactNode } from 'react'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

export default function AnaliticasLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.analiticas} />
      {children}
    </>
  )
}

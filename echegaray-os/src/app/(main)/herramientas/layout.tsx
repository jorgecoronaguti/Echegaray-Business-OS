import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// HERRAMIENTAS — el cuarto destino de nivel 1 (dueño, 21/09/2026: «Administración · Obras · Analíticas ·
// Herramientas»). Escucha las tablas nuevas: lo que se mueve desde el teléfono aparece acá sin recargar.
export default function HerramientasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.herramientas} />
      {children}
    </>
  )
}

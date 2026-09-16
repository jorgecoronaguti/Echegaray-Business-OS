import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL: cuando el sincronizador de impuestos escribe (cada 2 h, o una DDJJ nueva), la pantalla
// abierta se refresca sola. En el layout para cubrir todos los `return` de la página.
export default function ImpuestosEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.impuestos} />
      {children}
    </>
  )
}

import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'

// TIEMPO REAL (dueño, 15/09/2026). Cartera, Gantt y ficha de obra con todas sus vistas.
// En el layout y no en cada página: cubre todos los `return` (vacío, error, contenido) y las rutas
// de abajo. No dibuja nada.
export default function ObrasEnVivoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RefrescarEnVivo tablas={TABLAS_DE.fichaObra} />
      {/* EL INTERLINEADO DEL DISEÑO ERP OBRAS: el `.dc.html` no fija `line-height` y el navegador usa el
          «normal» de IBM Plex Sans (~1,25: 19px → 24, 12px → 15). La app hereda 1,5 del cuerpo y cada
          pantalla de Obras bajaba 8–20 px. Sólo en /obras: `display: contents` no agrega caja al layout
          y el interlineado se hereda igual. Los textos largos que fijan el suyo lo conservan. */}
      <div style={{ display: 'contents', lineHeight: 1.25 }} data-alcance="obras">{children}</div>
    </>
  )
}

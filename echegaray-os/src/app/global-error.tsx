'use client'

import './globals.css'
import { EstadoError } from '@/shared/components/estado'

// LA ÚLTIMA RED: falló el layout RAÍZ.
//
// Reemplaza el documento entero —por eso dibuja `<html>` y `<body>` a mano— y es lo único que se
// interpone entre un fallo del layout raíz y una pantalla blanca sin una sola palabra. Importa
// `globals.css` por la misma razón: sin el layout no hay tokens ni tipografía, y un error sin
// estilos se lee como una app rota además de caída.
//
// El `lang="es"` no es cosmético: es la única pantalla del OS que se dibuja fuera del layout, y sin
// él el navegador ofrece traducir del inglés lo que ya está en español.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <EstadoError error={error} reset={reset} que="el sistema" testid="estado-error-global" />
      </body>
    </html>
  )
}

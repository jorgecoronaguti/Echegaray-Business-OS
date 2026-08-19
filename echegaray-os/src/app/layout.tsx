import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import { siteUrl } from '@/lib/site-url'
import { IndicadorNavegacion } from '@/shared/components/carga'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Echegaray Business OS',
  description: 'Sistema de gestión interno de Echegaray Construcciones',
}

// EL COLOR DE LA BARRA DEL NAVEGADOR EN EL TELÉFONO. Es el grafito del logotipo (#30302F, medido
// del logo oficial): en Android la barra de estado toma este color y la app deja de tener un borde
// blanco arriba que no es de nadie. El amarillo no va acá — es la marca, no el chrome.
export const viewport: Viewport = {
  themeColor: '#30302f',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        {/* LA ÚNICA SEÑAL GLOBAL DE QUE EL SISTEMA ESTÁ TRABAJANDO. Va en la raíz —y no en el layout
            de `(main)`— porque el login y la pantalla de campo esperan lo mismo que el resto. El
            `<Suspense>` es requisito de `useSearchParams`: sin él, una pantalla prerenderizada
            fallaría el build entero por un indicador. */}
        <Suspense fallback={null}>
          <IndicadorNavegacion />
        </Suspense>
        {children}
      </body>
    </html>
  )
}

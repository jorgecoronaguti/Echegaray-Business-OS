import type { Metadata, Viewport } from 'next'
import './globals.css'
import { siteUrl } from '@/lib/site-url'

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
      <body>{children}</body>
    </html>
  )
}

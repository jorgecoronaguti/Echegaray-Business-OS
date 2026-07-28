import type { Metadata } from 'next'
import './globals.css'
import { siteUrl } from '@/lib/site-url'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: 'Echegaray Business OS',
  description: 'Sistema de gestión interno de Echegaray Construcciones',
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

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
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

import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
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

// LA TIPOGRAFÍA DEL SISTEMA — decisión canónica del handoff (`design/system/TYPOGRAPHY.md`).
//
// IBM Plex Sans para la interfaz e IBM Plex Mono para todo lo que se compara con la vista: fechas,
// HH, importes, %, CUIT, códigos. La escala tipográfica del design system está calibrada sobre esta
// familia, así que servirla no es cosmética: con el stack del sistema los 13px de celda y los 10px
// de encabezado de tabla no miden lo mismo y la densidad se corre.
//
// `next/font/google` descarga los archivos EN EL BUILD y los sirve desde el propio dominio. No hay
// pedido a fonts.googleapis.com en tiempo de ejecución —ni latencia de terceros, ni un salto de
// fuente cuando llega— y `display: 'swap'` garantiza que el texto se lee desde el primer frame.
// Los pesos son exactamente los nueve estilos de la escala: no hay un décimo que cargar.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-plex-sans',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-plex-mono',
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${plexSans.variable} ${plexMono.variable}`}>
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

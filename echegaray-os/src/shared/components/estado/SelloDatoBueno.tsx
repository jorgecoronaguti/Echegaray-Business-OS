'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { sellarDatoBueno } from './frescura'

// EL SELLO DE «ACÁ HUBO DATOS», puesto por la pantalla que efectivamente se dibujó.
//
// Va montado dentro de `PageShell`, que es el marco de toda pantalla del OS. Si la página lanza,
// Next dibuja el `error.tsx` en su lugar, `PageShell` no llega a renderizarse y el sello conserva
// la hora de la última vez que hubo dato de verdad — que es exactamente lo que el cartel de error
// necesita mostrar.
//
// NO SELLA SI LA PANTALLA ESTÁ MOSTRANDO UN ERROR. Media docena de pantallas capturan el fallo de
// su fuente y dibujan un `Aviso` `neg` dentro del marco normal: ahí el `PageShell` sí se renderiza,
// pero no hubo dato. La marca `data-tono="neg"` del `Aviso` es la señal, y en la duda NO se sella:
// un sello de más convierte el cartel de error en un mentiroso prolijo, y un sello de menos sólo
// hace que diga «sin lectura previa», que es verdad más veces de las que molesta.

export function SelloDatoBueno() {
  const pathname = usePathname()
  useEffect(() => {
    if (document.querySelector('[data-tono="neg"]')) return
    sellarDatoBueno(pathname ?? '')
  }, [pathname])
  return null
}

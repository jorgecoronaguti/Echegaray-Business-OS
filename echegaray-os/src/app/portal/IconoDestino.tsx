'use client'

// EL PUENTE ENTRE EL NOMBRE DEL DESTINO Y SU DIBUJO.
//
// `destinos.ts` no puede tener JSX —es lo que se prueba con `node --test`, que no carga `.tsx`— así
// que guarda el nombre del icono y la resolución vive acá. Un `switch` y no un objeto suelto: si
// mañana entra un destino nuevo, TypeScript obliga a darle icono en vez de dejarlo sin dibujo.

import type { Destino } from './destinos'
import {
  IconoInicio, IconoPagos, IconoFactura, IconoCarpeta, IconoTerminadas, IconoReloj,
} from './iconos'

export function IconoDestino({ icono, tamano }: { icono: Destino['icono']; tamano: number }) {
  switch (icono) {
    case 'inicio': return <IconoInicio tamano={tamano} />
    case 'pagos': return <IconoPagos tamano={tamano} />
    case 'facturas': return <IconoFactura tamano={tamano} />
    case 'documentos': return <IconoCarpeta tamano={tamano} />
    case 'terminadas': return <IconoTerminadas tamano={tamano} />
    // Avance todavía no existe: el reloj dice «más adelante» sin prometer nada.
    case 'avance': return <IconoReloj tamano={tamano} />
  }
}

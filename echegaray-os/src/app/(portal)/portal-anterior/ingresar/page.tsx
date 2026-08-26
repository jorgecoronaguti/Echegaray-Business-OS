import type { Metadata } from 'next'
import { IngresoPortal } from '@/features/portal/components/IngresoPortal'

// `30` · EL INGRESO AL PORTAL. Es la única pantalla del OS a la que llega alguien que no trabaja acá.
//
// Es PÚBLICA por definición —quien la abre todavía no tiene sesión— y por eso `/portal/ingresar`
// está en `RUTAS_PUBLICAS`. Lo que decide quién entra no es esta pantalla: es la lista de mails
// habilitados de `cliente_acceso`, que se carga en la 31.

export const metadata: Metadata = {
  title: 'Ingresar al portal · Echegaray Construcciones',
  // Ninguna pantalla del portal se indexa: son datos de un cliente, no un sitio público.
  robots: { index: false, follow: false },
}

export default function IngresarPage() {
  return <IngresoPortal />
}

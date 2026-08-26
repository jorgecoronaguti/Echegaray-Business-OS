import type { Metadata } from 'next'
import { PortalCliente } from '@/features/portal/components/PortalCliente'
import { cargarPortal } from '@/features/portal/services/cargarPortal'

// `29 · Portal del Cliente` — lo que el cliente ve de su obra: Mi obra · Certificados y pagos ·
// Documentos. A 390px es `30 · Portal Cliente Mobile`: misma ruta, mismos componentes, otra
// composición (ver `PortalCliente`).
//
// SIN `obraId`: abre la primera obra que el acceso puede ver. El selector del header lleva a
// `/portal/obra/<id>`, que es la misma pantalla con otra obra — así el cliente puede guardar el
// enlace de LA obra que mira siempre.

export const metadata: Metadata = {
  title: 'Su obra · Echegaray Construcciones',
  robots: { index: false, follow: false },
}

// La sesión y los permisos deciden qué sale: nada de esto se puede servir desde una caché estática.
export const dynamic = 'force-dynamic'

export default async function PortalPage() {
  const datos = await cargarPortal()
  return <PortalCliente {...datos} />
}

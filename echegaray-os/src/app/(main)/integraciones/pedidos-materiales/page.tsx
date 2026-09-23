// `/integraciones/pedidos-materiales` → `/herramientas/material` (dueño, 23/09/2026).
//
// Era la tabla del espejo de AppSheet bajo «Operación», y la tarjeta «Material» del teléfono la abría
// en 390px. El módulo Material vive ahora en Herramientas (computadora) y en `/campo/material`
// (teléfono), con el mismo nombre y la misma tabla. La URL se conserva porque circula: sólo redirige.
import { redirect } from 'next/navigation'
import { HREF_MATERIAL_ESCRITORIO } from '@/features/materiales/logica/pedidos'

export default function PedidosMaterialesPage() {
  redirect(HREF_MATERIAL_ESCRITORIO)
}

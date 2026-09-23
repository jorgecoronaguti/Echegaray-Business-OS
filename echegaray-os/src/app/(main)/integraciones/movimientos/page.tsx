// `/integraciones/movimientos` → `/herramientas/movimientos` (dueño, 23/09/2026 · mapa de pantallas, duda 6).
//
// Era la tabla vieja de movimientos (`herramientas`, hoy una vista de sólo lectura) dibujada bajo
// «Operación». El módulo Herramientas (21/09) tiene su propio historial y es la única fuente. La URL
// se conserva porque circula: sólo redirige.
import { redirect } from 'next/navigation'

export default function MovimientosPage() {
  redirect('/herramientas/movimientos')
}

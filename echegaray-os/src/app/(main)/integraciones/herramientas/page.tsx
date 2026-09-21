import { redirect } from 'next/navigation'

// LA PANTALLA VIEJA DE HERRAMIENTAS SE MUDÓ (21/09/2026). El inventario, los movimientos y la ficha
// viven ahora en el módulo Herramientas (nivel 1), sobre `activo` / `ubicacion` / `activo_movimiento`.
// Lo que escribía acá (`registrar_movimiento_herramienta`, updates a `herramientas`) dejó de existir con
// la migración 20260921T2100: esa tabla es ahora una vista de sólo lectura.
export default function IntegracionesHerramientasPage() {
  redirect('/herramientas')
}

// `/administracion/base-maestra` no es una pantalla: es el nombre de la sección.
//
// Entra por Tareas tipo porque es el eslabón de arriba de la cadena —una tarea tipo usa recursos, no
// al revés— y porque es la pregunta que trae a alguien acá: «¿qué sabemos hacer y cuánto rinde?».

import { redirect } from 'next/navigation'
import { RUTA_TAREAS } from '@/features/base-maestra/components/NavBaseMaestra'

export default function BaseMaestraPage() {
  redirect(RUTA_TAREAS)
}

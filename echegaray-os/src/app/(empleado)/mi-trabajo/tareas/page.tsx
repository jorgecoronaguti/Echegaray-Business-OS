import { redirect } from 'next/navigation'

// «MIS TAREAS» SE FUSIONÓ CON «MI TRABAJO» (M03, 24/08/2026).
//
// Eran dos pantallas con la misma lista: `/mi-trabajo` mostraba las de hoy plegadas y esta las
// mostraba otra vez con tres solapas. El mockup del dueño deja UNA: los tres filtros viven ahora en
// los chips de `/mi-trabajo`.
//
// LA RUTA NO SE BORRA, REDIRIGE. Está en el historial de los teléfonos que ya la abrieron y en
// enlaces viejos; devolver un 404 por haber unificado dos pantallas es cobrarle al usuario una
// decisión de diseño. `?ver=` no se arrastra a propósito: las solapas viejas (`proximas`,
// `completadas`) no son los filtros nuevos, y traducir a ojo mandaría a alguien a la lista
// equivocada sin avisarle.
export default function MisTareasPage() {
  redirect('/mi-trabajo')
}

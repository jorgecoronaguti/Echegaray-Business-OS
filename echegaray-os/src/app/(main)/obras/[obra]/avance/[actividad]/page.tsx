// `/obras/<obra>/avance/<actividad>` — diseño viejo retirado (ERP Obras, 23/09/2026).
//
// Registrar avance vive en el panel de la tarea del 04 (`PanelTarea` → `FormAvanceEmbebido`), que
// es el MISMO formulario que dibujaba esta pantalla entera: dos envases del mismo acto se contestan
// distinto el día que a uno se le agregue un campo. La URL sigue viva —marcadores, links de chat,
// tests— y abre el árbol de Ítems con el panel de esa actividad.

import { redirect } from 'next/navigation'

export default async function RegistrarAvancePage({ params }: {
  params: Promise<{ obra: string; actividad: string }>
}) {
  const { obra, actividad } = await params
  redirect(`/obras/${obra}?vista=tareas&sub=arbol&act=${actividad}`)
}

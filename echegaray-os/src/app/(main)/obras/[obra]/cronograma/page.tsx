// `/obras/<obra>/cronograma` — diseño viejo retirado (ERP Obras, 23/09/2026): el único cronograma es
// el del workspace de Trabajo (07/C06). La URL sigue viva porque está en marcadores, en links de chat
// y en los tests, y lleva derecho a `?vista=tareas&sub=gantt` (`hrefCronograma`).

import { redirect } from 'next/navigation'
import { hrefCronograma } from '@/features/obras/services/vistasObra'

export default async function CronogramaObraPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra } = await params
  redirect(hrefCronograma(obra))
}

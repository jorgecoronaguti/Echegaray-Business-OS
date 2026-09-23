// LA 06 · AVANCE MASIVO SE RETIRÓ (diseño ERP Obras C09, 23/09/2026): «varias a la vez» vive en el
// árbol de Ítems con la selección (`?sel=1`). La URL vieja sigue en marcadores y en `AccionesRapidas`:
// redirige en vez de caer en 404.

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AvanceMasivoPage({ params }: { params: Promise<{ obra: string }> }) {
  const { obra } = await params
  redirect(`/obras/${obra}?vista=tareas&sub=arbol&sel=1`)
}

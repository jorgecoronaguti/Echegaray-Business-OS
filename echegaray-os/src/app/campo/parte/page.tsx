import { redirect } from 'next/navigation'

// EL PARTE DEL DÍA SE CARGA EN UN SOLO LUGAR (dueño, 24/09/2026): Mi obra › Avance masivo. Esta ruta
// queda como puerta para los enlaces viejos y lleva ahí con la misma obra.

export const dynamic = 'force-dynamic'

export default async function ParteCampoPage({ searchParams }: { searchParams: Promise<{ obra?: string }> }) {
  const pedida = (await searchParams).obra
  redirect(pedida ? `/obra/avance-masivo?obra=${encodeURIComponent(pedida)}` : '/obra/avance-masivo')
}

'use client'

import Link from 'next/link'
import { useObraRecordada } from '@/shared/hooks/useObraRecordada'

// «← VOLVER» DE LAS PANTALLAS DE TRABAJO (24/09/2026). Para el jefe, a su «Hoy» CON la obra que tiene
// elegida; para el resto, a `/campo`, que el middleware reparte (el operario a su día, Administración a
// su hub). La cookie de obra sólo existe para quien eligió obra en `/obra/*`, o sea el jefe.
export function VolverDeCampo() {
  const obra = useObraRecordada()
  return (
    <Link
      href={obra ? `/obra/hoy?obra=${encodeURIComponent(obra)}` : '/campo'}
      prefetch={false}
      data-testid="volver"
      className="-ml-1 inline-flex min-h-[44px] items-center px-1 text-[12px] text-muted hover:text-ink"
    >
      ← Volver
    </Link>
  )
}

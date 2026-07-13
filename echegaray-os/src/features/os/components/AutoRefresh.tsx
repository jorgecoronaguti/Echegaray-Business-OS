'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Refresca la página cada N segundos para que las respuestas del OS (que se
// procesan en segundo plano) aparezcan solas, sin recargar a mano.
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
